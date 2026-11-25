# USER_GUIDE.md — dsh-freeflow by VuDube

A complete, noob-friendly manual. If you can run one terminal command, you can
run this plugin.

## Phase 0 — What you need

| Requirement | Check |
|---|---|
| DeepSeek Harness (DSH) 0.2.x | `dsh --version` |
| Node.js 22.19+ or 24+ | `node --version` |
| Nothing else | No API keys, no VPS, no credit card |

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
answers only if you have it running locally; the anonymous path is always on.)

## Phase 2 — First chat session

### In the DSH Web UI

1. Start a chat.
2. Open **Settings → Models** (or the model picker).
3. Pick any model under **freeflow** — for example `anonymous/qwen-3`.
   The system suggests **Anonymous OpenCode Zen** first; press Enter or click it.
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
| `freellmpool/auto` | let freellmpool pick the route |
| `freellmpool/<model>` | a specific freellmpool catalog model |
| `gemini-oauth/<model>` | Gemini through your Google subscription |

Sending an unprefixed model uses your `defaultProvider`.

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

Edit `~/.dsh/freeflow.json`:

```json
{
  "defaultProvider": "anonymous",
  "autoFailover": true,
  "streaming": true,
  "server": { "host": "127.0.0.1", "port": 8787, "apiKey": "" },
  "providers": {
    "anonymous":   { "enabled": true, "baseUrl": "https://opencode.ai/inference/v1", "apiKey": "", "models": [] },
    "freellmpool": { "enabled": true, "baseUrl": "http://127.0.0.1:8080/v1", "model": "auto" },
    "gemini-oauth": { "enabled": true, "endpoint": "" }
  },
  "healthCheck": { "intervalMs": 30000, "timeoutMs": 4000, "degradedAboveMs": 2000 }
}
```

| Setting | What it does |
|---|---|
| `defaultProvider` | tried first: `anonymous`, `freellmpool`, or `gemini-oauth` |
| `autoFailover` | on failures/timeouts/429/5xx, retry the next healthy provider |
| `streaming` | master switch for SSE token streaming |
| `server.apiKey` | require `Authorization: Bearer <key>` against the gateway |
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

## Troubleshooting

| Symptom | Fix |
|---|---|
| `readyz` says 503 | all providers unreachable; check internet, freellmpool process |
| Anonymous chat returns 4xx from Zen | the free-tier gate inspects request shape and usage; retry later, set `providers.anonymous.apiKey`, or let failover kick in |
| Model picker missing models | run `curl 127.0.0.1:8787/v1/models` — provider was unhealthy at refresh time |
| Gateway port busy | change `server.port` in `~/.dsh/freeflow.json` |
| Plugin not visible after install | bundle needs a DSH restart: `dsh web` |

## Safety notes

- The gateway binds to `127.0.0.1` only and is never exposed to your network.
- Set `server.apiKey` on shared machines.
- This is a community plugin: MIT licensed, no telemetry, no accounts.
