import { createOpenAICompatProvider } from './openaiCompat.js';

const CHAT_FILTER = (id) => !/^whisper|^nvr-tts|^tts|^stable-diffusion|^sdxl|embed|bge/i.test(id);

export default function createOvhcloudProvider(config = {}) {
  return createOpenAICompatProvider({
    id: 'ovhcloud',
    label: 'OVHcloud AI Endpoints (keyless, EU)',
    baseUrl: config.baseUrl || 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
    apiKey: config.apiKey || '',
    apiKeyEnv: 'OVHCLOUD_AI_API_KEY',
    keylessToken: config.apiKey ? null : '',
    modelsFilter: config.filterNonChat === false ? null : CHAT_FILTER,
    tier: 'keyless',
  });
}
