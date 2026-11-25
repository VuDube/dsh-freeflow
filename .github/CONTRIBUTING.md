# Contributing to dsh-freeflow

Thanks for helping keep DeepSeek Harness free to run.

## Ground rules

- **Zero-cost only.** New providers must work on a free tier; no paid-only
  paths, no keyed-by-default setups.
- **Loopback only.** Nothing in this repo may bind non-loopback, tunnel out,
  or expose the gateway beyond `127.0.0.1`.
- **No secrets in code.** Keys belong in `~/.dsh/freeflow.json` or the
  upstream tool's own store. Never commit, log, or print tokens.

## Development

```sh
git clone https://github.com/VuDube/dsh-freeflow.git
cd dsh-freeflow
npm test          # node:test, zero dependencies
npm start         # standalone gateway on 127.0.0.1:8787
```

- Node 22.19+ / 24+; ESM only.
- Adding a provider: one file in `src/providers/`, registered in
  `PROVIDER_FACTORIES` (`src/index.js`), plus a `providers` config block in
  `src/config/default.json`, plus tests.
- Keep the provider contract: `id`, `label`, `probe()`, `listModels()`,
  `chat()` returning the raw upstream `Response`.

## Pull requests

1. Branch from `main`.
2. Add or update tests for behavior changes; keep the suite dependency-free.
3. `npm test` green on both local Node and the CI matrix.
4. Update `README.md` / `docs/` when behavior or config changes.
5. Reference the issue the PR closes (`Closes #<n>`).

## Issue reports

Use the templates. Redact `Authorization` headers, `~/.dsh/freeflow.json`
contents, and anything inside `~/.dsh/gemini-oauth-bridge.json`.
