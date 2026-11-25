import { createOpenAICompatProvider } from './openaiCompat.js';

export default function createLlm7Provider(config = {}) {
  return createOpenAICompatProvider({
    id: 'llm7',
    label: 'LLM7.io (free API key required)',
    baseUrl: config.baseUrl || 'https://api.llm7.io/v1',
    apiKey: config.apiKey || '',
    apiKeyEnv: 'LLM7_API_KEY',
    keylessToken: null,
    tier: 'usage-based',
  });
}
