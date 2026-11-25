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
  index.js              config loader, router (order + failover), HTTP gateway,
                        plugin entry (exported factory + default export)
  standalone.js         run the gateway without DSH (`npm start`)
  providers/
    anonymous.js        OpenCode Zen: https://opencode.ai/inference/v1,
                        anonymous-first, optional Zen API key
    freellmpool.js      local freellmpool proxy: /readyz, /v1/models?ready=true
    gemini-oauth.js     dsh-gemini-oauth-bridge endpoint discovery + proxy
  config/default.json   shipped defaults; user overrides in ~/.dsh/freeflow.json
  utils/healthCheck.js  HealthMonitor: probes, latency EMA, status classification
test/                   node:test unit + integration tests (mock upstreams)
.github/workflows/ci.yml  Node 22/24 matrix: syntax checks + full test suite
```

## 3. Provider contract

Every provider is a factory `(config) => provider` with:

| Member | Semantics |
|---|---|
| `id` / `label` | router identity and human name |
| `probe(timeoutMs)` | cheap liveness/readiness check returning `bool` |
| `listModels(timeoutMs)` | model ids, best-effort, failure returns `[]` |
| `chat(request, {signal, timeoutMs})` | forwards an OpenAI chat request, returns the raw upstream `Response` (so SSE streams pass through untouched) |

Adding a provider means adding one file, registering it in
`PROVIDER_FACTORIES`, and adding a config block. Nothing else changes.

## 4. Routing algorithm

Order construction (`buildOrder`):

1. `defaultProvider` pinned first (when enabled).
2. Remaining enabled providers sorted by health status
   (`healthy < degraded < unavailable`), then by latency EMA.

Request flow (`routeChat`):

1. `model` may be namespaced (`provider/model`); a recognized prefix pins the
   provider and strips the prefix before forwarding. Unprefixed models route
   via the order above.
2. Iterate the order. A provider attempt ends in one of:
   - **success** (`2xx`): recorded as healthy (latency sample), response returned.
   - **transient failure** (network error, timeout, `408`, `429`, `5xx`): recorded
     as unhealthy, next provider attempted.
   - **non-transient failure** (other `4xx`): returned to the client as-is —
     a bad request or bad model id is not fixed by retries.
3. All providers exhausted -> `502` with per-provider attempt diagnostics in
   the body.

Failover happens before the first byte of the response is forwarded. Once
streaming has started, the stream is passed through unmodified; mid-stream
failover would require replaying partial output and is out of scope (this
matches freellmpool's bounded-streaming stance).

## 5. Health monitoring

`HealthMonitor` mirrors freellmpool's capacity vocabulary:

- `healthy` — probe succeeded below `degradedAboveMs` (default 2s).
- `degraded` — probe succeeded but slow.
- `unavailable` — probe failed; consecutive-failure count tracked.

Latency uses an exponential moving average with a configurable window
(default 8 probes), so one slow request does not flip routing. Probes run on
start, then on a timer (`unref`'d so it never holds the process open); checks
are serialized (single-flight) to avoid probe storms.

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

- Unit: status classification, EMA, failure recovery, build order, model
  parsing, config layering.
- Router: failover chains, pinned models, exhaustive-failure 502.
- Integration: real loopback servers (mock upstreams), asserting connection
  establishment, response headers, provider headers, optional auth, and
  failure envelopes.

CI runs the same suite on Node 22 and 24 (DSH's supported engines).
