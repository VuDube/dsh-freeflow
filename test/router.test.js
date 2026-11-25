import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOrder, createFreeflow, loadConfig, parseModelTarget } from '../src/index.js';

const baseConfig = {
  defaultProvider: 'anonymous',
  autoFailover: true,
  streaming: true,
  server: { host: '127.0.0.1', port: 0 },
  providers: {
    anonymous: { enabled: true },
    freellmpool: { enabled: true },
    'gemini-oauth': { enabled: false },
  },
  healthCheck: { intervalMs: 60000, timeoutMs: 200, degradedAboveMs: 2000 },
};

test('parseModelTarget routes provider-prefixed models and strips the prefix', () => {
  assert.deepEqual(parseModelTarget('freellmpool/gpt-x'), { providerId: 'freellmpool', model: 'gpt-x' });
  assert.deepEqual(parseModelTarget('some/openai-style-id'), { providerId: null, model: 'some/openai-style-id' });
  assert.deepEqual(parseModelTarget(''), { providerId: null, model: undefined });
});

test('buildOrder pins the default provider first, then health rank then latency', () => {
  const config = { ...baseConfig };
  const mk = (id) => ({ id });
  const providers = [mk('anonymous'), mk('freellmpool')];
  const health = { snapshot: () => ({}) };
  assert.deepEqual(buildOrder(config, providers, health), ['anonymous', 'freellmpool']);

  const latencyHealth = {
    snapshot: (id) => (id === 'anonymous' ? { status: 'healthy', latencyMs: 900 } : { status: 'healthy', latencyMs: 120 }),
    snapshotOf: null,
  };
  assert.deepEqual(buildOrder(config, providers, latencyHealth), ['anonymous', 'freellmpool']);
  const noPin = { ...config, defaultProvider: null };
  assert.deepEqual(buildOrder(noPin, providers, latencyHealth), ['freellmpool', 'anonymous']);
});

test('routeChat fails over to the next provider when one is down', async () => {
  const calls = [];
  const fakeA = {
    id: 'anonymous',
    label: 'A',
    chat: async () => {
      calls.push('a');
      throw new Error('connection refused');
    },
    probe: async () => false,
    listModels: async () => [],
  };
  const fakeB = {
    id: 'freellmpool',
    label: 'B',
    chat: async () => {
      calls.push('b');
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => Buffer.from('{}'),
      };
    },
    probe: async () => true,
    listModels: async () => [],
  };

  const freeflow = createFreeflow(baseConfig);
  freeflow.providers.length = 0;
  freeflow.providers.push(fakeA, fakeB);
  freeflow.health.providerList = () => [fakeA, fakeB];

  const result = await freeflow.routeChat({ model: 'qwen-3', messages: [] });
  assert.equal(result.providerId, 'freellmpool');
  assert.deepEqual(calls, ['a', 'b']);
  assert.equal(result.attempts.length, 1);
  assert.match(result.attempts[0].error, /connection refused/);
});

test('routeChat forces a pinned provider, 404-style non-transient status included', async () => {
  let calls = 0;
  const fake = {
    id: 'freellmpool',
    label: 'B',
    chat: async () => {
      calls += 1;
      return { ok: false, status: 400, arrayBuffer: async () => Buffer.from('{"error":{}}'), headers: new Map([['content-type', 'application/json']]) };
    },
    probe: async () => true,
    listModels: async () => [],
  };
  const freeflow = createFreeflow(baseConfig);
  freeflow.providers.length = 0;
  freeflow.providers.push(fake);
  freeflow.health.providerList = () => [fake];

  const result = await freeflow.routeChat({ model: 'freellmpool/test-model', messages: [] });
  assert.equal(result.providerId, 'freellmpool');
  assert.equal(result.attempts.length, 0);
  assert.equal(calls, 1);
});

test('routeChat throws 502 with per-provider attempts when everything fails', async () => {
  const mk = (id) => ({
    id,
    label: id,
    chat: async () => {
      throw new Error(`${id} down`);
    },
    probe: async () => false,
    listModels: async () => [],
  });
  const freeflow = createFreeflow(baseConfig);
  freeflow.providers.length = 0;
  freeflow.providers.push(mk('anonymous'), mk('freellmpool'));
  freeflow.health.providerList = () => freeflow.providers;

  await assert.rejects(() => freeflow.routeChat({ messages: [] }), (error) => {
    assert.equal(error.status, 502);
    assert.equal(error.attempts.length, 2);
    return true;
  });
});

test('loadConfig merges user overrides over shipped defaults', async () => {
  const os = await import('node:os');
  const { join } = await import('node:path');
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const dir = await mkdtemp(join(os.tmpdir(), 'freeflow-cfg-'));
  const file = join(dir, 'freeflow.json');
  await writeFile(file, JSON.stringify({ defaultProvider: 'freellmpool', server: { port: 9999 } }));
  const config = await loadConfig(file);
  assert.equal(config.defaultProvider, 'freellmpool');
  assert.equal(config.server.port, 9999);
  assert.equal(config.autoFailover, true);
  assert.ok(config.providers.anonymous.enabled);
});
