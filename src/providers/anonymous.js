import { authHeaders, fetchJson, trimSlash, upstreamChat } from '../utils/http.js';

const OPENCODE_IDENTITY_HEADERS = {
  'user-agent': 'opencode/1.0 (+opencode.ai)',
  'x-opencode-client': 'cli/1.0',
};

export default function createAnonymousProvider(config = {}) {
  const baseUrl = trimSlash(config.baseUrl || 'https://opencode.ai/inference/v1');
  const apiKey = config.apiKey || '';
  const fallbackModels = Array.isArray(config.models) ? config.models : [];
  const extraHeaders = config.extraHeaders || {};
  let cachedModels = [];

  async function listModels(timeoutMs = 10000) {
    try {
      const data = await fetchJson(`${baseUrl}/models`, { timeoutMs, headers: authHeaders(apiKey, OPENCODE_IDENTITY_HEADERS) });
      const ids = (data?.data || data?.models || [])
        .map((m) => (typeof m === 'string' ? m : m.id))
        .filter(Boolean)
        .filter((id) => !fallbackModels.length || fallbackModels.includes(id));
      if (ids.length) {
        cachedModels = ids;
        return ids;
      }
    } catch {
      if (!cachedModels.length && fallbackModels.length) cachedModels = fallbackModels;
    }
    if (!cachedModels.length && fallbackModels.length) cachedModels = fallbackModels;
    return [...cachedModels];
  }

  async function probe(timeoutMs = 4000) {
    try {
      await fetchJson(`${baseUrl}/models`, { timeoutMs, headers: authHeaders(apiKey, OPENCODE_IDENTITY_HEADERS) });
      return true;
    } catch {
      return false;
    }
  }

  async function chat(request, { signal, timeoutMs = 120000 } = {}) {
    const body = { ...request, model: request.model, stream: request.stream !== false };
    return upstreamChat(`${baseUrl}/chat/completions`, body, {
      headers: authHeaders(apiKey, { ...OPENCODE_IDENTITY_HEADERS, ...extraHeaders }),
      signal,
      timeoutMs,
    });
  }

  return { id: 'anonymous', label: 'OpenCode Zen (anonymous)', listModels, probe, chat };
}
