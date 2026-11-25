import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { authHeaders, fetchJson, trimSlash, upstreamChat } from '../utils/http.js';
import { STATUS_UNAVAILABLE } from '../utils/healthCheck.js';

function expandHome(p) {
  if (!p) return p;
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return `${homedir()}/${p.slice(2)}`;
  return p;
}

export default function createGeminiOauthProvider(config = {}) {
  const tokenFile = expandHome(config.tokenFile || '~/.dsh/gemini-oauth-bridge.json');
  const apiKey = config.apiKey || 'freeflow';
  let cachedEndpoint = config.endpoint ? trimSlash(config.endpoint) : null;
  let endpointResolved = false;

  async function resolveEndpoint() {
    if (endpointResolved) return cachedEndpoint;
    endpointResolved = true;
    if (cachedEndpoint) return cachedEndpoint;
    try {
      const state = JSON.parse(await readFile(tokenFile, 'utf8'));
      const endpoint = state.endpoint || state.bridgeEndpoint;
      if (typeof endpoint === 'string' && endpoint) {
        cachedEndpoint = trimSlash(endpoint);
      } else if (state.port) {
        cachedEndpoint = `http://127.0.0.1:${Number(state.port)}/gemini-oauth-bridge/v1`;
      }
    } catch {
      cachedEndpoint = null;
    }
    return cachedEndpoint;
  }

  async function availability() {
    const endpoint = await resolveEndpoint();
    if (!endpoint) {
      return {
        status: STATUS_UNAVAILABLE,
        reason: `no Gemini OAuth endpoint configured. Set providers["gemini-oauth"].endpoint in ~/.dsh/freeflow.json, or install dsh-gemini-oauth-bridge and log in first (state file ${tokenFile})`,
      };
    }
    return { status: null, endpoint };
  }

  async function probe(timeoutMs = 4000) {
    const info = await availability();
    if (info.status === STATUS_UNAVAILABLE) return false;
    try {
      const res = await fetch(`${info.endpoint}/models`, {
        headers: authHeaders(apiKey),
        signal: AbortSignal.timeout(timeoutMs),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function listModels(timeoutMs = 10000) {
    const info = await availability();
    if (info.status === STATUS_UNAVAILABLE) return [];
    try {
      const data = await fetchJson(`${info.endpoint}/models`, { timeoutMs, headers: authHeaders(apiKey) });
      return (data?.data || []).map((m) => m.id).filter(Boolean);
    } catch {
      return [];
    }
  }

  async function chat(request, { signal, timeoutMs = 120000 } = {}) {
    const info = await availability();
    if (info.status === STATUS_UNAVAILABLE) {
      const error = new Error(info.reason);
      error.status = 503;
      throw error;
    }
    return upstreamChat(`${info.endpoint}/chat/completions`, request, {
      headers: authHeaders(apiKey),
      signal,
      timeoutMs,
    });
  }

  return { id: 'gemini-oauth', label: 'Gemini via OAuth bridge', listModels, probe, chat, availability };
}
