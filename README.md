<div align="center">

# dsh-freeflow

**VuDube** — Free-tier LLM router for DeepSeek Harness (DSH).

*Zero cost. Plug-and-play. One endpoint, many free providers.*

[![CI](https://github.com/VuDube/dsh-freeflow/actions/workflows/ci.yml/badge.svg)](https://github.com/VuDube/dsh-freeflow/actions/workflows/ci.yml)
[![Model catalog](https://github.com/VuDube/dsh-freeflow/actions/workflows/catalog-check.yml/badge.svg)](https://github.com/VuDube/dsh-freeflow/actions/workflows/catalog-check.yml)
[![Docs](https://img.shields.io/badge/docs-vudube.github.io%2Fdsh--freeflow-blue)](https://vudube.github.io/dsh-freeflow/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH plugin](https://img.shields.io/badge/DSH-plugin-8A2BE2)](https://github.com/deepseek-ai/deepseek-harness)

</div>

`dsh-freeflow` exposes a single OpenAI-compatible gateway on your machine and
routes every request to the best available **free** provider:

| Provider | Cost | How it works |
|---|---|---|
| `anonymous` | $0 | OpenCode Zen free models via `https://opencode.ai/inference/v1`, no API key |
| `kilo` | $0 | Kilo Gateway free pool (`https://api.kilo.ai`, `isFree` models only — e.g. `kilo-auto/free`, 200 req/hr/IP), no API key |
| `ovhcloud` | $0 | OVHcloud AI Endpoints (`https://oai.endpoints.kepler.ai.cloud.ovh.net`), no API key, ~2 req/min per model per IP, EU-hosted |
| `freellmpool` | $0 | [freellmpool](https://github.com/0xzr/freellmpool) local gateway, health-aware smart routing |
| `gemini-oauth` | $0 (subscription quota) | Gemini via the [dsh-gemini-oauth-bridge](https://github.com/hyqhyq3/dsh-gemini-oauth-bridge) OpenAI-compatible endpoint |
| `llm7` | usage-based | LLM7.io — optional and **disabled by default**: its catalog is now pro/turbo (pay-per-token); chat requires a free `LLM7_API_KEY` from llm7.io |
| BYOK presets | free tier w/ key | `groq` · `gemini` · `nvidia` · `openrouter` (`:free`) · `cloudflare` — any OpenAI-compatible endpoint also works via the generic `byok` type |

The router checks provider health (lightweight probes, latency EMA),
pins your default provider first, and fails over automatically on network
errors, timeouts, rate limits (429) and upstream 5xx. Rate-limited providers
are put in a **cooldown** (honoring upstream `Retry-After`), so requests stop
wasting time on providers that just told you to wait.

## What's new in v0.2.0

- **Keyless providers**: `llm7`, `ovhcloud`, `kilo` — live-verified before release.
- **Generic BYOK type**: any OpenAI-compatible provider, including ready presets
  for Groq, Gemini, NVIDIA, Cloudflare Workers AI and OpenRouter. Keys stay in
  your local `~/.dsh/freeflow.json` or environment variables — never in the repo.
- **Retry-After cooldown**: on 429/402/403/408/503 the provider (and, for
  400/404, the specific model) is skipped until the cooldown expires.
- **Quota counters**: per-provider daily request/token caps auto-mark providers
  `low_quota` (≥80%) and `exhausted` (100%), then reset at UTC midnight.
- **Ranked & categorized catalog**: every model is classified (chat, reasoning,
  coder, vision, image, audio, embedding, small/fast/large) and ranked by health,
  latency, tier and provider status — see [`docs/MODELS.md`](docs/MODELS.md).
- **Freshness guarantee**: an hourly GitHub Actions workflow re-verifies every
  upstream catalog and re-commits [`docs/MODELS.md`](docs/MODELS.md), so the
  published catalog is an auditable evidence trail; the running gateway always
  verifies upstream in real time and auto-prunes models that stop being served.

## Install

```sh
git clone https://github.com/VuDube/dsh-freeflow.git
cd dsh-freeflow
dsh plugin --profile web add link:$(pwd)
```

Or as a bundle from GitHub once this repo is published:

```sh
dsh plugin --profile web add "github:VuDube/dsh-freeflow#main"
```

Then restart `dsh web` so the bundle takes effect, and verify:

```sh
dsh web --dump-config | grep freeflow
```

## Standalone usage (no DSH required)

```sh
npm start                 # serves http://127.0.0.1:8787
curl http://127.0.0.1:8787/readyz
curl -X POST http://127.0.0.1:8787/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"qwen-3","messages":[{"role":"user","content":"hi"}],"stream":true}'
```

Point any OpenAI-compatible client at `http://127.0.0.1:8787/v1` and model ids
are namespaced per provider, e.g. `anonymous/qwen-3`, `kilo/kilo-auto/free`,
`groq/llama-3.3-70b-versatile`, `gemini-oauth/gemini-3-flash`.

## Configuration

Create `~/.dsh/freeflow.json` — every key is optional (defaults in
[`src/config/default.json`](src/config/default.json)):

```json
{
  "defaultProvider": "anonymous",
  "autoFailover": true,
  "streaming": true,
  "server": { "host": "127.0.0.1", "port": 8787, "apiKey": "" },
  "providers": {
    "gemini-oauth": {
      "endpoint": "http://127.0.0.1:8788/gemini-oauth-bridge/v1"
    },
    "groq": { "preset": "groq", "apiKey": "gsk_your-free-key" },
    "openrouter": { "preset": "openrouter", "apiKey": "sk-or-v1-..." },
    "cloudflare": { "preset": "cloudflare", "accountId": "your-account-id", "apiKey": "your-api-token" }
  }
}
```

Any other OpenAI-compatible endpoint works without a preset:

```json
{
  "providers": {
    "my-proxy": { "type": "byok", "baseUrl": "http://127.0.0.1:9999/v1", "apiKey": "sk-local" }
  }
}
```

API keys can also come from environment variables: `GROQ_API_KEY`,
`GEMINI_API_KEY`, `NVIDIA_API_KEY`, `OPENROUTER_API_KEY`,
`CLOUDFLARE_API_TOKEN`, `LLM7_API_KEY`, `KILO_API_KEY`, `OVHCLOUD_AI_API_KEY`.

- **Gateway binds to loopback only.** Set `server.apiKey` to require a bearer
  token if other local users exist. **Keys stay on your machine** — the gateway
  sends them only to the provider you configured, and BYOK providers are never
  probed server-side (see [`docs/MODELS.md`](docs/MODELS.md) scope).
- Gemini models require a one-time Google sign-in through
  [dsh-gemini-oauth-bridge](https://github.com/hyqhyq3/dsh-gemini-oauth-bridge)
  (Settings → Gemini OAuth). `dsh-freeflow` then detects the bridge state file
  (`~/.dsh/gemini-oauth-bridge.json`, mode 0600) or uses the `endpoint` you set.
  Token contents are never read, logged, or transmitted anywhere.

## Status, health, routing, and the catalog

- `GET /healthz` — liveness
- `GET /readyz` — 200 only when at least one provider is healthy
- `GET /freeflow/status` — provider health snapshot, quotas, cooldowns, dead models
- `GET /freeflow/catalog` — full ranked + categorized local catalog
- `POST /freeflow/verify` — re-probe every provider and refresh the model catalog on demand
- `GET /v1/models` — merged, provider-namespaced model catalog (ranked, with `checkedAt`)
- [docs/MODELS.md](docs/MODELS.md) — hourly live-verified snapshot (audit trail)

Provider labels mirror freellmpool's capacity model: `healthy`, `low_quota`,
`degraded` (healthy but slow), `exhausted`, `unavailable` — in that failover
order, then by latency.

## Free-tier limits (verified 2026-11; see [docs/MODELS.md](docs/MODELS.md) for live status)

| Provider | Limit |
|---|---|
| OpenCode Zen (anonymous) | anonymous tier, fair use — can change without notice |
| Kilo Gateway | 200 req/hr/IP on `isFree` models; other models require auth |
| OVHcloud AI Endpoints | ~2 req/min per model per IP, EU (Paris) region |
| Groq (BYOK, free key) | ~30 req/min, 1,000 req/day and ~8K tokens/min per model on free tier |
| Gemini API (BYOK, free key) | free tier without credit card, per-model RPM/RPD limits |
| NVIDIA NIM (BYOK, free account) | free credits for development/prototyping only |
| OpenRouter `:free` (BYOK) | 50 req/day when your account has 0 credits |
| Cloudflare Workers AI (BYOK) | 10,000 Neurons/day free |
| LLM7.io | usage-based (pro/turbo) — optional, disabled by default |
| ~~GitHub Models~~ | retired July 2026 — intentionally not integrated |
| ~~Cerebras~~ | free trial now requires a payment card — intentionally not integrated |

## Documentation

- [User Guide](docs/USER_GUIDE.md) — step-by-step, from install to first chat
- [Architecture](docs/ARCHITECTURE.md) — design, routing, security decisions
- [Model catalog](docs/MODELS.md) — hourly live-verified model list
- [Contributing](.github/CONTRIBUTING.md)

## Honest limits

- DSH is in developer preview and its plugin APIs are version-pinned; the
  gateway described above is the stable surface and works with any
  OpenAI-compatible client even if DSH plugin conventions shift between
  releases.
- Free upstreams are third-party services that can rate-limit, reprice, or
  disappear without notice. The router mitigates this with cooldowns, quota
  counters, and failover; it cannot guarantee upstream availability. That is
  exactly why the hourly catalog-check workflow exists — the published catalog
  only claims what was verified to answer.
- llm7 was keyless-turbo when this project started and is now usage-based
  (verified live); the integration stays so existing free keys keep working,
  but it ships disabled so the default experience remains truly $0.

## License

[MIT](LICENSE) — © VuDube
