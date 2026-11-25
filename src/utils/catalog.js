const DEFAULT_MODEL_COOLDOWN_MS = 30 * 60 * 1000;

export class ModelCatalog {
  constructor({ modelCooldownMs = DEFAULT_MODEL_COOLDOWN_MS, now = () => Date.now() } = {}) {
    this.modelCooldownMs = modelCooldownMs;
    this.now = now;
    this.models = new Map();
  }

  key(providerId, modelId) {
    return `${providerId}/${modelId}`;
  }

  markSeen(providerId, modelId, info = null) {
    const key = this.key(providerId, modelId);
    const existing = this.models.get(key);
    if (existing) {
      existing.lastSeenAt = this.now();
      if (info) {
        existing.context = info.context ?? existing.context ?? null;
        existing.modalities = info.modalities ?? existing.modalities ?? null;
        existing.name = info.name ?? existing.name ?? null;
      }
      return existing;
    }
    const entry = {
      id: modelId,
      providerId,
      key,
      firstSeenAt: this.now(),
      lastSeenAt: this.now(),
      cooldownUntil: null,
      cooldownReason: null,
      unavailableCount: 0,
      context: info?.context ?? null,
      modalities: info?.modalities ?? null,
      name: info?.name ?? null,
    };
    this.models.set(key, entry);
    return entry;
  }

  markUnavailable(providerId, modelId, { untilMs = null, reason = null } = {}) {
    const key = this.key(providerId, modelId);
    const existing = this.models.get(key);
    if (!existing) {
      this.models.set(key, {
        id: modelId,
        providerId,
        key,
        firstSeenAt: this.now(),
        lastSeenAt: 0,
        cooldownUntil: this.now() + (untilMs ?? this.modelCooldownMs),
        cooldownReason: reason,
        unavailableCount: 1,
        context: null,
        modalities: null,
        name: null,
      });
      return this.models.get(key);
    }
    existing.cooldownUntil = this.now() + (untilMs ?? this.modelCooldownMs);
    existing.cooldownReason = reason;
    existing.unavailableCount += 1;
    return existing;
  }

  inCooldown(providerId, modelId, now = this.now()) {
    const entry = this.models.get(this.key(providerId, modelId));
    if (!entry?.cooldownUntil) return false;
    if (entry.cooldownUntil <= now) {
      entry.cooldownUntil = null;
      entry.cooldownReason = null;
      return false;
    }
    return true;
  }

  isListed(providerId, modelId, now = this.now()) {
    const entry = this.models.get(this.key(providerId, modelId));
    if (!entry) return true;
    if (entry.lastSeenAt === 0 && entry.cooldownUntil && entry.cooldownUntil <= now) {
      this.models.delete(entry.key);
      return false;
    }
    if (entry.lastSeenAt === 0) return false;
    return true;
  }

  listing(providerId, liveIds, now = this.now()) {
    for (const id of liveIds) this.markSeen(providerId, id);
    return liveIds.filter((id) => !this.inCooldown(providerId, id, now));
  }

  prune(providerId, liveIds, now = this.now()) {
    const removed = [];
    for (const entry of this.models.values()) {
      if (entry.providerId !== providerId) continue;
      if (!liveIds.includes(entry.id)) {
        removed.push(entry.id);
        if (now - entry.lastSeenAt > 60 * 60 * 1000) this.models.delete(entry.key);
      }
    }
    return removed;
  }

  report() {
    const out = [];
    for (const entry of this.models.values()) {
      out.push({
        id: entry.id,
        provider: entry.providerId,
        lastSeenAt: entry.lastSeenAt ? new Date(entry.lastSeenAt).toISOString() : null,
        firstSeenAt: new Date(entry.firstSeenAt).toISOString(),
        unavailable: this.inCooldown(entry.providerId, entry.id) ? { until: new Date(entry.cooldownUntil).toISOString(), reason: entry.cooldownReason } : false,
      });
    }
    return out.sort((a, b) => a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id));
  }
}
