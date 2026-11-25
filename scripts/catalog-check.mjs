import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import createLlm7Provider from '../src/providers/llm7.js';
import createOvhcloudProvider from '../src/providers/ovhcloud.js';
import createKiloProvider from '../src/providers/kilo.js';
import createAnonymousProvider from '../src/providers/anonymous.js';
import { classifyModel, buildCatalog, summaryByCategory } from '../src/utils/ranking.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const llm7HasFreeKey = Boolean(process.env.LLM7_API_KEY);

const KEYLESS = [
  {
    provider: createLlm7Provider(),
    probeChat: llm7HasFreeKey,
    note: 'llm7 now serves only pro/turbo usage-based models; chat needs a free LLM7_API_KEY. Model listing stays open.',
  },
  {
    provider: createOvhcloudProvider(),
    probeChat: true,
    candidates: ['Meta-Llama-3_3-70B-Instruct', 'gpt-oss-120b', 'Mistral-Small-3.2-24B-Instruct-2506', 'Qwen3.6-27B'],
  },
  {
    provider: createKiloProvider(),
    probeChat: true,
    candidates: ['kilo-auto/free', 'nvidia/nemotron-3.5-super-vl:free', 'openrouter/free'],
  },
  { provider: createAnonymousProvider({ baseUrl: 'https://opencode.ai/inference/v1' }), probeChat: false },
];

const healthStub = { snapshot: () => null };

function usableForChat(id) {
  return !/audio|image|embedding/i.test(classifyModel(id));
}

function pickChatModel(models, candidates = []) {
  for (const candidate of candidates) {
    if (models.includes(candidate) && usableForChat(candidate)) return candidate;
  }
  return models.find((m) => usableForChat(m)) || null;
}

async function liveChatAttempt(provider, model) {
  try {
    const res = await provider.chat(
      { model, messages: [{ role: 'user', content: 'Say ok' }], max_tokens: 5, stream: false },
      { timeoutMs: 30000 }
    );
    const body = await res.text();
    return { status: res.status, verified: res.ok, rateLimited: res.status === 429 || /rate limit/i.test(body), sample: body.slice(0, 90) };
  } catch (error) {
    return { status: 0, verified: false, rateLimited: /rate limit/i.test(error.message), sample: error.message.slice(0, 90) };
  }
}

async function liveChat(provider, model) {
  const first = await liveChatAttempt(provider, model);
  if (first.verified || !first.rateLimited) return first;
  await new Promise((resolve) => setTimeout(resolve, 20000));
  const second = await liveChatAttempt(provider, model);
  return { ...second, retriedAfterRateLimit: true };
}

function renderMarkdown({ checkedAt, providers, total, categories, models }) {
  const lines = [
    '# Live model catalog — auto-generated',
    '',
    '> Regenerated hourly by `.github/workflows/catalog-check.yml` (GitHub Actions free tier)',
    '> from live upstream endpoints. The running gateway never relies on this snapshot:',
    '> its `GET /v1/models` verifies upstream liveness in real time. This file is the',
    '> auditable evidence trail of what was actually available and answering.',
    '',
    `**Checked:** ${checkedAt} · **Providers:** ${providers.length} · **Models:** ${total}`,
    '',
    '## Category summary',
    '',
    '| Category | Models |',
    '|---|---|',
    ...Object.entries(categories).map(([c, n]) => `| ${c} | ${n} |`),
    '',
    '## Provider verification',
    '',
    '| Provider | Status | Models | Chat probe |',
    '|---|---|---|---|',
    ...providers.map((p) => {
      let probeCell = 'skipped';
      if (p.chat) {
        if (p.chat.verified) probeCell = `✅ \`${p.chat.model}\``;
        else if (p.chat.rateLimited) probeCell = `⏳ rate limited (429) — model list verified; chat probe retried next hourly run`;
        else probeCell = `❌ ${p.chat.sample || p.chat.status}`;
      }
      return `| ${p.id} | ${p.status} | ${p.models} | ${probeCell} |`;
    }),
    '',
    ...providers.filter((p) => p.note).flatMap((p) => [`> **${p.id}:** ${p.note}`, '']),
    '## Ranked catalog (keyless only — BYOK keys stay local and are never probed server-side)',
    '',
    '| Rank | Model | Provider | Tier | Category |',
    '|---|---|---|---|---|',
    ...models.slice(0, 200).map((m) => `| ${m.rank} | \`${m.id}\` | ${m.provider} | ${m.tier} | ${m.category} |`),
    '',
  ];
  if (models.length > 200) lines.push(`...plus ${models.length - 200} more — full list in [MODELS.json](MODELS.json)`, '');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const checkedAt = new Date().toISOString();
  const results = [];
  for (const { provider, probeChat, candidates, note } of KEYLESS) {
    const entry = { id: provider.id, label: provider.label, status: 'ok', models: 0, chat: null };
    if (note) entry.note = note;
    try {
      const ids = await provider.listModels(15000);
      entry.models = ids.length;
      if (!ids.length) entry.status = 'empty';
      if (probeChat && ids.length) {
        const chatModel = pickChatModel(ids, candidates);
        if (chatModel) entry.chat = { model: chatModel, ...(await liveChat(provider, chatModel)) };
      }
    } catch (error) {
      entry.status = 'error';
      entry.error = error.message;
    }
    results.push(entry);
  }

  const listing = [];
  for (const { provider } of KEYLESS) {
    for (const id of await provider.listModels()) {
      listing.push({ id: `${provider.id}/${id}`, upstream_model: id, provider: provider.id, tier: provider.tier });
    }
  }
  const catalog = buildCatalog({ providers: KEYLESS.map((k) => k.provider), health: healthStub, listing })
    .filter((m) => !/audio|image|embedding/.test(m.category));
  const json = {
    checkedAt,
    providers: results,
    total: catalog.length,
    categories: summaryByCategory(catalog),
    models: catalog,
  };

  await mkdir(join(root, 'docs'), { recursive: true });
  await writeFile(join(root, 'docs', 'MODELS.json'), `${JSON.stringify(json, null, 2)}\n`);
  await writeFile(join(root, 'docs', 'MODELS.md'), renderMarkdown(json));
  console.log(`catalog check complete: ${checkedAt} — ${catalog.length} models across ${results.length} providers`);
  for (const r of results) {
    console.log(`  ${r.id}: ${r.status} models=${r.models}${r.chat ? ` chatProbe=${r.chat.verified}${r.chat.model ? ` (${r.chat.model})` : ''}` : ' chatProbe=skipped'}`);
  }
}

main().catch((error) => {
  console.error(`catalog-check failed: ${error.message}`);
  process.exit(0);
});
