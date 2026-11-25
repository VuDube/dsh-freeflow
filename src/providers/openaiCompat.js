import { authHeaders, fetchJson, trimSlash, upstreamChat } from '../utils/http.js';

export function createOpenAICompatProvider({
  id,
  label,
  baseUrl,
  apiKey = '',
  apiKeyEnv = null,
  keylessToken = null,
  headers = {},
  modelsPath = '/models',
  chatPath = '/chat/completions',
  modelsFilter = null,
  tier = 'keyless',
  timeoutMs: defaultTimeout = 120000,
}) {
  const trimmed = trimSlash(baseUrl);
  let cachedModels = [];
  let modelsFetchedAt = 0;

  function resolveApiKey() {
    if (apiKey) return apiKey;
    if (apiKeyEnv && process.env[apiKeyEnv]) return process.env[apiKeyEnv];
    return keylessToken;
  }

  function requiresKey() {
    return !apiKey && !(apiKeyEnv && process.env[apiKeyEnv]) && keylessToken === null;
  }

  async function listModels(timeoutMs = 10000) {
    try {
      const data = await fetchJson(`${trimmed}${modelsPath}`, { timeoutMs, headers: authHeaders(resolveApiKey(), headers) });
      const raw = data?.data || data?.models || [];
      let pairs = raw
        .map((m) => {
          const modelId = typeof m === 'string' ? m : m?.id;
          return modelId ? [modelId, m] : null;
        })
        .filter(Boolean);
      if (typeof modelsFilter === 'function') pairs = pairs.filter(([modelId, rawModel]) => modelsFilter(modelId, rawModel));
      const ids = pairs.map(([modelId]) => modelId);
      if (ids.length) {
        cachedModels = ids;
        modelsFetchedAt = Date.now();
      }
    } catch {
      if (Date.now() - modelsFetchedAt > 300000) cachedModels = [];
    }
    return [...cachedModels];
  }

  async function probe(timeoutMs = 4000) {
    if (requiresKey()) return false;
    const models = await listModels(timeoutMs);
    return models.length > 0;
  }

  async function availability() {
    if (requiresKey()) {
      const keyEnvName = apiKeyEnv ? ` or ${apiKeyEnv}` : '';
      return {
        status: 'unavailable',
        reason: `no API key configured for ${id}. Set providers["${id}"].apiKey${keyEnvName} in ~/.dsh/freeflow.json (free key, no credit card)`,
      };
    }
    return { status: null, baseUrl: trimmed, apiKey: resolveApiKey() };
  }

  async function chat(request, { signal, timeoutMs = defaultTimeout } = {}) {
    const info = await availability();
    if (info.status === 'unavailable') {
      const error = new Error(info.reason);
      error.status = 503;
      error.noRetry = true;
      throw error;
    }
    return upstreamChat(`${trimmed}${chatPath}`, request, {
      headers: authHeaders(info.apiKey, headers),
      signal,
      timeoutMs,
    });
  }

  return { id, label, listModels, probe, chat, availability, tier };
}
