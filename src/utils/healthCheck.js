export const STATUS_HEALTHY = 'healthy';
export const STATUS_DEGRADED = 'degraded';
export const STATUS_UNAVAILABLE = 'unavailable';
export const STATUS_LOW_QUOTA = 'low_quota';
export const STATUS_EXHAUSTED = 'exhausted';

const STATUS_RANK = {
  [STATUS_HEALTHY]: 0,
  [STATUS_LOW_QUOTA]: 1,
  [STATUS_DEGRADED]: 2,
  [STATUS_EXHAUSTED]: 3,
  [STATUS_UNAVAILABLE]: 4,
};

export function statusRank(status) {
  return STATUS_RANK[status] ?? STATUS_RANK[STATUS_UNAVAILABLE];
}

export function classifyProbe({ ok, latencyMs, degradedAboveMs }) {
  if (!ok) return { status: STATUS_UNAVAILABLE };
  if (degradedAboveMs && latencyMs > degradedAboveMs) return { status: STATUS_DEGRADED };
  return { status: STATUS_HEALTHY };
}

export function utcDayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function parseRetryAfterMs(value, now = Date.now()) {
  if (!value) return null;
  const asSeconds = Number(value);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) return Math.min(asSeconds * 1000, 24 * 3600 * 1000);
  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) return Math.min(Math.max(asDate - now, 0), 24 * 3600 * 1000);
  return null;
}

export class HealthMonitor {
  constructor({
    intervalMs = 30000,
    timeoutMs = 4000,
    latencyWindow = 8,
    degradedAboveMs = 2000,
    quota = {},
    logger = null,
  } = {}) {
    this.intervalMs = intervalMs;
    this.timeoutMs = timeoutMs;
    this.latencyWindow = latencyWindow;
    this.degradedAboveMs = degradedAboveMs;
    this.quota = quota;
    this.logger = logger;
    this.providers = new Map();
    this.timer = null;
    this.inFlight = false;
  }

  register(provider) {
    this.providers.set(provider.id, {
      id: provider.id,
      label: provider.label || provider.id,
      status: STATUS_UNAVAILABLE,
      latencyMs: null,
      lastCheckAt: null,
      lastError: null,
      consecutiveFailures: 0,
      samples: [],
      cooldownUntil: null,
      cooldownReason: null,
      usage: { day: utcDayKey(), requests: 0, tokensIn: 0, tokensOut: 0 },
    });
  }

  snapshot(providerId) {
    this.rolloverQuota();
    if (providerId) return this.providers.get(providerId) ?? null;
    return Object.fromEntries(this.providers);
  }

  ema(samples) {
    if (samples.length === 0) return null;
    const alpha = 2 / (this.latencyWindow + 1);
    let ema = samples[0];
    for (const value of samples.slice(1)) ema = alpha * value + (1 - alpha) * ema;
    return Math.round(ema);
  }

  rolloverQuota() {
    const today = utcDayKey();
    for (const entry of this.providers.values()) {
      if (entry.usage.day !== today) {
        entry.usage = { day: today, requests: 0, tokensIn: 0, tokensOut: 0 };
        if (entry.status === STATUS_EXHAUSTED || entry.status === STATUS_LOW_QUOTA) {
          entry.status = entry.latencyMs === null ? STATUS_UNAVAILABLE : STATUS_HEALTHY;
        }
      }
    }
  }

  record(providerId, { ok, latencyMs, error = null }) {
    const entry = this.providers.get(providerId);
    if (!entry) return null;
    entry.lastCheckAt = new Date().toISOString();
    entry.lastError = error;
    if (!ok) {
      entry.consecutiveFailures += 1;
      entry.samples = [];
      entry.latencyMs = null;
      entry.status = this.quotaStatus(entry) || STATUS_UNAVAILABLE;
      return entry;
    }
    entry.consecutiveFailures = 0;
    entry.samples.push(latencyMs);
    if (entry.samples.length > this.latencyWindow) entry.samples.shift();
    entry.latencyMs = this.ema(entry.samples);
    entry.status = this.quotaStatus(entry) || (latencyMs > this.degradedAboveMs ? STATUS_DEGRADED : STATUS_HEALTHY);
    return entry;
  }

  quotaCaps(providerId) {
    return this.quota[providerId] || this.providers.get(providerId)?.quota || null;
  }

  quotaStatus(entry) {
    const caps = this.quotaCaps(entry.id) || {};
    const { requests, tokensIn, tokensOut } = entry.usage;
    const tokens = tokensIn + tokensOut;
    const exhausted = (caps.dailyRequestCap && requests >= caps.dailyRequestCap)
      || (caps.dailyTokenCap && tokens >= caps.dailyTokenCap);
    if (exhausted) return STATUS_EXHAUSTED;
    const low = (caps.dailyRequestCap && requests >= 0.8 * caps.dailyRequestCap)
      || (caps.dailyTokenCap && tokens >= 0.8 * caps.dailyTokenCap);
    if (low) return STATUS_LOW_QUOTA;
    return null;
  }

  countUsage(providerId, { tokensIn = 0, tokensOut = 0 } = {}) {
    const entry = this.providers.get(providerId);
    if (!entry) return null;
    this.rolloverQuota();
    entry.usage.requests += 1;
    entry.usage.tokensIn += tokensIn;
    entry.usage.tokensOut += tokensOut;
    entry.status = this.quotaStatus(entry) || entry.status;
    return entry.usage;
  }

  cooldown(providerId, ms, reason = null) {
    const entry = this.providers.get(providerId);
    if (!entry) return null;
    entry.cooldownUntil = Date.now() + Math.max(0, Math.round(ms));
    entry.cooldownReason = reason;
    return entry;
  }

  inCooldown(providerId, now = Date.now()) {
    const entry = this.providers.get(providerId);
    if (!entry?.cooldownUntil) return false;
    if (entry.cooldownUntil <= now) {
      entry.cooldownUntil = null;
      entry.cooldownReason = null;
      return false;
    }
    return true;
  }

  async probe(providerId) {
    const provider = this.providerList().find((p) => p.id === providerId);
    if (!provider) throw new Error(`unknown provider: ${providerId}`);
    const started = Date.now();
    try {
      const ok = await provider.probe(this.timeoutMs);
      return this.record(providerId, { ok, latencyMs: Date.now() - started });
    } catch (error) {
      return this.record(providerId, { ok: false, latencyMs: Date.now() - started, error: error.message });
    }
  }

  providerList() {
    throw new Error('HealthMonitor requires a provider resolver');
  }

  async checkAll() {
    if (this.inFlight) return this.snapshot();
    this.inFlight = true;
    try {
      await Promise.all(this.providerList().map((p) => this.probe(p.id).catch(() => null)));
    } finally {
      this.inFlight = false;
    }
    return this.snapshot();
  }

  start() {
    if (this.timer) return;
    const tick = async () => {
      if (this.inFlight) return;
      this.inFlight = true;
      try {
        for (const provider of this.providerList()) {
          await this.probe(provider.id).catch(() => null);
        }
      } catch (error) {
        if (this.logger) this.logger(`healthCheck loop error: ${error.message}`);
      } finally {
        this.inFlight = false;
      }
    };
    this.timer = setInterval(tick, this.intervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    void tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
