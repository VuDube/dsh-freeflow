const DEFAULT_TIMEOUT_MS = 30000;

export function trimSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

export function authHeaders(apiKey, extra = {}) {
  const headers = { 'content-type': 'application/json', ...extra };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  return headers;
}

export async function fetchJson(url, { timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const error = new Error(`${init.method || 'GET'} ${url} -> ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
      error.status = res.status;
      throw error;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function upstreamChat(url, body, { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {}, signal } = {}) {
  const controller = new AbortController();
  const onAbort = () => controller.abort(new Error('client aborted'));
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(new Error('upstream timeout')), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

export function isTransientFailure(error, status) {
  if (error) return true;
  if (!status) return true;
  return status >= 500 || status === 429 || status === 408;
}

export async function readErrorBody(res) {
  if (!res) return 'no upstream response';
  const text = await res.text().catch(() => '');
  return `upstream ${res.status}${text ? `: ${text.slice(0, 300)}` : ''}`;
}
