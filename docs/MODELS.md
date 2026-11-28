# Live model catalog — auto-generated

> Regenerated hourly by `.github/workflows/catalog-check.yml` (GitHub Actions free tier)
> from live upstream endpoints. The running gateway never relies on this snapshot:
> its `GET /v1/models` verifies upstream liveness in real time. This file is the
> auditable evidence trail of what was actually available and answering.

**Checked:** 2026-11-28T03:57:09.988Z · **Providers:** 4 · **Models:** 202

## Category summary

| Category | Models |
|---|---|
| chat | 104 |
| fast | 51 |
| large | 16 |
| reasoning | 15 |
| vision | 6 |
| coder | 5 |
| small | 5 |

## Provider verification

| Provider | Status | Models | Chat probe |
|---|---|---|---|
| llm7 | ok | 84 | skipped |
| ovhcloud | ok | 23 | ⏳ rate limited (429) — model list verified; chat probe retried next hourly run |
| kilo | ok | 12 | ⏳ rate limited (429) — model list verified; chat probe retried next hourly run |
| anonymous | ok | 110 | skipped |

> **llm7:** llm7 now serves only pro/turbo usage-based models; chat needs a free LLM7_API_KEY. Model listing stays open.

## Ranked catalog (keyless only — BYOK keys stay local and are never probed server-side)

| Rank | Model | Provider | Tier | Category |
|---|---|---|---|---|
| 1 | `anonymous/beam-free` | anonymous | keyless | chat |
| 2 | `anonymous/big-pickle` | anonymous | keyless | chat |
| 3 | `anonymous/claude-fable-5` | anonymous | keyless | chat |
| 4 | `anonymous/claude-fable-5-1` | anonymous | keyless | chat |
| 5 | `anonymous/claude-fable-5-2` | anonymous | keyless | chat |
| 6 | `anonymous/claude-haiku-4-5` | anonymous | keyless | chat |
| 7 | `anonymous/claude-haiku-5-5` | anonymous | keyless | chat |
| 8 | `anonymous/claude-sonnet-4-5` | anonymous | keyless | chat |
| 9 | `anonymous/claude-sonnet-4-6` | anonymous | keyless | chat |
| 10 | `anonymous/claude-sonnet-5` | anonymous | keyless | chat |
| 11 | `anonymous/claude-sonnet-5-5` | anonymous | keyless | chat |
| 12 | `anonymous/flint-40b-free` | anonymous | keyless | chat |
| 13 | `anonymous/glm-5.3` | anonymous | keyless | chat |
| 14 | `anonymous/gpt-5` | anonymous | keyless | chat |
| 15 | `anonymous/gpt-5-codex` | anonymous | keyless | chat |
| 16 | `anonymous/gpt-5.1` | anonymous | keyless | chat |
| 17 | `anonymous/gpt-5.1-codex` | anonymous | keyless | chat |
| 18 | `anonymous/gpt-5.2` | anonymous | keyless | chat |
| 19 | `anonymous/gpt-5.2-codex` | anonymous | keyless | chat |
| 20 | `anonymous/gpt-5.3-codex` | anonymous | keyless | chat |
| 21 | `anonymous/gpt-5.3-codex-spark` | anonymous | keyless | chat |
| 22 | `anonymous/gpt-5.4` | anonymous | keyless | chat |
| 23 | `anonymous/gpt-5.5` | anonymous | keyless | chat |
| 24 | `anonymous/gpt-5.6-luna` | anonymous | keyless | chat |
| 25 | `anonymous/gpt-5.6-sol` | anonymous | keyless | chat |
| 26 | `anonymous/gpt-5.6-terra` | anonymous | keyless | chat |
| 27 | `anonymous/gpt-6-astra` | anonymous | keyless | chat |
| 28 | `anonymous/gpt-6-luna` | anonymous | keyless | chat |
| 29 | `anonymous/gpt-6-luna-decision` | anonymous | keyless | chat |
| 30 | `anonymous/gpt-6-sol` | anonymous | keyless | chat |
| 31 | `anonymous/gpt-6.1-sol` | anonymous | keyless | chat |
| 32 | `anonymous/gpt-6.2-astra` | anonymous | keyless | chat |
| 33 | `anonymous/gpt-6.2-sol` | anonymous | keyless | chat |
| 34 | `anonymous/gpt-live-1` | anonymous | keyless | chat |
| 35 | `anonymous/gpt-live-1.1` | anonymous | keyless | chat |
| 36 | `anonymous/gpt-transcribe` | anonymous | keyless | chat |
| 37 | `anonymous/grok-4.5` | anonymous | keyless | chat |
| 38 | `anonymous/grok-4.6` | anonymous | keyless | chat |
| 39 | `anonymous/grok-4.7` | anonymous | keyless | chat |
| 40 | `anonymous/grok-build-0.1` | anonymous | keyless | chat |
| 41 | `anonymous/grok-imagine-video-1.5` | anonymous | keyless | chat |
| 42 | `anonymous/grok-voice-transcribe-2.0` | anonymous | keyless | chat |
| 43 | `anonymous/iceman-free` | anonymous | keyless | chat |
| 44 | `anonymous/jev-1.13` | anonymous | keyless | chat |
| 45 | `anonymous/jev-1.13-free` | anonymous | keyless | chat |
| 46 | `anonymous/jev-1.14` | anonymous | keyless | chat |
| 47 | `anonymous/kimi-k3` | anonymous | keyless | chat |
| 48 | `anonymous/muse-ember-1.0` | anonymous | keyless | chat |
| 49 | `anonymous/muse-spark-1.2` | anonymous | keyless | chat |
| 50 | `anonymous/muse-spark-1.3` | anonymous | keyless | chat |
| 51 | `anonymous/muse-wonder-1.0` | anonymous | keyless | chat |
| 52 | `anonymous/nemotron-3.5-lightning-free` | anonymous | keyless | chat |
| 53 | `anonymous/qwen3.5-plus` | anonymous | keyless | chat |
| 54 | `anonymous/qwen3.6-plus` | anonymous | keyless | chat |
| 55 | `anonymous/seaglass-alpha-free` | anonymous | keyless | chat |
| 56 | `anonymous/voyage-4` | anonymous | keyless | chat |
| 57 | `kilo/kilo-auto/free` | kilo | keyless | chat |
| 58 | `kilo/nvidia/nemotron-3.5-lightning:free` | kilo | keyless | chat |
| 59 | `kilo/openrouter/free` | kilo | keyless | chat |
| 60 | `kilo/particle-ai/particle-1:free` | kilo | keyless | chat |
| 61 | `kilo/recursive/flint-v1.0:free` | kilo | keyless | chat |
| 62 | `kilo/reflection/beam-free` | kilo | keyless | chat |
| 63 | `kilo/stealth/glyph-cluster` | kilo | keyless | chat |
| 64 | `ovhcloud/gemma-4-26b-a4b` | ovhcloud | keyless | chat |
| 65 | `ovhcloud/gpt-oss-20b` | ovhcloud | keyless | chat |
| 66 | `ovhcloud/laguna-xs-2.1` | ovhcloud | keyless | chat |
| 67 | `ovhcloud/Olala-v1.0-summarise` | ovhcloud | keyless | chat |
| 68 | `ovhcloud/Olala-v1.0-translate` | ovhcloud | keyless | chat |
| 69 | `ovhcloud/Qwen3.6-27B` | ovhcloud | keyless | chat |
| 70 | `ovhcloud/qwen3.6-35b-a3b` | ovhcloud | keyless | chat |
| 71 | `ovhcloud/Qwen3.8-27B` | ovhcloud | keyless | chat |
| 72 | `ovhcloud/solaria-3` | ovhcloud | keyless | chat |
| 73 | `anonymous/claude-opus-4-5` | anonymous | keyless | reasoning |
| 74 | `anonymous/claude-opus-4-6` | anonymous | keyless | reasoning |
| 75 | `anonymous/claude-opus-4-7` | anonymous | keyless | reasoning |
| 76 | `anonymous/claude-opus-4-8` | anonymous | keyless | reasoning |
| 77 | `anonymous/claude-opus-5` | anonymous | keyless | reasoning |
| 78 | `anonymous/claude-opus-5-5` | anonymous | keyless | reasoning |
| 79 | `anonymous/codestral-embed` | anonymous | keyless | coder |
| 80 | `anonymous/kimi-k2.7-code` | anonymous | keyless | coder |
| 81 | `anonymous/voyage-code-4` | anonymous | keyless | coder |
| 82 | `kilo/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | kilo | keyless | reasoning |
| 83 | `llm7/anthropic/claude-sonnet-4-6` | llm7 | usage-based | chat |
| 84 | `llm7/anthropic/claude-sonnet-5` | llm7 | usage-based | chat |
| 85 | `llm7/anthropic/claude-sonnet-5-5` | llm7 | usage-based | chat |
| 86 | `llm7/claude-fable-5` | llm7 | usage-based | chat |
| 87 | `llm7/claude-fable-5-2` | llm7 | usage-based | chat |
| 88 | `llm7/claude-haiku-4-5` | llm7 | usage-based | chat |
| 89 | `llm7/claude-haiku-5-5` | llm7 | usage-based | chat |
| 90 | `llm7/claude-sonnet-4-6` | llm7 | usage-based | chat |
| 91 | `llm7/claude-sonnet-5` | llm7 | usage-based | chat |
| 92 | `llm7/codex/gpt-6-astra` | llm7 | usage-based | chat |
| 93 | `llm7/dark-beast-krea2` | llm7 | usage-based | chat |
| 94 | `llm7/gemma-3-27b` | llm7 | usage-based | chat |
| 95 | `llm7/gemma-4-uncensored` | llm7 | usage-based | chat |
| 96 | `llm7/gemma4:31b` | llm7 | usage-based | chat |
| 97 | `llm7/glm-5.2` | llm7 | usage-based | chat |
| 98 | `llm7/glm-5.3` | llm7 | usage-based | chat |
| 99 | `llm7/glm-5.3-uncensored` | llm7 | usage-based | chat |
| 100 | `llm7/gpt-5.6-luna` | llm7 | usage-based | chat |
| 101 | `llm7/gpt-5.6-sol` | llm7 | usage-based | chat |
| 102 | `llm7/gpt-5.6-terra` | llm7 | usage-based | chat |
| 103 | `llm7/gpt-6-astra` | llm7 | usage-based | chat |
| 104 | `llm7/gpt-6-luna` | llm7 | usage-based | chat |
| 105 | `llm7/gpt-6-sol` | llm7 | usage-based | chat |
| 106 | `llm7/gpt-6.1-sol` | llm7 | usage-based | chat |
| 107 | `llm7/gpt-6.2-astra` | llm7 | usage-based | chat |
| 108 | `llm7/gpt-6.2-sol` | llm7 | usage-based | chat |
| 109 | `llm7/gpt-oss:20b` | llm7 | usage-based | chat |
| 110 | `llm7/grok-4.7` | llm7 | usage-based | chat |
| 111 | `llm7/jev-latest` | llm7 | usage-based | chat |
| 112 | `llm7/kimi-k2.6` | llm7 | usage-based | chat |
| 113 | `llm7/llama-4-maverick` | llm7 | usage-based | chat |
| 114 | `llm7/muse-spark-open` | llm7 | usage-based | chat |
| 118 | `anonymous/deepseek-v4-pro` | anonymous | keyless | large |
| 119 | `anonymous/deepseek-v4.1-flash` | anonymous | keyless | fast |
| 120 | `anonymous/deepseek-v4.1-flash-free` | anonymous | keyless | fast |
| 121 | `anonymous/gemini-3.5-flash` | anonymous | keyless | fast |
| 122 | `anonymous/gemini-3.5-flash-lite` | anonymous | keyless | fast |
| 123 | `anonymous/gemini-3.6-flash` | anonymous | keyless | fast |
| 124 | `anonymous/gemini-3.7-flash` | anonymous | keyless | fast |
| 125 | `anonymous/gemini-3.8-flash` | anonymous | keyless | fast |
| 126 | `anonymous/gemini-4-argon` | anonymous | keyless | fast |
| 127 | `anonymous/gemini-4-carbon` | anonymous | keyless | fast |
| 128 | `anonymous/gemini-4-hydrogen` | anonymous | keyless | fast |
| 129 | `anonymous/gemini-4-neon` | anonymous | keyless | fast |
| 130 | `anonymous/gemini-decision-1` | anonymous | keyless | fast |
| 133 | `anonymous/gemini-nano-banana-2.1` | anonymous | keyless | fast |
| 134 | `anonymous/gemini-omni-1.2-flash` | anonymous | keyless | vision |
| 135 | `anonymous/glm-5.3-flash` | anonymous | keyless | fast |
| 136 | `anonymous/gpt-5-nano` | anonymous | keyless | fast |
| 137 | `anonymous/gpt-5.1-codex-max` | anonymous | keyless | large |
| 138 | `anonymous/gpt-5.1-codex-mini` | anonymous | keyless | fast |
| 139 | `anonymous/gpt-5.4-mini` | anonymous | keyless | fast |
| 140 | `anonymous/gpt-5.4-nano` | anonymous | keyless | fast |
| 141 | `anonymous/gpt-5.4-pro` | anonymous | keyless | large |
| 142 | `anonymous/gpt-5.5-pro` | anonymous | keyless | large |
| 145 | `anonymous/grok-imagine-video-1.5-lite` | anonymous | keyless | fast |
| 146 | `anonymous/hy4-flash-free` | anonymous | keyless | fast |
| 147 | `anonymous/kimi-k3.1-pro` | anonymous | keyless | large |
| 148 | `anonymous/mimo-v2.6-flash-free` | anonymous | keyless | fast |
| 149 | `anonymous/minimax-m2.5` | anonymous | keyless | fast |
| 150 | `anonymous/minimax-m2.7` | anonymous | keyless | fast |
| 151 | `anonymous/minimax-m3` | anonymous | keyless | fast |
| 153 | `anonymous/mistral-large-4` | anonymous | keyless | large |
| 154 | `anonymous/nemotron-3.5-super-vl-free` | anonymous | keyless | vision |
| 156 | `anonymous/qwen3.8-flash` | anonymous | keyless | fast |
| 157 | `anonymous/qwen3.8-max` | anonymous | keyless | large |
| 160 | `kilo/baidu/ernie-5.5-flash-preview:free` | kilo | keyless | fast |
| 161 | `kilo/liquid/lfm-3-1.7b:free` | kilo | keyless | small |
| 162 | `kilo/nvidia/nemotron-3-ultra-550b-a55b:free` | kilo | keyless | large |
| 163 | `kilo/nvidia/nemotron-3.5-super-vl:free` | kilo | keyless | vision |
| 164 | `llm7/anthropic/claude-opus-4-6` | llm7 | usage-based | reasoning |
| 165 | `llm7/anthropic/claude-opus-4-7` | llm7 | usage-based | reasoning |
| 166 | `llm7/anthropic/claude-opus-4-8` | llm7 | usage-based | reasoning |
| 167 | `llm7/claude-opus-4-6` | llm7 | usage-based | reasoning |
| 168 | `llm7/claude-opus-4-8` | llm7 | usage-based | reasoning |
| 169 | `llm7/claude-opus-5` | llm7 | usage-based | reasoning |
| 170 | `llm7/claude-opus-5-5` | llm7 | usage-based | reasoning |
| 171 | `llm7/claude-opus-5.5` | llm7 | usage-based | reasoning |
| 172 | `llm7/codestral-latest` | llm7 | usage-based | coder |
| 173 | `llm7/kimi-k2.7-code` | llm7 | usage-based | coder |
| 174 | `ovhcloud/clef-flash` | ovhcloud | keyless | fast |
| 175 | `ovhcloud/DeepSeek-V4.1-Flash-1017` | ovhcloud | keyless | fast |
| 176 | `ovhcloud/gpt-oss-120b` | ovhcloud | keyless | large |
| 177 | `ovhcloud/Meta-Llama-3_3-70B-Instruct` | ovhcloud | keyless | large |
| 178 | `ovhcloud/Mistral-Small-3.2-24B-Instruct-2506` | ovhcloud | keyless | fast |
| 179 | `ovhcloud/nemotron3-nano-30b` | ovhcloud | keyless | fast |
| 180 | `ovhcloud/nemotron3-omni-30b` | ovhcloud | keyless | vision |
| 181 | `ovhcloud/Olala-v1.0-mini-7A1B` | ovhcloud | keyless | small |
| 182 | `ovhcloud/Qwen2.5-VL-72B-Instruct` | ovhcloud | keyless | vision |
| 183 | `ovhcloud/qwen3-vl-30b-a3b` | ovhcloud | keyless | vision |
| 184 | `ovhcloud/Qwen3.5-397B-A17B` | ovhcloud | keyless | large |
| 185 | `ovhcloud/Qwen3.5-9B` | ovhcloud | keyless | small |
| 186 | `ovhcloud/Qwen3Guard-Gen-0.6B` | ovhcloud | keyless | small |
| 187 | `ovhcloud/Qwen3Guard-Gen-8B` | ovhcloud | keyless | small |
| 188 | `llm7/chroma-v.46-flash` | llm7 | usage-based | fast |
| 189 | `llm7/deepseek-v4-flash-0731-fast` | llm7 | usage-based | fast |
| 190 | `llm7/deepseek-v4-flash:0731` | llm7 | usage-based | fast |
| 191 | `llm7/deepseek-v4-pro` | llm7 | usage-based | large |
| 192 | `llm7/deepseek-v4.1-flash` | llm7 | usage-based | fast |
| 193 | `llm7/deepseek-v4.1-flash-uncensored` | llm7 | usage-based | fast |
| 195 | `llm7/gemini-3-flash` | llm7 | usage-based | fast |
| 198 | `llm7/gemini-3.1-pro` | llm7 | usage-based | fast |
| 199 | `llm7/gemini-3.5-flash-lite` | llm7 | usage-based | fast |
| 200 | `llm7/gemini-3.6-flash` | llm7 | usage-based | fast |
| 201 | `llm7/gemini-3.6-flash-high` | llm7 | usage-based | fast |
| 202 | `llm7/gemini-3.8-flash` | llm7 | usage-based | fast |
| 203 | `llm7/gemini-3.8-flash-high` | llm7 | usage-based | fast |
| 204 | `llm7/gemini-4-argon` | llm7 | usage-based | fast |
| 205 | `llm7/gemini-nano-banana-2.1` | llm7 | usage-based | fast |
| 206 | `llm7/glm-5-3-flash-uncensored` | llm7 | usage-based | fast |
| 211 | `llm7/gpt-oss:120b` | llm7 | usage-based | large |
| 213 | `llm7/Inkling-Small` | llm7 | usage-based | fast |
| 214 | `llm7/kimi-k3.1-pro` | llm7 | usage-based | large |
| 215 | `llm7/mimo-v2.6-flash` | llm7 | usage-based | fast |
| 216 | `llm7/mimo-v2.6-pro` | llm7 | usage-based | large |
| 218 | `llm7/minimax-m3` | llm7 | usage-based | fast |
| 219 | `llm7/minimax-m3.1-flash` | llm7 | usage-based | fast |
| 222 | `llm7/Qwen3.8-Flash` | llm7 | usage-based | fast |

...plus 2 more — full list in [MODELS.json](MODELS.json)

