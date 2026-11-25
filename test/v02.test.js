import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HealthMonitor, parseRetryAfterMs, utcDayKey, STATUS_EXHAUSTED, STATUS_HEALTHY, STATUS_LOW_QUOTA, STATUS_UNAVAILABLE } from '../src/utils/healthCheck.js';
import { ModelCatalog } from '../src/utils/catalog.js';
import { classifyModel, buildCatalog, summaryByCategory, rankModel } from '../src/utils/ranking.js';
import { BYOK_PRESETS } from '../src/providers/byok.js';
import createKiloProvider from '../src/providers/kilo.js';
import { instantiateProviders, parseModelTarget, buildOrder, createFreeflow } from '../src/index.js';

const baseConfigGroqFirst = {
  defaultProvider: 'groq',
  autoFailover: true,
  streaming: true,
  server: { host: '127.0.0.1', port: 0 },
  providers: {
    groq: { enabled: true },
    anonymous: { enabled: true },
  },
  healthCheck: { intervalMs: 60000, timeoutMs: 200, degradedAboveMs: 2000 },
};

test('parseRetryAfterMs handles seconds and HTTP dates', () => {
  assert.equal(parseRetryAfterMs('30'), 30000);
  assert.equal(parseRetryAfterMs('0'), 0);
  const future = new Date(Date.now() + 15000).toUTCString();
  const delta = parseRetryAfterMs(future);
  assert.ok(delta > 12000 && delta <= 15010);
  assert.equal(parseRetryAfterMs('garbage'), null);
  assert.equal(parseRetryAfterMs(null), null);
  assert.ok(parseRetryAfterMs('999999999') <= 24 * 3600 * 1000);
});

test('cooldown set, block, and auto-expire', () => {
  const monitor = new HealthMonitor();
  monitor.register({ id: 'a' });
  monitor.cooldown('a', 1000, '429');
  assert.equal(monitor.inCooldown('a', Date.now() + 1), true);
  assert.equal(monitor.inCooldown('a', Date.now() + 2000), false);
  assert.equal(monitor.snapshot('a').cooldownUntil, null);
});

test('quota counters increment, roll over at UTC midnight, and exhaust', () => {
  const monitor = new HealthMonitor({ quota: { a: { dailyRequestCap: 3, dailyTokenCap: 100 } } });
  monitor.register({ id: 'a' });
  monitor.record('a', { ok: true, latencyMs: 10 });
  assert.equal(monitor.snapshot('a').status, STATUS_HEALTHY);
  monitor.countUsage('a', { tokensIn: 30, tokensOut: 20 });
  assert.equal(monitor.snapshot('a').status, STATUS_HEALTHY);
  monitor.countUsage('a', { tokensIn: 30, tokensOut: 10 });
  assert.equal(monitor.snapshot('a').status, STATUS_LOW_QUOTA);
  monitor.countUsage('a', { tokensIn: 10, tokensOut: 5 });
  assert.equal(monitor.snapshot('a').status, STATUS_EXHAUSTED);
  const usage = monitor.snapshot('a').usage;
  assert.equal(usage.requests, 3);
  assert.equal(usage.tokensIn + usage.tokensOut, 105);
  assert.equal(usage.day, utcDayKey());
  const entry = monitor.providers.get('a');
  entry.usage.day = '2000-01-01';
  monitor.rolloverQuota();
  assert.equal(monitor.providers.get('a').usage.requests, 0);
  assert.equal(monitor.snapshot('a').status, STATUS_HEALTHY);
});

test('buildOrder excludes cooling providers but honors the default pin', () => {
  const monitor = new HealthMonitor({});
  monitor.register({ id: 'a' });
  monitor.register({ id: 'b' });
  monitor.record('a', { ok: true, latencyMs: 100 });
  monitor.record('b', { ok: true, latencyMs: 120 });
  monitor.cooldown('b', 60000, '429');
  const providers = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(buildOrder({ defaultProvider: 'a', autoFailover: true }, providers, monitor), ['a']);
  assert.deepEqual(buildOrder({ defaultProvider: 'b', autoFailover: true }, providers, monitor), ['b', 'a']);
  monitor.cooldown('a', 60000, '429');
  assert.deepEqual(buildOrder({ defaultProvider: 'a', autoFailover: true }, providers, monitor), ['a']);
});

test('ModelCatalog freshness: cooldown excludes from listing, expires, prunes stale', () => {
  const catalog = new ModelCatalog({ modelCooldownMs: 1000 });
  assert.deepEqual(catalog.listing('p', ['m1', 'm2']), ['m1', 'm2']);
  catalog.markUnavailable('p', 'm1', { reason: 'test' });
  assert.deepEqual(catalog.listing('p', ['m1', 'm2']), ['m2']);
  const future = Date.now() + 2000;
  assert.equal(catalog.inCooldown('p', 'm1', future), false);
  assert.equal(catalog.isListed('p', 'm1', future), true);
  assert.ok(catalog.prune('p', ['m2']).includes('m1'));
});

test('ModelCatalog reports unavailable models with reasons', () => {
  const catalog = new ModelCatalog({});
  catalog.markUnavailable('p', 'bad-model', { reason: 'upstream 400' });
  const report = catalog.report().find((m) => m.id === 'bad-model');
  assert.ok(report.unavailable.reason.includes('400'));
});

test('classifyModel covers every practical family', () => {
  assert.equal(classifyModel('deepseek-r1-distill'), 'reasoning');
  assert.equal(classifyModel('codestral-latest'), 'coder');
  assert.equal(classifyModel('qwen2.5-vl-72b-instruct'), 'vision');
  assert.equal(classifyModel('whisper-large-v3'), 'audio');
  assert.equal(classifyModel('stable-diffusion-xl-base-v10'), 'image');
  assert.equal(classifyModel('text-embedding-3'), 'embedding');
  assert.equal(classifyModel('gpt-oss-120b'), 'large');
  assert.equal(classifyModel('mimo-v2.6-flash-free'), 'fast');
  assert.equal(classifyModel('some-unknown-bot'), 'chat');
});

test('buildCatalog ranks by score and assigns sequential ranks', () => {
  const listing = [
    { id: 'groq/model-x', upstream_model: 'model-x', provider: 'groq', tier: 'byok' },
    { id: 'llm7/gpt-oss:20b', upstream_model: 'gpt-oss:20b', provider: 'llm7', tier: 'keyless' },
  ];
  const health = {
    snapshot: (id) => (id === 'groq' ? { status: 'healthy', latencyMs: 50 } : { status: 'healthy', latencyMs: 150 }),
  };
  const catalog = buildCatalog({ providers: [{ id: 'groq', tier: 'byok' }, { id: 'llm7', tier: 'keyless' }], health, listing });
  assert.equal(catalog[0].rank, 1);
  assert.equal(catalog[1].rank, 2);
  assert.equal(catalog[0].score, Math.max(...catalog.map((m) => m.score)));
  assert.deepEqual(summaryByCategory(catalog), Object.fromEntries(Object.entries(summaryByCategory(catalog))));
});

test('rankModel penalizes exhausted providers hardest', () => {
  const model = { tier: 'keyless', category: 'chat' };
  const good = rankModel(model, { status: 'healthy', latencyMs: 100 });
  const dead = rankModel(model, { status: 'unavailable', latencyMs: null });
  const spent = rankModel(model, { status: STATUS_EXHAUSTED, latencyMs: 100 });
  assert.ok(good.score > spent.score);
  assert.ok(spent.score > dead.score);
  assert.ok(good.reasons.length > 0);
});

test('BYOK presets cover all five required providers with correct base URLs', () => {
  assert.equal(BYOK_PRESETS.groq.baseUrl, 'https://api.groq.com/openai/v1');
  assert.equal(BYOK_PRESETS.gemini.baseUrl, 'https://generativelanguage.googleapis.com/v1beta/openai');
  assert.equal(BYOK_PRESETS.nvidia.baseUrl, 'https://integrate.api.nvidia.com/v1');
  assert.equal(BYOK_PRESETS.openrouter.baseUrl, 'https://openrouter.ai/api/v1');
  assert.equal(BYOK_PRESETS.cloudflare.baseUrl, 'https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/v1');
  for (const preset of Object.values(BYOK_PRESETS)) {
    assert.ok(preset.apiKeyEnv, `${preset.id} must define an apiKeyEnv fallback`);
    assert.equal(preset.tier, 'byok');
  }
});

test('instantiateProviders resolves explicit type, bare name, and preset fallback', () => {
  const config = {
    providers: {
      llm7: { enabled: true, baseUrl: 'https://api.llm7.io/v1' },
      groq: { preset: 'groq', apiKey: 'k' },
      unknown_custom: { enabled: false, baseUrl: 'x' },
      ghost: { enabled: true, baseUrl: 'x' },
    },
  };
  const ids = instantiateProviders(config).map((p) => p.id);
  assert.ok(ids.includes('llm7'));
  assert.ok(ids.includes('groq'));
  assert.ok(!ids.includes('unknown_custom'));
  assert.ok(!ids.includes('ghost'));
});

test('kilo lists only isFree models when keyless, full catalog with a key', async (t) => {
  const realFetch = globalThis.fetch;
  const modelList = [
    { id: 'kilo-auto/free', isFree: true },
    { id: 'nvidia/nemotron-3.5-super-vl:free', isFree: true },
    { id: 'kilo-auto/efficient', isFree: false },
  ];
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ data: modelList }) });
  t.after(() => { globalThis.fetch = realFetch; });
  const keyless = createKiloProvider();
  const ids = await keyless.listModels();
  assert.deepEqual(ids.sort(), ['kilo-auto/free', 'nvidia/nemotron-3.5-super-vl:free']);
  const authed = createKiloProvider({ apiKey: 'k' });
  const all = await authed.listModels();
  assert.equal(all.length, 3);
});

test('routeChat skips a no-retry provider and still fails over', async () => {
  const calls = [];
  const misconfigured = {
    id: 'groq',
    label: 'G',
    chat: async () => {
      calls.push('groq');
      const error = new Error('no API key configured for groq');
      error.status = 503;
      error.noRetry = true;
      throw error;
    },
    probe: async () => false,
    listModels: async () => [],
  };
  const fallback = {
    id: 'anonymous',
    label: 'A',
    chat: async () => {
      calls.push('anonymous');
      return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('{}') };
    },
    probe: async () => true,
    listModels: async () => [],
  };
  const config = { ...baseConfigGroqFirst };
  const freeflow = createFreeflow(config);
  freeflow.providers.length = 0;
  freeflow.providers.push(misconfigured, fallback);
  freeflow.health.providerList = () => [misconfigured, fallback];
  const result = await freeflow.routeChat({ model: 'x', messages: [] });
  assert.equal(result.providerId, 'anonymous');
  assert.deepEqual(calls, ['groq', 'anonymous']);
});

test('gateway counts tokens for non-streaming chats', async () => {
  const { createServer } = await import('node:http');
  const upstream = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'pong' } }], usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 } }));
  });
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
  const upstreamUrl = `http://127.0.0.1:${upstream.address().port}/v1`;
  const config = {
    defaultProvider: 'kilo',
    server: { host: '127.0.0.1', port: 0 },
    providers: { kilo: { enabled: true, type: 'byok', baseUrl: upstreamUrl, apiKey: 'k' } },
    healthCheck: { intervalMs: 60000 },
  };
  const freeflow = createFreeflow(config);
  const server = await freeflow.listen({ port: 0 });
  const port = server.address().port;
  const r = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', connection: 'close' },
    body: JSON.stringify({ model: 'kilo/x', messages: [] }),
  });
  await r.text();
  const usage = freeflow.health.snapshot('kilo').usage;
  assert.equal(usage.requests, 1);
  assert.equal(usage.tokensIn, 5);
  assert.equal(usage.tokensOut, 7);
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => upstream.close(resolve));
});

test('parseModelTarget accepts dynamic instance ids', () => {
  assert.deepEqual(parseModelTarget('groq/mixtral', ['groq', 'llm7']), { providerId: 'groq', model: 'mixtral' });
  assert.deepEqual(parseModelTarget('a/b/c', ['a']), { providerId: 'a', model: 'b/c' });
  assert.deepEqual(parseModelTarget('nomatch/x', ['other']), { providerId: null, model: 'nomatch/x' });
});

test('unconfigured BYOK providers surface actionable unavailability', async () => {
  const [groq] = instantiateProviders({ providers: { groq: { preset: 'groq' } } });
  const info = await groq.availability();
  assert.equal(info.status, STATUS_UNAVAILABLE);
  assert.match(info.reason, /GROQ_API_KEY/);
});

test('cloudflare interpolation and missing-accountId error paths', async () => {
  const [ok] = instantiateProviders({ providers: { cloudflare: { preset: 'cloudflare', accountId: 'abc123', apiKey: 'token' } } });
  const info = await ok.availability();
  assert.equal(info.status, null);
  const [missing] = instantiateProviders({ providers: { cloudflare: { preset: 'cloudflare' } } });
  await assert.rejects(
    () => missing.chat({ messages: [] }),
    (error) => error.status === 503 && error.noRetry === true
  );
});
