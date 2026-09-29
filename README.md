# SMOG

Sign language learning platform: a TanStack Start site on Cloudflare Workers (`apps/site`) and an Expo app (`apps/mobile`), with all logic in `packages/*`.

## Quick start

Requirements: Bun (version in `package.json` `packageManager`) and Node 22.

```bash
bun install
cp apps/site/.dev.vars.example apps/site/.dev.vars
bun dev                  # site on http://localhost:5173 + Expo dev server
```

Before pushing:

```bash
bun run release:check    # what CI runs; add SMOG_OFFLINE=1 without internet access
```

CI (`.github/workflows/ci.yml`) runs `release:check` on every push and pull request. `.github/workflows/deploy.yml` deploys the site to staging from `develop` and to production from `master` (skipped until the Cloudflare secrets are set).

- Design spec: `docs/superpowers/specs/2026-09-29-cloudflare-rewrite-design.md`
- Decisions: `docs/DECISIONS.md`
- Progress: `docs/PROGRESS.md`
- Contributor and agent guidelines: `AGENTS.md`
