import { authHeaders, fetchJson, trimSlash, upstreamChat } from '../utils/http.js';

export default function createFreellmpoolProvider(config = {}) {
  const baseUrl = trimSlash(config.baseUrl || 'http://127.0.0.1:8080/v1');
  const rootUrl = baseUrl.replace(/\/v1$/, '');
  const apiKey = config.apiKey || '';
  const routingModel = config.model || 'auto';

  async function probe(timeoutMs = 4000) {
    try {
      const res = await fetch(`${rootUrl}/readyz`, { signal: AbortSignal.timeout(timeoutMs) });
      if (res.status === 200) return true;
      if (res.status === 503) return false;
      const health = await fetch(`${rootUrl}/healthz`, { signal: AbortSignal.timeout(timeoutMs) });
      return health.ok;
    } catch {
      return false;
    }
  }

  async function listModels(timeoutMs = 10000) {
    try {
      const data = await fetchJson(`${baseUrl}/models?ready=true`, { timeoutMs, headers: authHeaders(apiKey) });
      return (data?.data || []).map((m) => m.id).filter(Boolean);
    } catch {
      return [];
    }
  }

  async function chat(request, { signal, timeoutMs } = {}) {
    const body = { ...request };
    if (!body.model || body.model === 'auto') body.model = routingModel;
    return upstreamChat(`${baseUrl}/chat/completions`, body, {
      headers: authHeaders(apiKey),
      signal,
      timeoutMs,
    });
  }

  return { id: 'freellmpool', label: 'freellmpool (smart routing)', listModels, probe, chat };
}
