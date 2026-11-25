import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HealthMonitor, parseRetryAfterMs, STATUS_HEALTHY, statusRank } from './utils/healthCheck.js';
import { isTransientFailure } from './utils/http.js';
import { ModelCatalog } from './utils/catalog.js';
import { buildCatalog, classifyModel, summaryByCategory } from './utils/ranking.js';
import createAnonymousProvider from './providers/anonymous.js';
import createFreellmpoolProvider from './providers/freellmpool.js';
import createGeminiOauthProvider from './providers/gemini-oauth.js';
import createLlm7Provider from './providers/llm7.js';
import createOvhcloudProvider from './providers/ovhcloud.js';
import createKiloProvider from './providers/kilo.js';
import createByokProvider, { BYOK_PRESETS } from './providers/byok.js';

const here = dirname(fileURLToPath(import.meta.url));

export const PROVIDER_TYPES = {
  anonymous: createAnonymousProvider,
  freellmpool: createFreellmpoolProvider,
  'gemini-oauth': createGeminiOauthProvider,
  llm7: createLlm7Provider,
  ovhcloud: createOvhcloudProvider,
  kilo: createKiloProvider,
  byok: createByokProvider,
};

const COOLDOWnable_STATUSES = new Set([429, 402, 403, 408, 503]);
const MODEL_DEAD_STATUSES = new Set([400, 404]);

export function deepMerge(base, overrides) {
  if (!overrides || typeof overrides !== 'object') return { ...base };
  const out = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
      out[key] = deepMerge(base[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export async function loadConfig(userConfigPath) {
  const defaults = JSON.parse(await readFile(join(here, 'config', 'default.json'), 'utf8'));
  const paths = userConfigPath ? [userConfigPath] : [join(homedir(), '.dsh', 'freeflow.json')];
  let overrides = {};
  for (const p of paths) {
    try {
      overrides = deepMerge(overrides, JSON.parse(await readFile(p, 'utf8')));
    } catch {
      void p;
    }
  }
  return deepMerge(defaults, overrides);
}

export function instantiateProviders(config) {
  const instances = [];
  for (const [id, providerConfig] of Object.entries(config.providers || {})) {
    if (providerConfig.enabled === false) continue;
    const type = providerConfig.type || (PROVIDER_TYPES[id] ? id : providerConfig.preset ? 'byok' : null);
    const factory = type ? PROVIDER_TYPES[type] : null;
    if (!factory) continue;
    instances.push(factory({ id, ...providerConfig }));
  }
  return instances;
}

export function parseModelTarget(model, providerIds = []) {
  if (typeof model !== 'string' || !model) return { providerId: null, model: undefined };
  const idx = model.indexOf('/');
  if (idx > 0) {
    const prefix = model.slice(0, idx);
    if (providerIds.includes(prefix)) return { providerId: prefix, model: model.slice(idx + 1) };
  }
  return { providerId: null, model };
}

export function buildOrder(config, providers, health, now = Date.now()) {
  const eligible = providers.filter((p) => !health.inCooldown(p.id, now) || p.id === config.defaultProvider);
  const available = eligible.filter((p) => {
    const snap = health.snapshot(p.id);
    if (!snap || !snap.status) return true;
    if (snap.lastCheckAt === null) return true;
    return statusRank(snap.status) < statusRank('unavailable');
  });
  const head = available.some((p) => p.id === config.defaultProvider) ? [config.defaultProvider] : [];
  const rest = available.map((p) => p.id).filter((id) => !head.includes(id));
  const byHealth = (a, b) => {
    const sa = health.snapshot(a) || { status: 'unavailable', latencyMs: null };
    const sb = health.snapshot(b) || { status: 'unavailable', latencyMs: null };
    const rank = statusRank(sa.status) - statusRank(sb.status);
    if (rank !== 0) return rank;
    const la = sa.latencyMs ?? Number.MAX_SAFE_INTEGER;
    const lb = sb.latencyMs ?? Number.MAX_SAFE_INTEGER;
    return la - lb;
  };
  return [...head, ...rest.sort(byHealth)];
}

export function createFreeflow(config = {}, { logger = console.error } = {}) {
  const providers = instantiateProviders(config);
  const health = new HealthMonitor({ ...config.healthCheck, quota: config.quota });
  health.providerList = () => providers;
  for (const p of providers) health.register(p);
  const catalog = new ModelCatalog(config.catalog);

  async function listProviderModelEntries(provider) {
    try {
      const ids = await provider.listModels();
      const listed = [];
      for (const id of ids) {
        if (catalog.isListed(provider.id, id)) listed.push(id);
      }
      catalog.prune(provider.id, ids);
      return listed;
    } catch (error) {
      logger(`listModels(${provider.id}) failed: ${error.message}`);
      return [];
    }
  }

  async function listAllModels() {
    const entries = [];
    for (const p of providers) {
      for (const id of await listProviderModelEntries(p)) {
        entries.push({ id: `${p.id}/${id}`, upstream_model: id, provider: p.id, label: `${p.label} - ${id}` });
      }
    }
    return buildCatalog({ providers, health, listing: entries });
  }

  async function refreshCatalog() {
    const report = { checkedAt: new Date().toISOString(), providers: [] };
    for (const p of providers) {
      const info = p.availability ? await p.availability() : { status: null };
      try {
        const ids = await p.listModels();
        catalog.prune(p.id, ids);
        report.providers.push({ id: p.id, status: info.status || 'ok', models: ids.length });
      } catch (error) {
        report.providers.push({ id: p.id, status: 'error', models: 0, error: error.message });
      }
    }
    return report;
  }

  async function verifyAll() {
    const healthReport = await health.checkAll();
    const catalogReport = await refreshCatalog();
    return { checkedAt: new Date().toISOString(), health: healthReport, catalog: catalogReport };
  }

  async function routeChat(request, { signal } = {}) {
    const { providerId, model } = parseModelTarget(request.model, providers.map((p) => p.id));
    const body = { ...request };
    if (model) body.model = model;
    let order = buildOrder(config, providers, health);
    if (providerId) order = order.includes(providerId) ? [providerId] : [];
    const attempts = [];
    for (const id of order) {
      const provider = providers.find((p) => p.id === id);
      const started = Date.now();
      try {
        const res = await provider.chat(body, { signal, timeoutMs: config.upstreamTimeoutMs });
        if (res.ok) {
          health.record(id, { ok: true, latencyMs: Date.now() - started });
          return { res, providerId: id, attempts };
        }
        const status = res.status;
        const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'));
        const transient = isTransientFailure(null, status);
        health.record(id, { ok: !transient, latencyMs: Date.now() - started, error: `upstream ${status}` });
        if (COOLDOWnable_STATUSES.has(status)) {
          health.cooldown(id, retryAfterMs ?? 60000, `upstream ${status}`);
        }
        if (MODEL_DEAD_STATUSES.has(status)) {
          catalog.markUnavailable(id, model || request.model || '', { reason: `upstream ${status}` });
        }
        if (!transient) return { res, providerId: id, attempts };
        attempts.push({ id, error: `upstream ${status}` });
      } catch (error) {
        health.record(id, { ok: false, latencyMs: Date.now() - started, error: error.message });
        attempts.push({ id, error: error.message });
        if (signal?.aborted) throw error;
      }
    }
    const error = new Error(
      `all providers failed. attempts: ${attempts.length ? attempts.map((a) => `${a.id} (${a.error})`).join('; ') : 'none available'}`
    );
    error.status = 502;
    error.attempts = attempts;
    throw error;
  }

  async function listen({ host, port } = {}) {
    const server = http.createServer((req, res) => {
      handleRequest({ req, res, config, health, providers, catalog, routeChat, listAllModels, verifyAll }).catch((error) => {
        logger(`request error: ${error.message}`);
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: { message: error.message } }));
        } else {
          res.end();
        }
      });
    });
    const listenHost = host || config.server?.host || '127.0.0.1';
    const listenPort = port ?? config.server?.port ?? 8787;
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(listenPort, listenHost, () => {
        server.removeListener('error', reject);
        logger(`dsh-freeflow gateway listening on http://${listenHost}:${server.address().port}`);
        resolve(server);
      });
    });
    return server;
  }

  return {
    config,
    providers,
    health,
    catalog,
    routeChat,
    listAllModels,
    refreshCatalog,
    verifyAll,
    listen,
    start: () => {
      health.start();
      for (const p of providers) health.probe(p.id).catch(() => null);
    },
    stop: () => health.stop(),
  };
}

function authorized(req, config) {
  const apiKey = config.server?.apiKey;
  if (!apiKey) return true;
  const header = req.headers.authorization || '';
  return header === `Bearer ${apiKey}`;
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function extractUsage(health, providerId, rawBody) {
  const usage = { tokensIn: 0, tokensOut: 0 };
  try {
    if (rawBody) {
      const parsed = JSON.parse(rawBody);
      if (parsed.usage) {
        usage.tokensIn = parsed.usage.prompt_tokens || 0;
        const completion = parsed.usage.completion_tokens || parsed.usage.generated_tokens || 0;
        usage.tokensOut = completion || Math.max((parsed.usage.total_tokens || 0) - usage.tokensIn, 0);
      }
    }
  } catch {
    void usage;
  }
  health.countUsage(providerId, usage);
}

async function handleRequest({ req, res, config, health, providers, catalog, routeChat, listAllModels, verifyAll }) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const path = url.pathname;

  res.setHeader('access-control-allow-origin', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'authorization, content-type' });
    return res.end();
  }

  if (path === '/healthz' || path === '/livez') {
    sendJson(res, 200, { ok: true, service: 'dsh-freeflow', brand: 'VuDube', version: '0.2.0' });
    return;
  }

  if (path === '/freeflow/verify' && req.method === 'POST') {
    if (!authorized(req, config)) return sendJson(res, 401, { error: { message: 'unauthorized' } });
    return sendJson(res, 200, await verifyAll());
  }

  if (path === '/freeflow/status') {
    sendJson(res, 200, {
      brand: 'VuDube',
      version: '0.2.0',
      defaultProvider: config.defaultProvider,
      autoFailover: config.autoFailover,
      providers: health.snapshot(),
      modelCooldowns: catalog.report().filter((m) => m.unavailable),
    });
    return;
  }

  if (path === '/freeflow/catalog') {
    const data = await listAllModels();
    sendJson(res, 200, { checkedAt: new Date().toISOString(), total: data.length, categories: summaryByCategory(data), data });
    return;
  }

  if (path === '/readyz') {
    const snap = health.snapshot();
    const ready = Object.values(snap).some((s) => s.status === STATUS_HEALTHY);
    sendJson(res, ready ? 200 : 503, { ready, providers: snap });
    return;
  }

  if (!authorized(req, config)) {
    return sendJson(res, 401, { error: { message: 'unauthorized' } });
  }

  if (path === '/v1/models' && req.method === 'GET') {
    const data = await listAllModels();
    sendJson(res, 200, { object: 'list', checkedAt: new Date().toISOString(), data: data.map(({ score, reasons, ...rest }) => rest) });
    return;
  }

  if (path === '/v1/chat/completions' && req.method === 'POST') {
    let request;
    try {
      request = await readRequestBody(req);
    } catch {
      return sendJson(res, 400, { error: { message: 'invalid JSON body' } });
    }
    if (request.stream && config.streaming === false) request.stream = false;
    try {
      const { res: upstream, providerId, attempts } = await routeChat(request);
      const headers = {
        'content-type': upstream.headers.get('content-type') || 'application/json',
        'x-freeflow-provider': providerId,
      };
      if (request.stream) headers['cache-control'] = 'no-cache';
      if (attempts.length) headers['x-freeflow-failover-attempts'] = attempts.map((a) => a.id).join(',');
      res.writeHead(upstream.status || 200, headers);
      const isStream = request.stream && (upstream.headers.get('content-type') || '').includes('text/event-stream');
      if (isStream) {
        let tokensOut = 0;
        let buffer = '';
        for await (const chunk of upstream.body) {
          buffer += chunk.toString();
          res.write(chunk);
          const matches = buffer.matchAll(/"(?:completion_tokens|generated_tokens)":\s*(\d+)/g);
          for (const m of matches) tokensOut = Math.max(tokensOut, Number(m[1]));
          if (buffer.length > 65536) buffer = buffer.slice(-4096);
        }
        res.end();
        health.countUsage(providerId, { tokensOut });
      } else {
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.end(buf);
        extractUsage(health, providerId, buf.toString());
      }
      return;
    } catch (error) {
      const status = error.status || 502;
      return sendJson(res, status, { error: { message: error.message, attempts: error.attempts } });
    }
  }

  sendJson(res, 404, { error: { message: `no route: ${req.method} ${path}` } });
}

export default {
  name: 'dsh-freeflow',
  version: '0.2.0',
  brand: 'VuDube',
  loadConfig,
  createFreeflow,
  providers: PROVIDER_TYPES,
  byokPresets: BYOK_PRESETS,
  classifyModel,
};
