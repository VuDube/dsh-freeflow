import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HealthMonitor, STATUS_HEALTHY, statusRank } from './utils/healthCheck.js';
import { isTransientFailure } from './utils/http.js';
import createAnonymousProvider from './providers/anonymous.js';
import createFreellmpoolProvider from './providers/freellmpool.js';
import createGeminiOauthProvider from './providers/gemini-oauth.js';

const here = dirname(fileURLToPath(import.meta.url));

const PROVIDER_FACTORIES = {
  anonymous: createAnonymousProvider,
  freellmpool: createFreellmpoolProvider,
  'gemini-oauth': createGeminiOauthProvider,
};

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

export function buildOrder(config, providers, health) {
  const enabled = providers.filter((p) => config.providers[p.id]?.enabled !== false);
  const ids = new Set(enabled.map((p) => p.id));
  const head = ids.has(config.defaultProvider) ? [config.defaultProvider] : [];
  const rest = enabled.map((p) => p.id).filter((id) => !head.includes(id));
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

export function parseModelTarget(model) {
  if (typeof model !== 'string' || !model) return { providerId: null, model: undefined };
  const idx = model.indexOf('/');
  if (idx > 0) {
    const prefix = model.slice(0, idx);
    if (prefix in PROVIDER_FACTORIES) return { providerId: prefix, model: model.slice(idx + 1) };
  }
  return { providerId: null, model };
}

export function createFreeflow(config = {}, { logger = console.error } = {}) {
  const providers = Object.keys(PROVIDER_FACTORIES)
    .filter((id) => config.providers[id]?.enabled !== false)
    .map((id) => PROVIDER_FACTORIES[id](config.providers[id] || {}));
  const health = new HealthMonitor({ ...config.healthCheck });
  health.providerList = () => providers;
  for (const p of providers) health.register(p);

  async function routeChat(request, { signal } = {}) {
    const { providerId, model } = parseModelTarget(request.model);
    const body = { ...request };
    if (model) body.model = model;
    let order = buildOrder(config, providers, health);
    if (providerId) order = order.includes(providerId) ? [providerId] : [];
    if (!config.autoFailover && order.includes(config.defaultProvider)) {
      order = [config.defaultProvider];
    }
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
        const transient = isTransientFailure(null, res.status);
        health.record(id, { ok: !transient, latencyMs: Date.now() - started, error: `upstream ${res.status}` });
        if (!transient) return { res, providerId: id, attempts };
        attempts.push({ id, error: `upstream ${res.status}` });
      } catch (error) {
        health.record(id, { ok: false, latencyMs: Date.now() - started, error: error.message });
        attempts.push({ id, error: error.message });
        if (signal?.aborted) throw error;
      }
    }
    const error = new Error(
      `all providers failed. attempts: ${attempts.length ? attempts.map((a) => `${a.id} (${a.error})`).join('; ') : 'none enabled'}`
    );
    error.status = 502;
    error.attempts = attempts;
    throw error;
  }

  async function listAllModels() {
    const models = [];
    for (const p of providers) {
      try {
        const ids = await p.listModels();
        for (const id of ids) {
          models.push({ id: `${p.id}/${id}`, object: 'model', provider: p.id, upstream_model: id, label: `${p.label} - ${id}` });
        }
      } catch (error) {
        logger(`listModels(${p.id}) failed: ${error.message}`);
      }
    }
    return models;
  }

  async function listen({ host, port } = {}) {
    const server = http.createServer((req, res) => {
      handleRequest({ req, res, config, health, providers, routeChat, listAllModels }).catch((error) => {
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
    routeChat,
    listAllModels,
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

async function handleRequest({ req, res, config, health, providers, routeChat, listAllModels }) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const path = url.pathname;

  res.setHeader('access-control-allow-origin', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'authorization, content-type' });
    return res.end();
  }

  if (path === '/healthz' || path === '/livez') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, service: 'dsh-freeflow', brand: 'VuDube' }));
  }

  if (path === '/readyz') {
    const snap = health.snapshot();
    const ready = Object.values(snap).some((s) => s.status === STATUS_HEALTHY);
    res.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ready, providers: snap }));
  }

  if (path === '/freeflow/status') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ brand: 'VuDube', defaultProvider: config.defaultProvider, autoFailover: config.autoFailover, providers: health.snapshot() }, null, 2));
  }

  if (!authorized(req, config)) {
    res.writeHead(401, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: { message: 'unauthorized' } }));
  }

  if (path === '/v1/models' && req.method === 'GET') {
    const data = await listAllModels();
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ object: 'list', data }));
  }

  if (path === '/v1/chat/completions' && req.method === 'POST') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    let request;
    try {
      request = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: 'invalid JSON body' } }));
    }
    if (request.stream && config.streaming === false) request.stream = false;
    try {
      const { res: upstream, providerId, attempts } = await routeChat(request);
      const headers = { 'content-type': upstream.headers.get('content-type') || 'application/json' };
      if (request.stream) headers['cache-control'] = 'no-cache';
      headers['x-freeflow-provider'] = providerId;
      if (attempts.length) {
        headers['x-freeflow-failover-attempts'] = attempts.map((a) => a.id).join(',');
      }
      res.writeHead(upstream.status || 200, headers);
      if (request.stream && (upstream.headers.get('content-type') || '').includes('text/event-stream')) {
        upstream.body.pipe(res);
        upstream.body.on('error', () => res.end());
      } else {
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.end(buf);
      }
      return;
    } catch (error) {
      const status = error.status || 502;
      res.writeHead(status, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: error.message, attempts: error.attempts } }));
    }
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: { message: `no route: ${req.method} ${path}` } }));
}

export default {
  name: 'dsh-freeflow',
  version: '0.1.0',
  brand: 'VuDube',
  loadConfig,
  createFreeflow,
  providers: PROVIDER_FACTORIES,
};
