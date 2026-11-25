import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HealthMonitor, STATUS_DEGRADED, STATUS_HEALTHY, STATUS_UNAVAILABLE, classifyProbe, statusRank } from '../src/utils/healthCheck.js';

test('classifyProbe maps outcomes to statuses', () => {
  assert.equal(classifyProbe({ ok: true, latencyMs: 100 }).status, STATUS_HEALTHY);
  assert.equal(classifyProbe({ ok: true, latencyMs: 5000, degradedAboveMs: 2000 }).status, STATUS_DEGRADED);
  assert.equal(classifyProbe({ ok: false, latencyMs: 10 }).status, STATUS_UNAVAILABLE);
});

test('statusRank orders providers for the router', () => {
  assert.ok(statusRank(STATUS_HEALTHY) < statusRank(STATUS_DEGRADED));
  assert.ok(statusRank(STATUS_DEGRADED) < statusRank(STATUS_UNAVAILABLE));
  assert.equal(statusRank('bogus'), statusRank(STATUS_UNAVAILABLE));
});

test('record tracks healthy probes with latency EMA', () => {
  const monitor = new HealthMonitor({ degradedAboveMs: 2000 });
  monitor.register({ id: 'a', label: 'A' });
  monitor.record('a', { ok: true, latencyMs: 100 });
  monitor.record('a', { ok: true, latencyMs: 200 });
  const snap = monitor.snapshot('a');
  assert.equal(snap.status, STATUS_HEALTHY);
  assert.equal(snap.consecutiveFailures, 0);
  assert.ok(snap.latencyMs >= 100 && snap.latencyMs <= 200);
});

test('record marks failure state and recovers', () => {
  const monitor = new HealthMonitor();
  monitor.register({ id: 'a' });
  monitor.record('a', { ok: true, latencyMs: 50 });
  monitor.record('a', { ok: false, latencyMs: 10, error: 'boom' });
  let snap = monitor.snapshot('a');
  assert.equal(snap.status, STATUS_UNAVAILABLE);
  assert.equal(snap.consecutiveFailures, 1);
  assert.equal(snap.lastError, 'boom');
  monitor.record('a', { ok: true, latencyMs: 60 });
  snap = monitor.snapshot('a');
  assert.equal(snap.status, STATUS_HEALTHY);
  assert.equal(snap.consecutiveFailures, 0);
});

test('snapshot returns every registered provider', () => {
  const monitor = new HealthMonitor();
  monitor.register({ id: 'a' });
  monitor.register({ id: 'b' });
  const snap = monitor.snapshot();
  assert.deepEqual(Object.keys(snap).sort(), ['a', 'b']);
});
