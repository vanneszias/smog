# SMOG

SMOG & Co's sign language learning platform: a library of gesture videos that people search, favorite and collect in lists, and that organisations can sponsor with their logo on a gesture. The rewrite of the old Convex + WorkOS system runs on Cloudflare; the old data moves over with an importer.

- **Site and API:** one Cloudflare Worker (`apps/site`): TanStack Start (React 19), oRPC procedures at `/api/rpc`, Better Auth, D1 (SQLite) through Drizzle, KV, R2 and Queues.
- **App:** one Expo app (`apps/mobile`, SDK 57, Expo Router, NativeWind) for iOS and Android.
- **Logic:** everything else is in `packages/*` (the feature packages are in `packages/features/*`); the apps are routing, screens and wiring only.
- **Tooling:** Bun, Turborepo, Biome (Ultracite), TypeScript 7, Vitest (Workers pool), Jest (Expo), Playwright.

## Layout

| Path | What |
|---|---|
| `apps/site` | the Worker: routes, screens, the API, queue consumers and crons |
| `apps/mobile` | the Expo app |
| `packages/*` | `config`, `db`, `auth`, `rpc`, `api`, `payments`, `video`, `email`, `jobs`, `analytics`, `i18n`, `styles`, `brand`, `ui-web`, `ui-native`, `local-store`, `utils`, `migrate-convex` |
| `packages/features/*` | `gestures`, `favorites`, `lists`, `account`, `sponsorships`, `admin` (each with `./schema`, `./contract`, `./server`, `./client`) |
| `scripts/*` | release, deploy and boundary checks, provisioning, `admin:grant`, `maintenance`, `retention`, `cron`, the e2e runner |
| `docs/*` | the documents listed below |

## Quick start

Requirements: Bun (the version in `package.json` `packageManager`) and Node 22.

```bash
bun install
cp apps/site/.dev.vars.example apps/site/.dev.vars
bun -F @smog/db migrate:dev && bun -F @smog/db seed:dev   # local D1, with the dev admin
bun dev                                                    # site on http://localhost:5173 + the Expo dev server
```

The seeded admin is `admin@smog.test` (dev-only password in `AGENTS.md`); emails are shown at `/dev/mail`. The app needs `apps/mobile/.env` (copy `.env.example`).

```bash
bun run check            # Biome, with fixes
bun run check-types
bun run test             # every package's tests, the script tests and the documents' accuracy check
bun run test:e2e         # Playwright, seven projects, on a fresh D1 (how CI runs it: AGENTS.md)
bun run release:check    # what CI's four release-check lanes run (SMOG_OFFLINE=1 without internet access)
```

`release:check` is **not** the whole of CI: the `e2e` job runs separately, and offline the audit and expo-doctor's online checks are not equivalent. CI (`.github/workflows/ci.yml`) is the authority.

## Environments and deploys

Three environments: `dev` (your machine), `staging` (the `develop` branch) and `production` (the `master` branch). `.github/workflows/deploy.yml` runs the whole of CI first, then the deploy config check, the Cloudflare resources, the D1 migrations and the guarded `bun -F @smog/site deploy`; without the Cloudflare secrets a staging deploy skips with a warning and a production deploy fails. Nothing in the repository holds a credential. Production has never deployed: the owner's ordered list is in `docs/PROGRESS.md`.

## Where things are written down

- `AGENTS.md`: commands, CI, deploy checks, the guards, code style (read this before changing anything).
- `docs/PROGRESS.md`: the phases, the log, **what is still blocked on the owner**, the ordered owner list, the carries.
- `docs/deployment.md`: first-time setup of the accounts, tokens, secrets and stores; `docs/cutover-runbook.md`: the production switch-over and the data import.
- `docs/DECISIONS.md`: every non-trivial choice and why; `docs/API.md` (procedures, routes, queues, crons, rate limits, cache policy), `docs/DATA_MODEL.md` (tables, migrations, retention), `docs/LEGAL-SIGNOFF.md` (the texts awaiting the owner's approval).
- `docs/superpowers/specs/2026-09-29-cloudflare-rewrite-design.md`: the design spec; `docs/superpowers/specs/2026-09-29-feature-inventory.md`: the feature checklist; `docs/superpowers/plans/`: one plan per phase.

## Licence and credits

The repository declares no licence (no `LICENSE` file): treat it as all rights reserved until the owner decides otherwise. The brand, the content and the legal texts are SMOG & Co vzw's. Built on Cloudflare Workers, TanStack, Better Auth, oRPC, Drizzle, Expo, Mux (video) and Mollie (payments).
