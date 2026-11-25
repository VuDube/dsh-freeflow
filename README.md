<div align="center">

# dsh-freeflow

**VuDube** — Free-tier LLM router for DeepSeek Harness (DSH).

*Zero cost. Plug-and-play. One endpoint, many free providers.*

[![CI](https://github.com/VuDube/dsh-freeflow/actions/workflows/ci.yml/badge.svg)](https://github.com/VuDube/dsh-freeflow/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-vudube.github.io%2Fdsh--freeflow-blue)](https://vudube.github.io/dsh-freeflow/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH plugin](https://img.shields.io/badge/DSH-plugin-8A2BE2)](https://github.com/deepseek-ai/deepseek-harness)

</div>

`dsh-freeflow` exposes a single OpenAI-compatible gateway on your machine and
routes every request to the best available **free** provider:

| Provider | Cost | How it works |
|---|---|---|
| `anonymous` | $0 | OpenCode Zen free models via `https://opencode.ai/inference/v1`, no API key |
| `freellmpool` | $0 | [freellmpool](https://github.com/0xzr/freellmpool) local gateway, health-aware smart routing |
| `gemini-oauth` | $0 (subscription quota) | Gemini via the [dsh-gemini-oauth-bridge](https://github.com/hyqhyq3/dsh-gemini-oauth-bridge) OpenAI-compatible endpoint |

The router checks provider health (lightweight probes, latency EMA),
pins your default provider first, and fails over automatically on network
errors, timeouts, rate limits (429) and upstream 5xx.

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
are namespaced per provider, e.g. `anonymous/qwen-3`, `freellmpool/auto`,
`gemini-oauth/gemini-3-flash`.

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
    }
  }
}
```

- **Gateway binds to loopback only.** Set `server.apiKey` to require a bearer
  token if other local users exist.
- Gemini models require a one-time Google sign-in through
  [dsh-gemini-oauth-bridge](https://github.com/hyqhyq3/dsh-gemini-oauth-bridge)
  (Settings → Gemini OAuth). `dsh-freeflow` then detects the bridge state file
  (`~/.dsh/gemini-oauth-bridge.json`, mode 0600) or uses the `endpoint` you set.
  Token contents are never read, logged, or transmitted anywhere.

## Status, health, and routing

- `GET /healthz` — liveness
- `GET /readyz` — 200 only when at least one provider is healthy
- `GET /freeflow/status` — full provider health snapshot
- `GET /v1/models` — merged, provider-namespaced model catalog

Provider labels mirror freellmpool's capacity model: `healthy`, `degraded`
(healthy but slow), `unavailable`.

## Documentation

- [User Guide](docs/USER_GUIDE.md) — step-by-step, from install to first chat
- [Architecture](docs/ARCHITECTURE.md) — design, routing, security decisions
- [Contributing](.github/CONTRIBUTING.md)

## Honest limits

- DSH is in developer preview and its plugin APIs are version-pinned; the
  gateway described above is the stable surface and works with any
  OpenAI-compatible client even if DSH plugin conventions shift between
  releases.
- Free upstreams (OpenCode Zen anonymous tier, freellmpool routes) are
  third-party services that can rate-limit or change without notice. The
  router mitigates this with failover; it cannot guarantee upstream
  availability.

## License

[MIT](LICENSE) — © VuDube
