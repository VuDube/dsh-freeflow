# ARCHITECTURE.md — dsh-freeflow by VuDube

## 1. Design goal

A **zero-cost, plug-and-play model layer** for DeepSeek Harness (DSH): one
local OpenAI-compatible endpoint that hides the differences between several
free LLM sources, picks the best one per request, and degrades gracefully
when free tiers break.

The governing constraint was researched, not assumed: DSH is a developer
preview with version-pinned plugin APIs (each `dsh-opencode-free` release
targets exactly one DSH version), so `dsh-freeflow` implements the **one
integration surface that the ecosystem has already proven stable** — a
loopback OpenAI-compatible HTTP gateway. Both `dsh-gemini-oauth-bridge` and
`freellmpool` use exactly this pattern; DSH consumes it as a plain
`llm-pi-ai` provider, as do any OpenAI-compatible CLI clients.

## 2. Component layout

```
package.json            ESM; dsh.bundle.patch -> cordis.patch.yml
cordis.patch.yml        inserts the freeflow row into DSH profiles
src/
  index.js              config loader, provider instantiation, router (order,
                        cooldowns + failover), HTTP gateway, plugin entry
  standalone.js         run the gateway without DSH (`npm start`)
  providers/
    openaiCompat.js     shared OpenAI-compatible factory (auth, model filter,
                        listing cache, availability) used by every HTTP provider
    anonymous.js        OpenCode Zen: https://opencode.ai/inference/v1,
                        anonymous-first, optional Zen API key
    kilo.js             Kilo Gateway free pool; without a key lists only
                        upstream-verified `isFree` ($0) models
    ovhcloud.js         OVHcloud AI Endpoints; filters non-chat models out
    llm7.js             LLM7.io; usage-based upstream, free API key required,
                        disabled by default
    freellmpool.js      local freellmpool proxy: /readyz, /v1/models?ready=true
    gemini-oauth.js     dsh-gemini-oauth-bridge endpoint discovery + proxy
    byok.js             generic BYOK type + presets: groq, gemini, nvidia,
                        openrouter (:free filter), cloudflare ({accountId})
  config/default.json   shipped defaults; user overrides in ~/.dsh/freeflow.json
  utils/healthCheck.js  HealthMonitor: probes, latency EMA, status ranking,
                        Retry-After cooldowns, quota counters/rollover
  utils/catalog.js      ModelCatalog: model freshness, per-model cooldowns,
                        stale pruning
  utils/ranking.js      classification (chat/reasoning/coder/vision/image/
                        audio/embedding + size buckets), scoring, ranked catalog
scripts/catalog-check.mjs  live end-to-end verification + snapshot generator
.github/workflows/ci.yml  Node 22/24 matrix: syntax checks + full test suite
.github/workflows/catalog-check.yml  hourly upstream verification + docs/MODELS.md refresh
```

## 3. Provider contract

Every provider is a factory `(config) => provider` with:

| Member | Semantics |
|---|---|
| `id` / `label` | router identity and human name |
| `probe(timeoutMs)` | cheap liveness/readiness check returning `bool` |
| `listModels(timeoutMs)` | model ids, best-effort, failure returns `[]` |
| `chat(request, {signal, timeoutMs})` | forwards an OpenAI chat request, returns the raw upstream `Response` (so SSE streams pass through untouched) |
| `availability()` | optional misconfiguration report; `status: 'unavailable'` + actionable `reason` when e.g. a BYOK key is missing |
| `tier` | `keyless`, `subscription`, `byok`, or `usage-based` — feeds model ranking |

Adding a provider means adding one file, registering it in
`PROVIDER_TYPES`, and adding a config block. Nothing else changes.
Most HTTP upstreams reuse `openaiCompat.js` and only supply a base URL, an
optional `modelsFilter`, and auth settings.

## 4. Routing algorithm

Order construction (`buildOrder`):

1. `defaultProvider` pinned first (when enabled) — the default pin even
   bypasses an active cooldown, so a user-requested provider is always tried.
2. Providers in `Retry-After` cooldown are skipped.
3. Remaining providers filtered to those not failed at probe time, then sorted
   by health status
   (`healthy < low_quota < degraded < exhausted < unavailable`), then by latency EMA.
   Never-probed providers stay eligible so the first request after startup works.

Request flow (`routeChat`):

1. `model` may be namespaced (`provider/model`); a recognized prefix pins the
   provider and strips the prefix before forwarding. Unprefixed models route
   via the order above.
2. Iterate the order. A provider attempt ends in one of:
   - **success** (`2xx`): recorded as healthy (latency sample), response returned.
   - **cooldown-worthy failure** (`429`, `402`, `403`, `408`, `503`): the provider
     is put in cooldown honoring upstream `Retry-After` (fallback 60 s), the next
     provider is attempted.
   - **dead-model failure** (`400`, `404`): the specific `provider/model` id is
     put in the model cooldown (default 30 min) so the catalog stops offering it.
   - **transient failure** (network error, timeout, other `5xx`): recorded
     as unhealthy, next provider attempted.
   - **non-transient failure** (other `4xx`): returned to the client as-is —
     a bad request or bad model id is not fixed by retries.
   - **misconfiguration** (`noRetry`, e.g. BYOK key missing): recorded with its
     actionable message, next provider attempted.
3. All providers exhausted -> `502` with per-provider attempt diagnostics in
   the body.

Token usage is counted per provider on every response (non-streaming bodies
and streaming SSE deltas), feeding the quota counters.

Failover happens before the first byte of the response is forwarded. Once
streaming has started, the stream is passed through unmodified; mid-stream
failover would require replaying partial output and is out of scope (this
matches freellmpool's bounded-streaming stance).

## 5. Health monitoring

`HealthMonitor` mirrors freellmpool's capacity vocabulary, extended with two
quota states:

- `healthy` — probe succeeded below `degradedAboveMs` (default 2s) and quota usage < 80%.
- `low_quota` — daily quota counters reached 80% of the configured cap.
- `degraded` — probe succeeded but slow.
- `exhausted` — daily quota counter hit its cap; routing deprioritizes it.
- `unavailable` — probe failed or provider in cooldown; consecutive-failure count tracked.

Latency uses an exponential moving average with a configurable window
(default 8 probes), so one slow request does not flip routing. Probes run on
start, then on a timer (`unref`'d so it never holds the process open); checks
are serialized (single-flight) to avoid probe storms.

Cooldowns: `cooldown(providerId, ms, reason)` / `inCooldown(providerId, now)`.
The duration comes from the upstream `Retry-After` header when present (seconds
or HTTP-date, capped at 24 h), otherwise 60 s. Cooldowns self-expire on read.
Quota counters accumulate per provider per UTC day (requests, tokens in/out)
and roll over at midnight, restoring lower statuses.

## 5b. Model catalog: freshness, cooldowns, ranking

`ModelCatalog` keeps a per-provider, per-model state keyed `provider/model`:

- `listing(providerId, liveIds)` intersects the upstream list with per-model
  cooldowns — a model that just answered `400`/`404` disappears from the
  `GET /v1/models` output until the cooldown (`catalog.modelCooldownMs`, default
  30 min) expires, then is retried automatically.
- `prune(providerId, liveIds)` evicts unknown model ids not seen upstream for
  over an hour.
- `report()` powers `GET /freeflow/status` (currently cooled models + reasons).

`buildCatalog` merges live listings with health state into a ranked list:

1. Each model is categorized by name heuristics (`reasoning`, `coder`, `vision`,
   `image`, `audio`, `embedding`, and the size buckets `small`/`fast`/`large`,
   default `chat`).
2. Each model is scored: provider health (healthy > low_quota > degraded >
   exhausted > unavailable), provider latency, tier (`keyless`/`subscription`
   preferred, `byok` neutral, `usage-based` deprioritized), and category
   suitability for chat.
3. The list is sorted by score desc and assigned dense `rank` values; category
   counts feed `summaryByCategory`.

The same code powers the runtime endpoints and the offline snapshot script.

## 5c. Freshness automation

`.github/workflows/catalog-check.yml` runs hourly (GitHub Actions free tier):

1. `scripts/catalog-check.mjs` fetches each keyless upstream's model catalog
   through the production provider code (not a copy of it).
2. It sends one tiny real chat request (`max_tokens: 5`) to a verified probe
   model per provider as end-to-end evidence, with a single spaced retry when
   a provider's per-minute rate limit trips.
3. It writes the ranked, categorized snapshot to `docs/MODELS.json` + a
   rendered `docs/MODELS.md` with per-provider ✅/❌ probe evidence, and commits
   it only when content changed (git user: VuDube).
4. The script never exits non-zero: upstream outages must mark the snapshot
   honestly, not fail the workflow.

The running gateway never depends on the snapshot — it verifies upstream in
real time. The snapshot exists so humans (and this repo) can audit what was
actually available, which is the only honest claim a free-tier aggregator can
make.

## 6. Security model

- The gateway binds `127.0.0.1` by default; no LAN, no remote exposure,
  no tunnels anywhere in the codebase.
- Optional `server.apiKey` enables bearer auth on `/v1/*`, `/freeflow/*`,
  and `/readyz`; CORS allows only loopback-style browser usage.
- `gemini-oauth.js` reads the bridge state file only to discover an
  `endpoint`/`port`; token material in any file is never parsed into logs or
  forwarded, and failures fall back to explicit unavailability.
- Config user override path is `~/.dsh/freeflow.json`; provider `apiKey`
  values live only there (or in the environment of the process running the
  upstream tools) and are sent only to the configured upstream base URL.

## 7. DSH integration path

`cordis.patch.yml` inserts a `freeflow` row (`dsh.bundle.patch` in
package.json is the bundle manifest field used by audited community plugins,
e.g. `dsh-gemini-oauth-bridge`). After `dsh plugin --profile web add`, users
point DSH's model provider at the gateway URL (USER_GUIDE Phase 1/4). Because
DSH can consume any OpenAI-compatible endpoint, this integration survives DSH
preview churn without code changes.

Deviations from the original product brief, with reasons:

- `require('cordis')` / `CordisPlugin` class: not the real DSH plugin API
  (bare `cordis` doesn't resolve in DSH mounts; plugins declare themselves via
  `dsh.*` package fields). Replaced with the documented `dsh.bundle.patch`
  convention used by all audited community plugins.
- npm name `@dsh/freeflow` -> `dsh-freeflow`: the `@dsh`/`@deepseek-ai`
  scopes are reserved to the DSH kernel; third-party plugins publish unscoped
  (e.g. `dsh-opencode-free`).
- OAuth is consumed as a service (via dsh-gemini-oauth-bridge) rather than
  re-implementing the Google Code Assist OAuth protocol; this keeps tokens in
  the audited bridge implementation and avoids duplicating its single-flight
  refresh and replay logic.

## 8. Testing strategy

`node --test` with zero dependencies:

- Unit: status classification, EMA, failure recovery, `Retry-After` parsing,
  cooldown set/expire, quota counters + UTC rollover, build order (cooldown
  exclusion + default pin), model catalog freshness/pruning, model
  classification and ranking, BYOK presets, provider instantiation/type
  resolution, Kilo `isFree` filtering (with a stubbed `fetch`), no-retry
  failover, model parsing, config layering.
- Router: failover chains, pinned models, exhaustive-failure 502.
- Integration: real loopback servers (mock upstreams), asserting connection
  establishment, response headers, provider headers, optional auth, and
  failure envelopes.

CI runs the same suite on Node 22 and 24 (DSH's supported engines).
