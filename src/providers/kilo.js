import { createOpenAICompatProvider } from './openaiCompat.js';

export default function createKiloProvider(config = {}) {
  const hasKey = Boolean(config.apiKey || process.env.KILO_API_KEY);
  return createOpenAICompatProvider({
    id: 'kilo',
    label: hasKey ? 'Kilo Gateway (authenticated, full catalog)' : 'Kilo Gateway (keyless free pool, 200 req/hr)',
    baseUrl: config.baseUrl || 'https://api.kilo.ai/api/gateway',
    chatPath: '/v1/chat/completions',
    apiKey: config.apiKey || '',
    apiKeyEnv: 'KILO_API_KEY',
    keylessToken: config.apiKey ? undefined : '',
    modelsFilter: hasKey ? null : (id, rawModel) => rawModel?.isFree === true,
    tier: 'keyless',
  });
}
