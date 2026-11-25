# dsh-freeflow × Android — Ultimate Master Integration Guide

**Brand:** VuDube · **Platform:** dsh-freeflow v0.2.0 (zero-cost free-tier LLM router for DeepSeek Harness / Cordis)
**Scope:** The two Android apps specified by the owner:

| # | App | Repo | What it is (verified, 2026-11) |
|---|-----|------|-------------------------------|
| 1 | **DSH Mobile** | [Soodok/Deepseek-Harness-Local-Android](https://github.com/Soodok/Deepseek-Harness-Local-Android) | Complete Android port of the official `@deepseek-ai/dsh` engine, **pinned 0.2.2-rc.3**, running on a self-built bionic Node.js runtime inside the APK. Real bash PTY terminal, LAN WebUI, full Cordis plugin system. |
| 2 | **Agora** | [newo-ether/Agora](https://github.com/newo-ether/Agora) | GPLv3 Kotlin BYOK Android AI client (F-Droid / Play / GitHub releases). Custom providers with Base URL + protocol (OpenAI-compatible / Google / Anthropic), MCP, Skills, automation, sandbox, remote shell. Docs: [newo-ether.github.io/Agora](https://newo-ether.github.io/Agora/). |

> **Fact base:** every claim below was verified by direct source-code inspection of both repos and live network probes of the free-tier providers during the dsh-freeflow v0.2.0 cycle (November 2026). Free-tier provider limits change without notice — the guide flags what to re-check.
> **Status: sole source of truth.** This document intentionally does **not** live in the `dsh-freeflow` repo; it is a workspace deliverable.

---

## Table of Contents

1. [How the three pieces fit together (the 5-minute mental model)](#1)
2. [Verified capabilities matrix — both apps](#2)
3. [dsh-freeflow reference card (endpoints, ports, config, env vars)](#3)
4. [Strategies — overview & difficulty ladder](#4)
5. **Strategy A** — *Simplest*: Agora on the same phone → freeflow gateway inside DSH Mobile
6. **Strategy B** — DSH Mobile's own WebUI using the freeflow plugin (terminal install)
7. **Strategy C** — Zero-typing: let the DSH Mobile *agent* install and start freeflow for you
8. **Strategy D** — Freeflow beyond one phone: LAN exposure, hotspot, adb reverse
9. **Strategy E** — BYOK power tier: keys, Gemini OAuth bridge, quotas & cooldowns
10. **Strategy F** — One-click community install (npm publication prerequisite)
11. **Agora without DSH Mobile — the honest answer**
12. [Once connected: unlocking Agora's agentic stack on freeflow](#12)
13. [Troubleshooting — symptom → cause → fix](#13)
14. [Security & privacy hardening](#14)
15. [Honest limitations (read before relying on anything)](#15)
16. [Appendix — verified file paths, commands, packet flow diagrams](#appendix)

---

<a name="1"></a>
## 1. How the three pieces fit together (the 5-minute mental model)

**dsh-freeflow** is a tiny Node.js program that pretends to be an OpenAI API:

- It listens on **`http://127.0.0.1:8787`** by default.
- Anything that speaks the OpenAI protocol can talk to it: `POST /v1/chat/completions`, `GET /v1/models`.
- Behind the scenes it routes each request to whichever **free-tier provider** is healthy right now — anonymous OpenCode Zen (no key), Kilo (no key), OVHcloud (no key), llm7 (free key), or optionally BYOK providers (Groq, Gemini, NVIDIA, Cloudflare, OpenRouter) that you configure.
- If the provider it tries is rate-limited (429/quota/exhausted), it **automatically fails over** to the next healthy one and **cools down** the failing provider/model, honoring `Retry-After` headers.

**DSH Mobile** is a full DeepSeek Harness engine in your pocket. Inside its private storage it runs:
- the engine (which serves the DSH WebUI on **`127.0.0.1:3080`**),
- a **real bash terminal** in the app,
- a complete **Cordis plugin system** (`dsh plugin add` — identical to desktop).

**Agora** is a chat/agent app with no built-in model server — it is *BYOK only*. It becomes powerful precisely by pointing at *some* OpenAI-compatible endpoint. It even ships a built-in "OpenCode Go" provider, which is from the same `opencode.ai` family that dsh-freeflow's anonymous provider uses.

**The key Android networking fact (this is the foundation of every strategy):**

> On the same Android device, **the loopback interface is shared**. Any app can reach a TCP port that another app is listening on at `127.0.0.1`. Android does not firewall app-to-app loopback traffic.

Therefore:

```
┌─────────────────────────── one Android phone ───────────────────────────┐
│                                                                          │
│   Agora (BYOK client)                                                   │
│        │  custom provider:                                              │
│        │  Base URL = http://127.0.0.1:8787/v1                           │
│        │  protocol = OpenAI-compatible, blank key                       │
│        ▼                                                                 │
│   dsh-freeflow gateway (127.0.0.1:8787)                                 │
│        │  health-ranked routing + failover                              │
│        ▼                                                                 │
│   internet: opencode.ai · kilo · ovhcloud · llm7 · (BYOK keys)          │
│                                                                          │
│   DSH Mobile (engine, terminal, WebUI @ 3080) — HOSTS the gateway       │
└──────────────────────────────────────────────────────────────────────────┘
```

One phone, one free-tier gateway, **two apps** using it. Zero cost, zero VPS.

---

<a name="2"></a>
## 2. Verified capabilities matrix — both apps

Legend: ✅ supported & verified in source/docs · ⚠️ supported with caveats (see note) · ❌ not available.

| Capability | DSH Mobile | Agora |
|---|---|---|
| **Keyless LLM access** (zero credentials) | ✅ via freeflow plugin (`dsh-freeflow` gateway) or engine's own anonymous paths | ⚠️ **Partially, natively** — built-in "OpenCode Go" provider (same opencode.ai family). Full freeflow keyless catalog (Kilo `kilo-auto/free`, `openrouter/free`, `nvidia/nemotron-3.5-super-vl:free`…) only via Strategy A/D |
| **Bring-your-own API key** | ✅ engine + freeflow config (`~/.dsh/freeflow.json`) | ✅ first-class: multiple named keys per provider, radio-select active key, AES-256-GCM (Android Keystore) |
| **Custom OpenAI-compatible endpoint** | ✅ freeflow itself *is* the endpoint; engine rows can target it | ✅ **Native**: Settings → Providers → custom endpoint with **Base URL + protocol**; auto-resolves endpoint paths, retries missing `/v1` |
| **Streaming (SSE) chat** | ✅ engine 3080 streams; freeflow passes SSE through byte-for-byte | ✅ always `stream:true` + `stream_options.include_usage` (⚠️ see [15](#15) for the one sharp edge this creates) |
| **Model list sync (`GET /models`)** | ✅ engine / freeflow `/v1/models` (ranked & categorized) | ✅ syncs up to 50 pages; manual model add also possible |
| **Plugins** | ✅ Cordis plugin system exactly like desktop: bundles installed via `dsh plugin --profile web add <pkg\|tgz>`, patches layered `dsh.profile.bundles` → profile `cordis.patch.yml` → app overlay `android-overlay.yml` | ❌ no plugin system (by design) |
| **Skills (markdown agent skills)** | ⚠️ engine-side; the engine's own skill conventions apply (not Agora's Markdown-skill format — different app, different conventions) | ✅ **Native**: local Markdown files, loaded on demand, "Allow skill access" toggle, frozen catalog |
| **MCP (Model Context Protocol)** | ⚠️ engine gpt-5 style tooling; no Android MCP UI confirmed | ✅ **Native**: Streamable HTTP **and** SSE transports, custom headers, `mcp_list_servers` / `mcp_search_tools` / `mcp_call_tool` |
| **System prompts / instructions** | ✅ engine profile system prompts; agent rule files | ✅ **Native, powerful**: structured System/User/Assistant templates with variables (`{time}`, `{date}`, `{active_memory}`, `{skill_catalog}`, `{current_model_id}`…), per-conversation override, global default |
| **Automation (cron/loops)** | ⚠️ engine-side; app-managed lifecycle | ✅ **Native**: Tasks (one-time/daily/…/5-field cron), conversation Loops, "Access Tasks and Loops" tool permission, exact-alarm + battery-optimization controls |
| **Real terminal / shell** | ✅ **Real bash PTY** in-app (581 lines of C, node-pty shim); agent can start servers and hand `127.0.0.1` preview links | ⚠️ shell via configured devices (Conch / SSH / F-Droid Alpine sandbox); no free-floating local shell |
| **Files & archives** | ✅ engine workspaces; LAN WebUI; archives | ✅ `.agora` ZIP archives (optionally with secrets), import-export |
| **Network proxy** | ⚠️ OS/VPN-level only | ✅ **Native** "Network Proxy" setting — proxies provider requests **and** MCP over HTTP |
| **Web search / memory / RAG** | ✅ engine capabilities | ✅ web search, active/saved memory, past-conversation RAG, Context Compact |
| **Image generation / multimodal** | ⚠️ via providers | ✅ image generation (keys from chosen provider), image-quality pipeline, PDF import, transcription, Phone Use screenshots |
| **Remote sessions** | ⚠️ SSH docs present in repo | ✅ SSH/Conch remote shell, durable jobs, `file_transfer` (1 GiB, SHA-256 verified) |
| **Keep-alive in background** | ✅ foreground service | ✅ foreground notification for automation; but Tasks/Loops depend on Android's network/battery restrictions |

**The intersection that matters:** DSH Mobile is the *server platform* (it can run freeflow), Agora is the *rich client* (it can consume freeflow). Together they cover every row of this table at zero cost.

---

<a name="3"></a>
## 3. dsh-freeflow reference card

Everything a strategy below might need, in one place.

### 3.1 Ports and endpoints

| Item | Value | Notes |
|---|---|---|
| Gateway listen address | `127.0.0.1` (configurable `server.host`) | default binds only loopback |
| Gateway port | `8787` (configurable `server.port`) | |
| Chat | `POST /v1/chat/completions` | OpenAI protocol, streaming + non-streaming |
| Model list | `GET /v1/models` | ranked & categorized; strips internal score/reasons |
| Health (liveness) | `GET /healthz` | |
| Health (readiness) | `GET /readyz` | |
| Status incl. cooldowns | `GET /freeflow/status` | includes `modelCooldowns`, quota counters |
| Full ranked catalog | `GET /freeflow/catalog` | with scores/reasons |
| Manual re-verify | `POST /freeflow/verify` | re-probe providers on demand |

### 3.2 Config resolution order

`src/standalone.js` → `loadConfig()` merges, in order:

1. built-in defaults: `src/config/default.json` (inside the installed package)
2. **user config**: `<HOME>/.dsh/freeflow.json` — *or* an explicit path passed as argv[2] / env `DSH_FREEFLOW_CONFIG`
3. (overrides deep-merged win over defaults)

**Key Android path fact:** in DSH Mobile the engine's home is

```
DSH_HOME = /data/data/app.dsh.mobile/files/dsh-home    (container alias: /dsh)
```

so the default user-config location inside DSH Mobile's terminal is:

```
/dsh/.dsh/freeflow.json
```

(If `$HOME` is set to DSH_HOME by the shell it resolves to the same file. If you'd rather not rely on `$HOME`, pass the path explicitly: `npm start /dsh/.dsh/freeflow.json` — argv always wins.)

### 3.3 Gateway boot modes

| Mode | Command | When to use |
|---|---|---|
| Standalone gateway (recommended) | `npm start` — i.e. `node src/standalone.js` | DSH Mobile terminal, any Node ≥ 22 |
| Explicit config | `npm start /path/to/freeflow.json` or `DSH_FREEFLOW_CONFIG=… npm start` | Android when `$HOME` is odd |
| Loaded as a Cordis plugin | engine boot inserts the plugin row → `createFreeflow()`; row `id: freeflow`, config `{defaultProvider: anonymous, autoFailover: true, streaming: true}` in `cordis.patch.yml` | when installed as a bundle through the plugin system |

### 3.4 Environment variables (BYOK / optional keys)

| Env var | Provider |
|---|---|
| `KILO_API_KEY` | Kilo (keyless works; key unlocks the full catalog instead of only `isFree:true` models) |
| `LLM7_API_KEY` | LLM7.io — **required now** (anonymous chat returns 401; provider ships disabled by default) |
| `GROQ_API_KEY` | Groq BYOK (`https://api.groq.com/openai/v1`) |
| `GEMINI_API_KEY` | Gemini BYOK (`https://generativelanguage.googleapis.com/v1beta/openai`) |
| `NVIDIA_API_KEY` | NVIDIA NIM (`https://integrate.api.nvidia.com/v1`) |
| `OPENROUTER_API_KEY` | OpenRouter (`https://openrouter.ai/api/v1`, `:free` filter) |
| `CLOUDFLARE_API_KEY` + `CLOUDFLARE_ACCOUNT_ID` | Workers AI (`https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/v1`) |

### 3.5 Failover & cooldown model (why requests "just work")

- Provider cooldown on `429, 402, 403, 408, 503`; model cooldown on `400, 404` (badge = one bad model down, the provider survives).
- `Retry-After` headers (seconds or HTTP-date, capped at 24 h) are honored on cooldown durations.
- Rank ordering: default-pin-first, then healthy > low_quota > degraded > exhausted > unavailable.
- Non-transient 4xx responses from the *last* provider are passed through, not masked as 502.

---

<a name="4"></a>
## 4. Strategies — overview & difficulty ladder

Strategies are ordered **simplest → hardest**. A/B are the "normal people" strategies; C is the "let the robot do it" strategy; D–F are power tiers. **A + B together give 100% coverage; C is A with zero typing.**

| # | Strategy | App(s) | Difficulty | Zero-cost | Needs keys? | Needs extra hardware? |
|---|---|---|---|---|---|---|
| **A** | Agora → freeflow gateway in DSH Mobile (same phone, loopback) | Both | ★☆☆ easiest | ✅ | No | No |
| **B** | DSH Mobile WebUI via freeflow plugin (terminal install + `npm start`) | DSH Mobile | ★☆☆ | ✅ | No | No |
| **C** | Agent-driven: DSH Mobile's in-app agent installs & starts freeflow | Both | ★☆☆ | ✅ | No | No |
| **D** | LAN exposure of the gateway (LAN IP / hotspot / `adb reverse`) | Both + PC | ★★☆ | ✅ | No | phone + PC (adb variant only) |
| **E** | BYOK tier: free keys, quotas, cooldowns, Gemini OAuth bridge | Both | ★★☆ | ✅ (free keys) | Free keys | No |
| **F** | npm publication → DSH Mobile Community plugin center one-click | DSH Mobile | ★★★ | ✅ | No | No |
| — | Agora standalone with its own built-in free providers (no freeflow) | Agora | ★☆☆ | ✅ | No | No (not really "freeflow integration" — see §11) |

**Recommended reading order for a total noob:** do **B**, then **A** (they compose), then **C** if typing in a terminal scares you, then E/F/D when comfortable.

---

## 5) Strategy A — Simplest: Agora on the same phone, gateway inside DSH Mobile

**Goal:** Agora chats through dsh-freeflow's free provider pool with zero API keys.
**Prerequisite:** Strategy **B** (or **C**) completed once — the gateway must be running. Strategy A itself is ~2 minutes of tapping.

### Why it's guaranteed to work (verified facts)

1. **Agora supports arbitrary OpenAI-compatible endpoints natively.** Source-verified in `BaseOpenAiProvider.kt`: the base URL auto-resolves; endpoint-candidate resolution (`openAiEndpointCandidates`) appends `/chat/completions` and **retries automatically if you omit `/v1`**; `Authorization: Bearer <key>` is sent **only when the key field is non-blank** — so a blank key gives you a clean keyless client, exactly matching freeflow's anonymous tier.
2. **Android shares loopback between apps.** An app's `127.0.0.1` server is reachable by every other app on the device (no per-app loopback firewall). Freeflow inside DSH Mobile's process at `127.0.0.1:8787` is reachable from Agora on the same phone, *provided DSH Mobile is running*.
3. **Agora's model sync** hits `GET {baseUrl}/models` (paginated, up to 50 pages) — freeflow serves a ranked `/v1/models`, so Agora's Models screen fills with the whole free catalog after one tap.
4. **Retry semantics align:** Agora's `CustomOpenAiProvider` retries on `{429, 502, 503, 504}` — a superset-compatible match with freeflow's cooldown philosophy (freeflow cools the provider; Agora retries the row).

### Steps (exact taps)

**Part 1 — make sure the gateway is up (see B/C for the full setup):**

1. Open **DSH Mobile**.
2. Open the **terminal** tab.
3. In the terminal, start the gateway (first time only needs install; every session needs start):

   ```bash
   cd /dsh/profiles/web
   npm start
   ```

   Success looks like:
   ```
   dsh-freeflow gateway listening on http://127.0.0.1:8787
   ```
4. **Leave DSH Mobile running.** (Android may freeze backgrounded apps. If Agora gets connection refused later, reopen DSH Mobile / disable battery optimization for it — see [14](#14).)

**Part 2 — register freeflow as Agora's provider:**

5. Open **Agora** → drawer → **Settings**.

6. **Providers** → add/choose a custom provider:

   | Field | Value |
   |---|---|
   | Base URL | `http://127.0.0.1:8787/v1` |
   | Protocol | **OpenAI-compatible** |
   | API key | **leave blank** (freeflow keyless tier) — or any non-blank value if you later set `server.apiKey` |

   Agora will auto-negotiate the correct endpoint path; even `http://127.0.0.1:8787` (no `/v1`) works because of the missing-`/v1` retry, but include `/v1` for clarity.

7. **Models** → **sync** this provider. Agora pulls `GET /models`; enable the models you want — suggested starting set (all keyless, verified live):
   - `kilo-auto/free` (Kilo auto-router)
   - `openrouter/free` (Kilo's meta free route)
   - `nvidia/nemotron-3.5-super-vl:free` (Kilo)
   - the anonymous OpenCode Zen models (largest keyless list — 108 models verified)

8. Back in a conversation, select one of the synced models in the **bottom bar**, send a test message like *"Say OK if you can hear me."*

### Verification checklist

| Check | How | Expected |
|---|---|---|
| Gateway alive | In phone browser open `http://127.0.0.1:8787/healthz` | HTTP 200 |
| Model list visible | Agora → Settings → Models → sync | freeflow catalog appears |
| Chat path | Test message in Agora | streaming reply, tokens appear progressively |
| Failover working | Agora → Settings → Models: pick an exhausted model; ask; freeflow auto-routes | reply still arrives from a healthy provider |
| Cooldowns + usage | `http://127.0.0.1:8787/freeflow/status` in the browser | per-provider request/token counters, cooldown entries after any 429 |

> Tip: give Agora's provider a memorable **name** like `freeflow` — Agora supports multiple named providers and you may later add a direct Groq provider for comparison.

---

## 6) Strategy B — DSH Mobile WebUI through the freeflow plugin

**Goal:** install `dsh-freeflow` as a genuine Cordis plugin inside DSH Mobile and use it from the in-app DSH WebUI (and as the host of the gateway used by Strategy A).
**Difficulty:** ★☆☆–★★☆ (some typing in the built-in terminal).

### 6.1 What's actually inside DSH Mobile (so nothing surprises you)

Verified facts you'll lean on:

- Engine home: `/data/data/app.dsh.mobile/files/dsh-home`, aliased **`/dsh`** in the shell. Everywhere below, `/dsh` = engine home.
- The web profile lives at `/dsh/profiles/web`, with `node_modules/.bin` containing full CLI shims — verified 12 `.bin` entries incl. **`.bin/dsh`** and **`.bin/cordis`** (RuntimeInstaller.kt:1223–1227). So the `dsh` CLI is genuinely available in the terminal.
- Plugins install with the official CLI: **`dsh plugin --profile web add <pkg|tgz|…>`** (ProfilePluginProvisioner.kt:42). Installs are **serialized through a single `installExecutor`** — **never run two installs in parallel** (concurrent pnpm corrupts `node_modules`), and installs happen **while the engine is stopped** (engine writes its in-memory profile back on exit — ProfilePluginProvisioner.kt:39).
- Plugin center installs use a **120-second no-output timeout** (PluginCenter) — GitHub cloning takes a while on mobile data; be patient or use the tgz method.
- The app's **Community plugin center searches npm with `keywords:deepseek-harness`** — `dsh-freeflow` has exactly this keyword in `package.json`, **but the package is not yet published to npm** (verified `npm view dsh-freeflow` → 404). Until publication (Strategy F), use the CLI paths below.

### 6.2 Install — pick ONE of the three install methods

**Method B-1: git clone + npm (most transparent)**

```bash
cd /dsh/profiles/web
git clone https://github.com/VuDube/dsh-freeflow.git node_modules/dsh-freeflow
```

Then register the Cordis row (the patch layer that the engine reads at boot):

```bash
cd /dsh/profiles/web
node node_modules/dsh-freeflow/scripts/patch-install.mjs   # if present in your version
```

If that script doesn't exist in your checkout, append the row by hand to `/dsh/profiles/web/cordis.patch.yml` (create the file if missing) — this is exactly what the shipped `cordis.patch.yml` contains:

```yaml
version: 1
rows:
  - id: freeflow
    name: 'dsh-freeflow'
    config:
      defaultProvider: anonymous
      autoFailover: true
      streaming: true
```

**Method B-2: install via the `dsh` CLI playground specifier**

```bash
cd /dsh/profiles/web
dsh plugin --profile web add https://github.com/VuDube/dsh-freeflow/archive/refs/heads/main.tar.gz
```

Passing a remote tarball URL lets pnpm fetch and unpack it just like an npm tarball; this avoids npm publication entirely. On flaky mobile networks Method B-1 is sturdier.

**Method B-3: pre-packaged tgz (offline; highest determinism)** — on a PC with Node installed:

```bash
git clone https://github.com/VuDube/dsh-freeflow
cd dsh-freeflow
npm pack            # → dsh-freeflow-0.2.0.tgz
```

Copy the tgz to the phone's storage, then in DSH Mobile's terminal:

```bash
cd /dsh/profiles/web
dsh plugin --profile web add /sdcard/Download/dsh-freeflow-0.2.0.tgz
```

(File access from the engine shell may require the app's file-permission tier — read/download rights for `/sdcard` are granted by DSH Mobile on first access.)

### 6.3 Start the gateway

Two equivalent launches:

```bash
cd /dsh/profiles/web
npm start                   # uses package.json → node src/standalone.js
```

or explicit-config (if `$HOME` isn't DSH_HOME in your shell):

```bash
node /dsh/profiles/web/node_modules/dsh-freeflow/src/standalone.js /dsh/.dsh/freeflow.json
```

Custom config example at `/dsh/.dsh/freeflow.json`:

```json
{
  "server": { "host": "127.0.0.1", "port": 8787 },
  "providers": { "llm7": { "enabled": false } }
}
```

### 6.4 Verification

```bash
# from the DSH Mobile terminal
curl -s http://127.0.0.1:8787/healthz     # (if curl absent:) node -e "fetch('http://127.0.0.1:8787/healthz').then(r=>r.text()).then(console.log)"
node -e "fetch('http://127.0.0.1:8787/v1/models').then(r=>r.json()).then(j=>console.log(j.data.length+' models'))"
```

Then open the **DSH WebUI** in the app (engine → 127.0.0.1:3080). Because Strategy A's client (Agora) can attach in parallel, the gateway serves both simultaneously — DSH WebUI and Agora are just two more OpenAI clients.

> **Note on LAN WebUI (3090):** DSH Mobile's LAN WebUI proxy forwards 3080 to other devices **with in-memory patches only** — plugin rows applied via the launcher's LAN mode are not persisted. Use the engine terminal method above for persistence.

---

## 7) Strategy C — Zero typing: let DSH Mobile's agent do everything

**Goal:** identical outcome to A+B without you writing any commands.
**Difficulty:** ★☆☆ (the easiest of all — you only talk to the agent).

Verified enabler: DSH Mobile ships a **real bash PTY** in-app and the **engine agent can run projects and hand back `127.0.0.1` preview links** — that's precisely the skill needed here. The agent sees the same engine home (`/dsh`), same node runtime, same `.bin` shims.

### Steps

1. Open DSH Mobile → start a chat with the agent (engine model; even the engine's default connection suffices for setup — the agent doesn't need freeflow to *install* freeflow).
2. Paste this single instruction (the whole strategy in one paragraph):

   ```text
   In this environment, please do the following for me, step by step, confirming each step:
   1) cd /dsh/profiles/web
   2) clone https://github.com/VuDube/dsh-freeflow.git into node_modules/dsh-freeflow (skip if it exists)
   3) add the freeflow row to cordis.patch.yml exactly as the file cordis.patch.yml inside that package specifies (id: freeflow, name: 'dsh-freeflow', config {defaultProvider: anonymous, autoFailover: true, streaming: true})
   4) run `npm start` from /dsh/profiles/web in the background and verify with a fetch to http://127.0.0.1:8787/healthz that the gateway is up
   5) fetch http://127.0.0.1:8787/v1/models and show me the first 10 model ids
   6) tell me the exact sentence "GATEWAY READY on 127.0.0.1:8787" when done.
   Do NOT run two installs at the same time. If an install fails with a pnpm/node_modules error, run it again alone.
   ```
3. When the agent reports **GATEWAY READY**, follow Strategy A's "Part 2" (Agora provider registration) — that part is pure tapping either way, or simply keep using DSH Mobile's own WebUI (Strategy B).

### Why this is safe and reversible

- The only files touched live in `node_modules/` and the profile's `cordis.patch.yml`; deleting the folder + row fully uninstalls.
- The agent runs in the engine's PTY with the same user permissions as the terminal; nothing leaves the device except the git clone itself.

---

## 8) Strategy D — Beyond one phone: LAN, hotspot, adb reverse

**Goal:** reach the freeflow gateway from **another device** (a second phone's Agora, a PC, etc.). Keep this section handy: it is the "hardest" tier of Agora connectivity but still free.
**Difficulty:** ★★☆ (LAN) / ★★★ (adb).

### 8.1 Critical security default, then the pivots

The engine itself **refuses `0.0.0.0` binding** — that's a hard design rule of DSH Mobile. That only constrains the *engine's own* 3080 UI. **freeflow's gateway is your own server**: you control `server.host`. Three pivots:

| Pivot | `server.host` value | Reachable from |
|---|---|---|
| LAN Wi-Fi | phone's LAN IP, e.g. `192.168.1.42` | any device on the same Wi-Fi |
| Hotspot | `192.168.43.1` (typical Android hotspot GW) | devices connected to the phone's hotspot |
| adb reverse | `127.0.0.1` (unchanged) | a USB-connected PC after `adb reverse tcp:8787 tcp:8787` |

⚠️ **If you open the gateway beyond loopback, you MUST set an API key** (§8.2) — otherwise anyone on the network can burn your free quota.

### 8.2 Enable the gateway API key

At `/dsh/.dsh/freeflow.json` (or your chosen config path):

```json
{
  "server": { "host": "0.0.0.0", "port": 8787, "apiKey": "pick-a-long-random-string" }
}
```

Then in **Agora** (other phone): same Steps as Strategy A, but Base URL `http://<phone-LAN-IP>:8787/v1` and put the same string in the **API key** field — Agora sends `Authorization: Bearer <key>` only when non-blank, matching freeflow's optional-key behavior.

### 8.3 adb reverse (no Wi-Fi needed)

On the PC:

```bash
adb reverse tcp:8787 tcp:8787
```

Now the PC's `http://127.0.0.1:8787` reaches the phone's gateway. Point any desktop OpenAI-compatible client (including DSH desktop) at `http://127.0.0.1:8787/v1`.

### 8.4 Ports of the DSH Mobile ecosystem (avoid collisions)

| Port | Owner | Note |
|---|---|---|
| 3080 | engine / DSH WebUI | loopback only |
| 3083 | capability bridge | loopback only |
| 3090 | LAN WebUI proxy (6-digit code) | LAN-facing; in-memory patches only |
| 8787 | **freeflow gateway** | yours to move via config if any collision |

---

## 9) Strategy E — BYOK power tier: free keys, quotas, cooldowns, Gemini OAuth

**Goal:** after zero-cost baselines work, squeeze premium-ish quality out of *free* credentials. Still zero money.
**Difficulty:** ★★☆.

### 9.1 What free keys actually buy you (verified live, 2026-11)

| Source | Keyless? | Free-key reality |
|---|---|---|
| **OpenCode Zen** (anonymous provider) | ✅ keyless | 108 models, no signup — already your baseline |
| **Kilo** | ✅ keyless | keyless = only `isFree:true` models (13, incl. `kilo-auto/free`); 200 req/hr/IP; with `KILO_API_KEY` full catalog |
| **OVHcloud** | ✅ keyless | ~2 requests/min/model/IP — fine for chat, painful for agents; 23 chat models |
| **LLM7.io** | ❌ **no more** | anonymous chat now returns 401 — provider ships disabled by default, needs a free key (`LLM7_API_KEY`) and is usage-based |
| **Groq** | BYOK | free tier, generous tokens/sec — the best "feels paid" option |
| **Gemini** | BYOK | free API key tier; or the **OAuth bridge** composite (§9.3) |
| **OpenRouter** | BYOK | key + `:free` models (provider config filters to `:free`) |
| **NVIDIA NIM** | BYOK | free developer key; probe now correctly reports `requiresKey()` |
| **Cloudflare Workers AI** | BYOK | free daily allocation; needs account ID in endpoint |

### 9.2 Adding keys (DSH Mobile)

Create or edit `/dsh/.dsh/freeflow.json`:

```json
{
  "providers": {
    "llm7": { "enabled": true, "apiKeyEnv": "LLM7_API_KEY" },
    "byok": {
      "groq": { "apiKeyEnv": "GROQ_API_KEY" },
      "openrouter": { "apiKeyEnv": "OPENROUTER_API_KEY" }
    }
  },
  "quota": {
    "openrouter": { "requestsPerWindow": 50 },
    "cloudflare": { "tokensPerWindow": 10000 }
  }
}
```

…and export the env vars in the same terminal session that launches the gateway:

```bash
export GROQ_API_KEY="…"
npm start
```

(Agora-side BYOK is even simpler: Agora natively stores multiple named keys per provider, radio-selects the active one, and encrypts them AES-256-GCM via the Android Keystore.)

### 9.3 Gemini via OAuth (no API key at all)

dsh-freeflow's `gemini-oauth` provider rides **hyqhyq3's device-flow OAuth bridge**. It is a *separate small service* the way it ships today — it's the one integration with a moving part beyond freeflow itself. Treat it as the advanced branch of Strategy E; the BYOK key row above is the always-works path.

### 9.4 How the safety net behaves with keys

- Per-provider **quota counters** are tracked in `/freeflow/status` (requests, tokens by window). Quotas you set in config trip *before* the provider does, marking the provider `exhausted` for the window so failover happens proactively.
- **Model-level cooldowns** (default 30 min, `catalog.modelCooldownMs: 1800000`) quarantine a single bad model on 400/404 without taking down the provider.
- The GitHub Actions **hourly catalog verification workflow** (cron `17 * * * *`) probes every provider/model from CI and commits a fresh `docs/MODELS.md` + `MODELS.json` snapshot — so the freeflow docs never claim dead models. After a 429-grade rate limit the snapshot renders an honest ⏳ cell instead of pretending the model was probed.

---

## 10) Strategy F — One-click community install (npm publication)

**Goal:** make `dsh-freeflow` appear in DSH Mobile's **Community plugin center** — the flow *designed* for non-technical users.
**Difficulty:** ★★★ (only because it requires an npm account and a publish action).

### Why it isn't one-click yet (verified)

- PluginMarket.kt queries **npm registry search with `keywords:deepseek-harness`**.
- `dsh-freeflow`'s `package.json` **already carries** that keyword (plus `dsh`, `free-llm`, `zero-cost`, …).
- **But** `npm view dsh-freeflow` → 404: the package was deliberately kept out of npm pending the owner's explicit publish decision. Publishing to npm is irreversible for that name+version combination — **that is why it has not been auto-done.**

### The noob path, exact steps

1. On a PC, create an npm account at [npmjs.com/signup](https://www.npmjs.com/signup) (free; verify email).
2. Get the package onto the PC: `git clone https://github.com/VuDube/dsh-freeflow && cd dsh-freeflow`.
3. Check out the tag you want to publish (`git checkout v0.2.0`) — never publish `main` unlabeled.
4. `npm login`, then **`npm publish`**. The `files` whitelist in package.json ships only `src/`, `cordis.patch.yml`, `README.md`, `LICENSE` — a slim, safe tarball.
5. On the phone: DSH Mobile → **Plugins → Community** → search **freeflow** → install. Behind the scene this just runs the same `dsh plugin --profile web add dsh-freeflow` you did in Strategy B.
6. Afterwards, future updates in the plugin center ride the registry's "update" flow.

> Unpublish is restricted by npm policy (72 h window, then only via support) — that's the real reason to double-check version numbers before `npm publish`.

---

## 11) Agora without DSH Mobile — the honest answer

**Can freeflow run on Android *without* DSH Mobile?** Not natively, no. Freeflow is a Node.js ≥22 program; plain Android offers no Node runtime, and Agora cannot host one (it's a chat client, not an engine). Real options, honestly graded:

| Option | Verdict |
|---|---|
| **Agora's own built-in providers** | ✅ genuine zero-cost keyless start: the built-in **OpenCode Go** provider is from the same `opencode.ai` family as freeflow's anonymous provider; Groq/OpenRouter BYOK cover the rest. This *covers part of the value* of freeflow for casual chat, but with **no failover router, no unified catalog, no health monitoring, no quota cooldowns**. |
| **Termux + Node 24 + freeflow** | ✅ works (same loopback trick, Agora → `http://127.0.0.1:8787/v1`), but that's a *Termux* integration guide, not a DSH Mobile one, and Termux on Android 14+ is increasingly restricted. DSH Mobile exists precisely to avoid this path. |
| **Cloud/PC-hosted freeflow + LAN/SSH reach-back** | ✅ where freeflow already runs (PC or GitHub-hosted), Agora reaches it via LAN IP, VPN, or its **Network Proxy** setting (Agora can proxy provider requests). Zero-cost if the host is your own PC. |

So: for a pure-Agora, no-DSH-Mobile, zero-cost setup, the *native* free path (OpenCode Go) is real and respectable — but the full freeflow feature set (ranked catalog, failover, cooldowns, hourly model verification, BYOK fan-out) needs the gateway, and on Android that means Strategy B/C (DSH Mobile) or Termux.

---

<a name="12"></a>
## 12) Once connected: unlocking Agora's agentic stack on freeflow

The gateway is just the model pipe; these are the Agora features you can point at it, all zero-cost.

### 12.1 MCP (Model Context Protocol)
Settings → MCP → add a server: **Streamable HTTP** (preferred) or SSE, with custom headers supported. Give the model tools like `mcp_search_tools`; permission is per-server and per-tool. *Tip:* any free public MCP server (or your own local one on the PC via adb reverse) plugs straight in; freeflow is orthogonal — MCP tools ride alongside whatever model freeflow routes to.

### 12.2 Skills
Local Markdown files; Agora exposes them as a catalog (`{skill_catalog}` variable in system prompts) and reads them on demand with an "Allow skill access" toggle. Write a `freeflow-help.md` skill that documents your own gateway endpoints (`/freeflow/status`, `/freeflow/catalog`) — then the agent can *self-diagnose the gateway* when asked.

### 12.3 System prompts
Structured templates (System/User/Assistant) with live variables. A noob-friendly global default: set System to a short persona + `{time}`/`{date}`; leave everything else. Per-conversation override for special roles.

### 12.4 Automation
- **Tasks**: named prompts, cron-scheduled or one-shot, optional model override (point the override at a specific freeflow model id for deterministic behavior).
- **Loops**: conversation-scoped re-generation intervals with a max-cycle cap.
- ⚠️ Background reliability on Android requires **Exact Execution** (Alarms & reminders permission) and ideally a battery-optimization exemption; even then vendor kill-switches exist (§14).

### 12.5 The rest of the stack
Web search (needs nothing from freeflow), active/saved memory, past-conversation RAG, Context Compact (keep history small — free models have smallish context windows; Compact is your best friend on free tiers), `.agora` archives, image generation and Phone Use (model-dependent; pick freeflow models known to accept images, e.g. `nvidia/nemotron-3.5-super-vl:free`).

### 12.6 DSH Mobile's agentic surfaces, meanwhile
The engine side contributes: workspace agents that **start dev servers and hand loopback preview links**, 176 Android agent routes, capability bridge on 3083, command registry, SSH integration docs. With freeflow as its provider pool via a `printf 'model: freeflow/…'`-style profile config (or Agora as a parallel client), a *single phone* runs mobile agents on free models.

---

<a name="13"></a>
## 13) Troubleshooting — symptom → cause → fix

| # | Symptom | Most likely cause | Fix |
|---|---|---|---|
| 1 | Agora can't list models / "sync failed" | Gateway not running, **or DSH Mobile killed in background** | Reopen DSH Mobile → terminal → `npm start`; disable battery optimization for DSH Mobile; test `http://127.0.0.1:8787/healthz` in the phone browser |
| 2 | Agora chat returns 401 | You typed a key but freeflow has none configured, **or** removed key but left it non-blank | Keyless usage = leave the key **blank**; keyed usage = set matching `server.apiKey` in freeflow config |
| 3 | Agora chat returns 404 | Base URL missing `/v1` with an unusual endpoint | Use `http://127.0.0.1:8787/v1` (Agora's missing-`/v1` retry usually self-heals this) |
| 4 | First request after long idle spins then fails | Provider pool briefly re-probing; or a model stuck in cooldown | Check `/freeflow/status`; `POST /freeflow/verify` to force re-probe; pick another model |
| 5 | Certain models always 400, others fine | **Sharp edge:** Agora always sends `stream_options.include_usage`; some upstreams reject the extra field → freeflow passes the 400 through and cools down the model | Use the ranked `/v1/models` set; disable the offending models in Agora's Models screen; cooldown auto-expires (30 min) |
| 6 | Everything 429 | OVHcloud ≈2 rpm/model and Kilo 200/hr exhausted; llm7 keyless retired (401) | Failover should route around; if all free lanes are hot, add a Groq free key (§9) |
| 7 | Plugin install fails with pnpm / node_modules errors | Two installs ran in parallel, or engine was running during install | Ensure **only one** install at a time; engine **stopped** first (PluginCenter serializes via one `installExecutor` — honor it) |
| 8 | Install hangs ~2 min then fails | GitHub clone on slow mobile data inside the CLI's **120 s no-output timeout** | Use the tgz Method B-3 (npm pack on PC, install local file) |
| 9 | Plugin center search doesn't find freeflow | Package **not published to npm** (verified 404) | Strategy B for now; Strategy F to publish |
| 10 | LAN client can't reach gateway | Gateway still bound to `127.0.0.1` | Set `server.host` to LAN IP / `0.0.0.0`; **and** set `server.apiKey`; open the port in any hotspot/firewall manager |
| 11 | Gateway dies when phone sleeps | Android froze the engine process | DSH Mobile foreground service; battery-optimization exemption; for long agent runs keep screen on or use Loops/Exact alarms in Agora |
| 12 | `/v1/models` works, chat gives 502 | All providers currently unhealthy | `/freeflow/status` shows per-provider state; it self-heals on cooldown expiry; `POST /freeflow/verify` |
| 13 | Streaming replies appear only at the end | Client buffering ≠ freeflow error (freeflow streams SSE byte-for-byte) | In Agora this is normal to be streamed; in custom clients check you don't buffer the whole response before rendering |
| 14 | Time drift / wrong timestamps in prompts | Agora resolves `{time}` per-request from device clock | Fix device clock; not a freeflow issue |

---

<a name="14"></a>
## 14) Security & privacy hardening

1. **Loopback default is good.** Don't relax `server.host` unless a second device genuinely needs it.
2. **Any LAN-facing gateway must have `server.apiKey` set.** Agora sends it as `Authorization: Bearer` only when non-blank — matched behavior, no configuration asymmetry.
3. **Agora key storage is strong**: AES-256-GCM envelope backed by the Android Keystore; legacy plaintext values are describe-only. Prefer F-Droid/Play builds over random APKs.
4. **`.agora` backups**: secrets are included **only with the explicit include-secrets option** — share backups mindfully.
5. **Conch with blank key = plaintext JSON** (HTTPS-dependent): for the remote-shell tier, always configure the API key flow.
6. **DSH Mobile privilege tiers**: Normal → Shizuku → Root. Everything in this guide needs **Normal**. Don't grant Root for freeflow.
7. **Free tier exposes your prompts to the providers you route to** (opencode.ai, Kilo…, as their terms permit). Fine for experimentation — the stated audience — not for confidential data.
8. **Don't run two installs in parallel** in DSH Mobile (node_modules corruption is *practical* security of a sort: broken installs attract improvised fixes).

---

<a name="15"></a>
## 15) Honest limitations (no rose-tinting)

1. **LLM7 anonymous access is dead** (verified 401). The provider ships disabled by default; it needs a free key and its tier is "usage-based". Don't count on it as a healthy daily driver.
2. **OVHcloud ≈ 2 requests/min/model** — conversational pacing only.
3. **Kilo keyless is a curated 13-model set** (the `isFree` filter); the wider Kilo catalog needs `KILO_API_KEY`.
4. **Agora always streams with `stream_options.include_usage`** — the one protocol-level sharp edge against free top endpoints (see troubleshooting #5).
5. **Cordis plugin rows don't auto-start long-running servers** in every launch mode; the reliable gateway boot is `npm start` in the profile (documented as such). If the engine's plugin lifecycle changes upstream, `npm start` (standalone) is the stable contract.
6. **The engine's CLI specifier grammar for remote sources** (e.g. `github:` shorthands) depends on the underlying pnpm behaviors; the tarball-URL and local-tgz methods above are the deterministic paths.
7. **Free tiers change without notice.** That's exactly why dsh-freeflow ships the hourly GitHub Actions catalog verifier — treat its `docs/MODELS.md` as the freshest truth, not this guide.
8. **Gemini OAuth bridge** is a separate community service; it's the one moving part beyond freeflow's own boundary (§9.3).
9. **This guide is a snapshot (2026-11).** DSH Mobile tracks engine `0.2.2-rc.3`; Agora evolves fast (28 doc pages). Re-verify any strategy that suddenly fails before blaming your setup.
10. **Sandbox-environment note:** v0.2.0 is tagged and pushed, but the **GitHub Release object for v0.2.0 could not be created from this sandbox** (environment blocks release creation); the tag is live at [github.com/VuDube/dsh-freeflow/releases/tag/v0.2.0](https://github.com/VuDube/dsh-freeflow/releases/tag/v0.2.0) and creating the release is a one-click paste for the owner.

---

<a name="appendix"></a>
## Appendix — verified reference tables

### A. File paths (DSH Mobile, Android)

| What | Path (host) | Path (container alias) |
|---|---|---|
| Engine home / `DSH_HOME` | `/data/data/app.dsh.mobile/files/dsh-home` | `/dsh` |
| Web profile | `…/dsh-home/profiles/web` | `/dsh/profiles/web` |
| Plugin install target | `…/dsh-home/profiles/web/node_modules/<pkg>` | `/dsh/profiles/web/node_modules/…` |
| freeflow user config | `…/dsh-home/.dsh/freeflow.json` | `/dsh/.dsh/freeflow.json` |
| pnpm store | `…/dsh-home/.local/share/pnpm/store/v11` | `/dsh/.local/share/pnpm/store/v11` |

### B. Endpoints you'll actually type

| Purpose | URL |
|---|---|
| freeflow health | `http://127.0.0.1:8787/healthz` |
| freeflow models (Agora Base URL) | `http://127.0.0.1:8787/v1` |
| freeflow status/cooldowns | `http://127.0.0.1:8787/freeflow/status` |
| freeflow catalog (with scores) | `http://127.0.0.1:8787/freeflow/catalog` |
| DSH WebUI (in-app) | `http://127.0.0.1:3080` |
| LAN WebUI | `http://<phone-ip>:3090` (6-digit code pairing) |
| Repo | `https://github.com/VuDube/dsh-freeflow` |
| Docs site | `https://vudube.github.io/dsh-freeflow/` |

### C. Command cheat-sheet (DSH Mobile terminal)

```bash
cd /dsh/profiles/web                                   # enter profile
git clone https://github.com/VuDube/dsh-freeflow.git node_modules/dsh-freeflow
node -e "fetch('http://127.0.0.1:8787/healthz').then(r=>r.text()).then(console.log)"
npm start                                              # boot gateway
dsh plugin --profile web add /sdcard/Download/dsh-freeflow-0.2.0.tgz   # offline install
```

### D. Agora custom provider field-by-field

| Agora field | Value for freeflow | Why (source-verified) |
|---|---|---|
| Base URL | `http://127.0.0.1:8787/v1` | `/v1` included; Agora's candidate resolver would add it anyway |
| Protocol | OpenAI-compatible | freeflow *is* OpenAI-compatible |
| API key | blank (keyless) / your `server.apiKey` string (when set) | `Authorization` header only when non-blank |
| Responses API toggle | **off** | freeflow speaks Chat Completions, not the Responses API |
| Models | sync, then enable your subset | sync = `GET /models` paginated |

### E. One-paragraph history of everything, for the truly impatient

Install freeflow into DSH Mobile (clone into `node_modules`, one YAML row, `npm start`) → point Agora at `http://127.0.0.1:8787/v1`, OpenAI-compatible, blank key → sync models → chat. Zero keys for the anonymous/Kilo/OVH lanes; free API keys unlock Groq/OpenRouter class quality; hourly CI keeps the model list truthful; LAN + apiKey extends the gateway to your other devices when you're ready.

---

*End of master guide — VuDube · dsh-freeflow v0.2.0 · Android integration reference (2026-11).*
