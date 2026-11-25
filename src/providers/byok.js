import { createOpenAICompatProvider } from './openaiCompat.js';

export const BYOK_PRESETS = {
  groq: {
    id: 'groq',
    label: 'Groq (free tier, 30 RPM / 1K req / 200K tok per day per model)',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyEnv: 'GROQ_API_KEY',
    tier: 'byok',
  },
  gemini: {
    id: 'gemini',
    label: 'Google AI Studio (free tier, no card)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKeyEnv: 'GEMINI_API_KEY',
    tier: 'byok',
  },
  nvidia: {
    id: 'nvidia',
    label: 'NVIDIA NIM (free developer tier, prototyping only)',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    apiKeyEnv: 'NVIDIA_API_KEY',
    tier: 'byok',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter (:free models, 50 req/day)',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    headers: {
      'http-referer': 'https://github.com/VuDube/dsh-freeflow',
      'x-title': 'dsh-freeflow',
    },
    modelsFilter: (id) => id.endsWith(':free') || id.startsWith('openrouter/free'),
    tier: 'byok',
  },
  cloudflare: {
    id: 'cloudflare',
    label: 'Cloudflare Workers AI (10,000 Neurons/day free)',
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/v1',
    apiKeyEnv: 'CLOUDFLARE_API_TOKEN',
    requiresAccountId: true,
    tier: 'byok',
  },
};

export default function createByokProvider(config = {}) {
  const preset = BYOK_PRESETS[config.preset] || {};
  const id = config.id || preset.id || 'byok';
  let baseUrl = config.baseUrl || preset.baseUrl || '';
  if (config.accountId) baseUrl = baseUrl.replace('{accountId}', encodeURIComponent(config.accountId));
  const headers = Object.fromEntries(Object.entries(preset.headers || {}));
  if (config.headers) Object.assign(headers, config.headers);
  const provider = createOpenAICompatProvider({
    id,
    label: config.label || preset.label || 'BYOK OpenAI-compatible',
    baseUrl,
    apiKey: config.apiKey || '',
    apiKeyEnv: preset.apiKeyEnv,
    keylessToken: null,
    headers,
    modelsFilter: preset.modelsFilter,
    tier: 'byok',
  });

  if (preset.requiresAccountId && !config.accountId) {
    provider.availability = async () => ({
      status: 'unavailable',
      reason: `cloudflare requires providers["${id}"].accountId and providers["${id}"].apiKey (account id is the /accounts/<id> path segment; free API token from dash.cloudflare.com)`,
    });
    provider.baseUrlTemplate = preset.baseUrl;
  }

  return provider;
}
