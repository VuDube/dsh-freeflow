import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createFreeflow } from '../src/index.js';

const servers = [];
afterEach(async () => {
  await new Promise((resolve) => {
    let pending = servers.length;
    if (!pending) return resolve();
    for (const s of servers.splice(0)) s.close(() => { pending -= 1; if (!pending) resolve(); });
  });
});

function startUpstream(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function post(gatewayPort, body, path = '/v1/chat/completions') {
  return fetch(`http://127.0.0.1:${gatewayPort}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('gateway serves /v1/models, /readyz, and /freeflow/status', async () => {
  const upstream = await startUpstream((req, res) => {
    const pathname = req.url.split('?')[0];
    if (pathname === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ data: [{ id: 'auto' }, { id: 'groq/llama-3' }] }));
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  servers.push(upstream.server);

  const freeflow = createFreeflow({
    defaultProvider: 'anonymous',
    autoFailover: true,
    streaming: true,
    server: { host: '127.0.0.1', port: 0 },
    providers: {
      anonymous: { enabled: true, baseUrl: 'https://127.0.0.1:1/inference/v1' },
      freellmpool: { enabled: true, baseUrl: `http://127.0.0.1:${upstream.port}/v1` },
      'gemini-oauth': { enabled: false },
    },
    healthCheck: { intervalMs: 60000, timeoutMs: 500, degradedAboveMs: 2000 },
  });
  freeflow.start();
  const gateway = await freeflow.listen({ port: 0 });
  servers.push(gateway);
  const port = gateway.address().port;

  await freeflow.health.probe('freellmpool');
  const ready = await fetch(`http://127.0.0.1:${port}/readyz`);
  assert.equal(ready.status, 200);
  const readyBody = await ready.json();
  assert.equal(readyBody.ready, true);
  assert.equal(readyBody.providers.freellmpool.status, 'healthy');

  const status = await fetch(`http://127.0.0.1:${port}/freeflow/status`);
  assert.equal(status.status, 200);
  const statusBody = await status.json();
  assert.equal(statusBody.brand, 'VuDube');

  const models = await fetch(`http://127.0.0.1:${port}/v1/models`);
  const modelsBody = await models.json();
  const ids = modelsBody.data.map((m) => m.id);
  assert.ok(ids.includes('freellmpool/groq/llama-3') || ids.some((id) => id.startsWith('freellmpool/')));
});

test('gateway forwards authenticated non-stream chat and exposes provider header', async () => {
  const upstream = await startUpstream((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      const parsed = JSON.parse(raw || '{}');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ object: 'chat.completion', model: parsed.model, echo: parsed }));
    });
  });
  servers.push(upstream.server);

  const freeflow = createFreeflow({
    defaultProvider: 'freellmpool',
    autoFailover: true,
    streaming: true,
    server: { host: '127.0.0.1', port: 0 },
    providers: {
      anonymous: { enabled: false },
      freellmpool: { enabled: true, baseUrl: `http://127.0.0.1:${upstream.port}/v1` },
      'gemini-oauth': { enabled: false },
    },
    healthCheck: { intervalMs: 60000, timeoutMs: 500, degradedAboveMs: 2000 },
  });
  freeflow.start();
  const gateway = await freeflow.listen({ port: 0 });
  servers.push(gateway);
  const port = gateway.address().port;

  const res = await post(port, { model: 'qwen-3-235b', messages: [{ role: 'user', content: 'hi' }], stream: false });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-freeflow-provider'), 'freellmpool');
  const body = await res.json();
  assert.equal(body.model, 'qwen-3-235b');
  assert.equal(body.echo.model, 'qwen-3-235b');
});

test('gateway fails over from a dead provider to a live one', async () => {
  const upstream = await startUpstream((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ object: 'chat.completion', servedBy: 'freellmpool' }));
  });
  servers.push(upstream.server);

  const freeflow = createFreeflow({
    defaultProvider: 'anonymous',
    autoFailover: true,
    streaming: true,
    server: { host: '127.0.0.1', port: 0 },
    providers: {
      anonymous: { enabled: true, baseUrl: 'http://127.0.0.1:1/inference/v1' },
      freellmpool: { enabled: true, baseUrl: `http://127.0.0.1:${upstream.port}/v1` },
      'gemini-oauth': { enabled: false },
    },
    healthCheck: { intervalMs: 60000, timeoutMs: 500, degradedAboveMs: 2000 },
  });
  freeflow.start();
  const gateway = await freeflow.listen({ port: 0 });
  servers.push(gateway);
  const port = gateway.address().port;

  const res = await post(port, { model: 'qwen-3-235b', messages: [], stream: false });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-freeflow-provider'), 'freellmpool');
  const body = await res.json();
  assert.equal(body.servedBy, 'freellmpool');
});

test('gateway enforces optional bearer auth and returns 502 when all providers fail', async () => {
  const freeflow = createFreeflow({
    defaultProvider: 'anonymous',
    autoFailover: true,
    streaming: true,
    server: { host: '127.0.0.1', port: 0, apiKey: 'secret' },
    providers: {
      anonymous: { enabled: true, baseUrl: 'http://127.0.0.1:1/inference/v1' },
      freellmpool: { enabled: false },
      'gemini-oauth': { enabled: false },
    },
    healthCheck: { intervalMs: 60000, timeoutMs: 300, degradedAboveMs: 2000 },
  });
  freeflow.start();
  const gateway = await freeflow.listen({ port: 0 });
  servers.push(gateway);
  const port = gateway.address().port;

  const denied = await post(port, {});
  assert.equal(denied.status, 401);

  const authed = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: 'POST',
    headers: { authorization: 'Bearer secret', 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [] }),
  });
  assert.equal(authed.status, 502);
  const authedBody = await authed.json();
  assert.match(authedBody.error.message, /all providers failed/);
});
