export const CATEGORIES = {
  reasoning: /\b(r1|reasoning|thinking|think|opus|deliberation)\b|deepseek-r1|o[13]-/i,
  coder: /(coder|codestral|code\b|coding|devstral)/i,
  vision: /(vl\b|vision|-vl$|omni|multimodal|pixtral|llava)/i,
  image: /(stable-diffusion|sdxl|flux|image|dall|imagen|lyria)/i,
  audio: /(whisper|tts|stt|audio|speech|voxtral|pyannote)/i,
  embedding: /embed|bge-|rerank/i,
};

export function classifyModel(modelId) {
  for (const [category, pattern] of Object.entries(CATEGORIES)) {
    if (pattern.test(modelId)) return category;
  }
  const size = modelId.match(/(\d+(?:\.\d+)?)\s*b\b/i);
  if (size) {
    const params = parseFloat(size[1]);
    if (params <= 12) return 'small';
    if (params >= 60) return 'large';
  }
  if (/mini|nano|small|flash|lite/i.test(modelId)) return 'fast';
  if (/ultra|large|pro|max/i.test(modelId)) return 'large';
  return 'chat';
}

export function tierWeight(tier) {
  if (tier === 'keyless' || tier === 'subscription') return 1;
  if (tier === 'byok') return 0;
  return -1;
}

export function rankModel(model, providerHealth) {
  const status = providerHealth?.status || 'unavailable';
  const latency = providerHealth?.latencyMs ?? null;
  let score = 100;
  const reasons = [];
  if (status === 'healthy') {
    reasons.push('provider healthy');
  } else if (status === 'low_quota') {
    score -= 20;
    reasons.push('provider low quota');
  } else if (status === 'degraded') {
    score -= 30;
    reasons.push('provider degraded');
  } else if (status === 'exhausted') {
    score -= 80;
    reasons.push('provider quota exhausted');
  } else {
    score -= 100;
    reasons.push('provider unavailable');
  }
  if (latency !== null) {
    score -= Math.min(25, latency / 200);
    reasons.push(`latency ${latency}ms`);
  }
  const tw = tierWeight(model.tier);
  if (tw > 0) {
    score += tw;
    reasons.push('zero-credential tier');
  }
  const category = model.category || 'chat';
  if (category === 'chat') score += 2;
  else if (category === 'reasoning' || category === 'coder') score += 1;
  return { score: Math.round(score), reasons };
}

export function buildCatalog({ providers, health, listing }) {
  const catalog = listing.map((model) => {
    const provider = providers.find((p) => p.id === model.provider) || {};
    const category = classifyModel(model.id);
    const modelWithTier = { ...model, category, tier: provider.tier || 'keyless' };
    const { score, reasons } = rankModel(modelWithTier, health.snapshot(model.provider));
    return { ...modelWithTier, score, reasons };
  });
  catalog.sort((a, b) => b.score - a.score || a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id));
  return catalog.map((model, index) => ({ ...model, rank: index + 1 }));
}

export function summaryByCategory(catalog) {
  const byCategory = {};
  for (const model of catalog) {
    byCategory[model.category] = (byCategory[model.category] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(byCategory).sort((a, b) => b[1] - a[1]));
}
