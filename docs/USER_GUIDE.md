# USER_GUIDE.md — dsh-freeflow by VuDube

A complete, noob-friendly manual. If you can run one terminal command, you can
run this plugin.

## Phase 0 — What you need

| Requirement | Check |
|---|---|
| DeepSeek Harness (DSH) 0.2.x | `dsh --version` |
| Node.js 22.19+ or 24+ | `node --version` |
| Nothing else | No API keys needed to start, no VPS, no credit card |

Out of the box the gateway uses **keyless** providers that answer with zero
credentials. Optional providers unlock more capacity — all of them have a free
tier, none require a credit card (details in Phase 6).

## Phase 1 — Installation

### Step 1: Get the repo

```sh
git clone https://github.com/VuDube/dsh-freeflow.git
cd dsh-freeflow
```

### Step 2: Install into DSH

```sh
dsh plugin --profile web add link:$(pwd)
```

Or from GitHub once published:

```sh
dsh plugin --profile web add "github:VuDube/dsh-freeflow#main"
```

### Step 3: Restart DSH

Bundles load on startup:

```sh
dsh web
```

Verify the plugin is loaded:

```sh
dsh web --dump-config | grep freeflow
```

### Step 4: Verify the gateway

Open a second terminal:

```sh
curl http://127.0.0.1:8787/readyz
```

`"ready": true` means at least one free provider is reachable. (freellmpool
answers only if you have it running locally; the anonymous path, Kilo's free
pool and OVHcloud's endpoints are always on.)

## Phase 2 — First chat session

### In the DSH Web UI

1. Start a chat.
2. Open **Settings → Models** (or the model picker).
3. Pick any model under **freeflow** — for example `anonymous/qwen-3`.
   The system suggests the healthiest keyless model first; press Enter or click it.
4. Chat. Streaming, Markdown, and reasoning output flow straight through.

### From the CLI

```sh
dsh chat --provider freeflow
```

### Understanding model ids

Models are namespaced `provider/model`:

| Model id | Meaning |
|---|---|
| `anonymous/<zen-model>` | OpenCode Zen free models, zero credentials |
| `kilo/<free-model>` | Kilo free pool (e.g. `kilo/kilo-auto/free`), zero credentials |
| `ovhcloud/<model>` | OVHcloud AI Endpoints (e.g. `ovhcloud/gpt-oss-120b`), zero credentials |
| `freellmpool/auto` | let freellmpool pick the route |
| `freellmpool/<model>` | a specific freellmpool catalog model |
| `gemini-oauth/<model>` | Gemini through your Google subscription |
| `groq/<model>`, `openrouter/<model>`, … | BYOK providers once you add a key (Phase 6) |

Sending an unprefixed model uses your `defaultProvider`.

### Which model should I pick?

`GET /freeflow/catalog` returns every available model **ranked** (rank 1 = best
right now) and **categorized** (chat, reasoning, coder, vision, image, audio,
embedding, small/fast/large). The published version lives at
[docs/MODELS.md](MODELS.md). Ranking weighs live health, latency, free-tier
status and per-model cooldowns — you can just take rank 1 and go.

## Phase 3 — Optional: Gemini via OAuth (premium free path)

The Gemini path spends your Google AI **subscription** quota, not billed API
credit, and needs a one-time login:

1. Install [dsh-gemini-oauth-bridge](https://github.com/hyqhyq3/dsh-gemini-oauth-bridge)
   (it renders a Google sign-in page inside DSH Settings).
2. Sign in once. Tokens are stored by the bridge in
   `~/.dsh/gemini-oauth-bridge.json` with mode `0600`.
3. Tell dsh-freeflow where the bridge lives:

```json
{
  "providers": {
    "gemini-oauth": {
      "endpoint": "http://127.0.0.1:8788/gemini-oauth-bridge/v1"
    }
  }
}
```

`dsh-freeflow` reads the bridge's state file to auto-detect the endpoint when
possible. It never copies, exports, or transmits your tokens.

## Phase 4 — Configuration

Edit `~/.dsh/freeflow.json` — every key is optional and deep-merged over the
shipped defaults:

```json
{
  "defaultProvider": "anonymous",
  "autoFailover": true,
  "streaming": true,
  "server": { "host": "127.0.0.1", "port": 8787, "apiKey": "" },
  "providers": {
    "anonymous":   { "enabled": true, "baseUrl": "https://opencode.ai/inference/v1", "apiKey": "", "models": [] },
    "kilo":        { "enabled": true, "apiKey": "" },
    "ovhcloud":    { "enabled": true, "apiKey": "" },
    "freellmpool": { "enabled": true, "baseUrl": "http://127.0.0.1:8080/v1", "model": "auto" },
    "gemini-oauth": { "enabled": true, "endpoint": "" },
    "llm7":        { "enabled": false, "apiKey": "" }
  },
  "quota": {
    "groq": { "dailyRequestCap": 1000, "dailyTokenCap": 200000 },
    "openrouter": { "dailyRequestCap": 50 },
    "cloudflare": { "dailyTokenCap": 10000 }
  },
  "catalog": { "modelCooldownMs": 1800000 },
  "healthCheck": { "intervalMs": 30000, "timeoutMs": 4000, "degradedAboveMs": 2000 }
}
```

| Setting | What it does |
|---|---|
| `defaultProvider` | tried first, even while cooling down |
| `autoFailover` | on failures/timeouts/429/5xx, retry the next healthy provider |
| `streaming` | master switch for SSE token streaming |
| `server.apiKey` | require `Authorization: Bearer <key>` against the gateway |
| `quota.<provider>` | daily request/token caps → `low_quota` at 80%, `exhausted` at 100%, reset at UTC midnight |
| `catalog.modelCooldownMs` | how long a model that just 400/404'd stays hidden (default 30 min) |
| `healthCheck.intervalMs` | probe frequency (lower = faster failover, more probes) |

Restart `dsh web` (or the standalone gateway) after editing.

## Phase 5 — Optional: freellmpool smart pool

The pool adds breadth ([0xzr/freellmpool](https://github.com/0xzr/freellmpool)):

```sh
pip install freellmpool
freellmpool proxy --port 8080
```

dsh-freeflow automatically consumes its `/readyz`, `/v1/models?ready=true`,
and `/v1/chat/completions` endpoints. Labels (`healthy` / `low_quota` /
`exhausted`) map to dsh-freeflow's routing decisions.

## Phase 6 — Optional: free-tier keys (BYOK) for more capacity

Every option below is free and needs no credit card. Keys live **only** on your
machine (`~/.dsh/freeflow.json` or environment variables) and are sent only to
the provider you configured.

| Provider | Get the key | Env var | Notes |
|---|---|---|---|
| Groq | console.groq.com → API Keys | `GROQ_API_KEY` | ~30 req/min, 1K req/day per model on free tier |
| Gemini API | aistudio.google.com → Get API key | `GEMINI_API_KEY` | free tier without a card; separate from your OAuth path |
| NVIDIA NIM | build.nvidia.com (free account) | `NVIDIA_API_KEY` | free dev/prototyping credits |
| OpenRouter | openrouter.ai → Keys | `OPENROUTER_API_KEY` | models ending in `:free`, 50 req/day at 0 credits |
| Cloudflare Workers AI | dash.cloudflare.com → AI → API tokens | `CLOUDFLARE_API_TOKEN` + `accountId` | 10,000 Neurons/day free |
| LLM7.io | llm7.io | `LLM7_API_KEY` | usage-based (pro/turbo); ships disabled |

Add presets in `~/.dsh/freeflow.json`:

```json
{
  "providers": {
    "groq": { "preset": "groq", "apiKey": "gsk_..." },
    "gemini": { "preset": "gemini", "apiKey": "AIza..." },
    "nvidia": { "preset": "nvidia", "apiKey": "nvapi-..." },
    "openrouter": { "preset": "openrouter", "apiKey": "sk-or-v1-..." },
    "cloudflare": { "preset": "cloudflare", "accountId": "abc123", "apiKey": "token" }
  }
}
```

Any other OpenAI-compatible endpoint needs no preset:

```json
{
  "providers": {
    "my-proxy": { "type": "byok", "baseUrl": "http://127.0.0.1:9999/v1", "apiKey": "sk-local" }
  }
}
```

Unconfigured BYOK providers are auto-skipped with an actionable message —
nothing breaks if you add none of these.

## Phase 7 — Health, cooldowns, and the catalog

- `GET /freeflow/status` — live snapshot: health, quotas, active cooldowns, models in cooldown.
- `GET /freeflow/catalog` — the full local catalog, ranked and categorized.
- `POST /freeflow/verify` — force a fresh probe + model refresh now.
- [docs/MODELS.md](MODELS.md) — regenerated **hourly** by GitHub Actions: every
  keyless provider's upstream catalog is fetched from live endpoints and a tiny
  real chat is sent as evidence (✅/❌ in the table). If a model disappears
  upstream, it stops being listed here — the gateway additionally verifies
  upstream in real time, hides models that just 400/404'd, and re-checks them
  after a cooldown.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `readyz` says 503 | all providers unreachable; check internet, freellmpool process |
| Model picker missing models | run `curl 127.0.0.1:8787/v1/models` — provider or model was unhealthy/cooldown at refresh time |
| Chat returns `no API key configured for <id>` | you selected a BYOK model without a key; add the key (Phase 6) or pick a keyless model |
| Provider keeps failing then works later | that's the Retry-After cooldown doing its job; see `/freeflow/status` |
| Kilo request 401 `PAID_MODEL_AUTH_REQUIRED` | you called a non-free Kilo model; add `KILO_API_KEY` or use `:free` models |
| OVHcloud requests 429 | OVH allows ~2 req/min per model per IP; failover handles it automatically |
| Gateway port busy | change `server.port` in `~/.dsh/freeflow.json` |
| Plugin not visible after install | bundle needs a DSH restart: `dsh web` |

## Safety notes

- The gateway binds to `127.0.0.1` only and is never exposed to your network.
- Set `server.apiKey` on shared machines; API keys never leave your machine
  except toward the provider you configured.
- This is a community plugin: MIT licensed, no telemetry, no accounts, for
  personal experimentation only.
