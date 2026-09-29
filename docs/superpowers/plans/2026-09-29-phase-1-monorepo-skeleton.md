# Phase 1: Monorepo skeleton implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Bun + Turborepo monorepo with Biome, knip, boundaries check, a config package, CI, an empty TanStack Start site running on Cloudflare Workers, and an empty Expo SDK 57 app. All of it builds and passes `bun run release:check`.

**Architecture:** Bun workspaces (`apps/*`, `packages/*`, `packages/features/*`) with catalogs for shared versions. Turborepo runs the `build`, `check-types`, `test` and `dev` tasks. `@smog/config` holds the tsconfig bases, the boundaries graph, env schemas and constants. The site and mobile apps are the thinnest possible shells.

**Tech stack:** Bun 1.3.x, Turborepo 2.x, Biome 2.x + ultracite, knip 6, TypeScript 7, TanStack Start + `@cloudflare/vite-plugin` + wrangler 4, Vitest 4 + `@cloudflare/vitest-pool-workers`, Expo SDK 57 + Expo Router + NativeWind, Jest + jest-expo.

**Spec:** `docs/superpowers/specs/2026-09-29-cloudflare-rewrite-design.md` (sections 3, 4, 9, 10, 14).

## Global constraints

- Use the newest stable version of every dependency (`npm view <pkg> version`). The only known exception is Vitest 4.x for the Workers pool. Any other deviation needs a `docs/DECISIONS.md` entry naming the blocker.
- Put shared versions in the root `package.json` `workspaces.catalog` and reference them as `"catalog:"`.
- Before touching `turbo.json`, read the installed Turborepo docs: `node -p "require.resolve('turbo/package.json')"` from the repo root, then `docs/README.md` next to it and the relevant pages under `docs/`.
- Check current docs before using a library (Context7 MCP `resolve-library-id` / `query-docs`, or the official docs): TanStack Start on Cloudflare, the Cloudflare Vite plugin, Expo SDK 57, NativeWind.
- Workers code must not use `Bun.*`.
- Code style follows `AGENTS.md`: third-party imports first, then `@smog/*`, then `@/`; `import type`; explicit parameter and return types on exported functions; errors logged as `[serviceName] Failed to …` and rethrown.
- Never run `playwright install`. Chromium is at `/opt/pw-browsers`.
- Mobile identity: name "SMOG & Co", slug `smog`, owner `smog-and-co`, bundle id / package `be.zias.smog`, scheme `smog`, EAS projectId `9fa68b63-dfa5-498a-9196-5eba93ecac29`, Apple team `96XKP6MU2A`, runtimeVersion policy `fingerprint`, version `3.0.0`, iOS buildNumber `"52"`, Android versionCode `81` (both higher than the old 51/80 so the store accepts updates).
- Commits are conventional (`chore(repo): …`, `feat(config): …`) and end with the attribution lines:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01C4GMWQQG82fSc6q45qtm2c
  ```

## Review focus

1. A fresh clone plus `bun install --frozen-lockfile` must work: no postinstall that needs network beyond the registry, and no Playwright browser download (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` is respected).
2. `wrangler dev` / `vite dev` for the site must start **without** Cloudflare credentials, using local bindings only (no `remote: true` in the dev env).
3. `wrangler deploy --dry-run --env staging` must succeed (it validates the config), and a deploy without `--env` must fail because there are no top-level bindings.
4. `expo export` must succeed from a clean checkout with the hoisted linker. Metro must resolve workspace packages.
5. The boundaries check must fail on a forbidden import (tested with a fixture), not only pass on the happy path.

---

### Task 1: Root workspace and tooling

**Files:**
- Create: `package.json`, `bunfig.toml`, `biome.json`, `turbo.json`, `knip.json`, `.gitignore`, `.gitattributes`, `.editorconfig`, `.env.example`, `.nvmrc` (node 22)
- Create: `README.md` (short stub), `AGENTS.md` (new structure; keep the existing command/code-style sections adapted, and the Turborepo managed block verbatim, which starts "# This is NOT the Turborepo you know")

**Interfaces:**
- Produces root scripts: `dev`, `build`, `check` (`biome check --write .`), `check:ci` (`biome ci .`), `check-types` (`turbo check-types`), `test` (`turbo test`), `knip` (`knip --no-progress`), `boundaries` (`bun scripts/check-boundaries.ts`), `release:check` (placeholder at first; finished in Task 5).
- Workspaces: `apps/*`, `packages/*`, `packages/features/*`.

- [ ] Step 1: Write the root files. `bunfig.toml`: `[install] linker = "hoisted"`. `[test]` preload is not needed yet. `packageManager`: the installed bun version (`bun --version`), upgrading bun first with `bun upgrade` if a newer 1.x exists. The Biome config extends `ultracite/biome/core` and `ultracite/biome/react` (check the preset names in the installed ultracite version); ignores are `**/dist`, `**/.wrangler`, `**/.expo`, `**/.output`, `**/.tanstack`, `**/routeTree.gen.ts`, `**/worker-configuration.d.ts`, `**/*.gen.*`, `.agents`, `docs/superpowers/analysis`. Globals: `__DEV__`.
- [ ] Step 2: `bun install`, then `bun run check:ci`. Expected: exit 0.
- [ ] Step 3: Commit `chore(repo): add bun workspace, biome, turbo and knip`.

### Task 2: `@smog/config` and the boundaries check

**Files:**
- Create: `packages/config/package.json` (exports `./tsconfig/*.json`, `./boundaries`, `./constants`, `./env/worker`, `./env/mobile`)
- Create: `packages/config/tsconfig/{base,library,react,worker,react-native}.json`
  - base: ESNext, `moduleResolution` bundler, strict, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `isolatedModules`, `skipLibCheck`
  - worker adds `@cloudflare/workers-types` via the generated types
  - react adds DOM + jsx react-jsx
- Create: `packages/config/src/boundaries.ts`, which exports `const BOUNDARIES: Record<string, readonly string[]>`. It copies spec §4.1 exactly, with keys as package names (`@smog/site`, `@smog/mobile`, `@smog/api`, `@smog/gestures`, …) and features expressed by the pattern `@smog/feature:*` listed in `FEATURE_PACKAGES`.
- Create: `packages/config/src/constants.ts` with `PRICE_PER_GESTURE_YEAR_CENTS = 5000`, `LOGO_ADDON_PER_GESTURE_CENTS = 1000`, `SPONSORSHIP_DURATION_DAYS = 365`, `MAX_GESTURES_PER_CHECKOUT = 10`, `DISPLAY_NAME_MAX = 35`, `VIDEO_COMPLETE_COUNT = 7`, `COURSE_URL = "https://smog.vlaanderen/volg-een-cursus"`, `SMOG_WEBSITE_URL = "https://smog.vlaanderen"`, `CONTACT_EMAIL = "info@smog.vlaanderen"`, `RECENT_SEARCHES_MAX = 10`, `LOCALES = ["nl","en","fr"] as const`, `DEFAULT_LOCALE = "nl"`.
- Create: `packages/config/src/env/worker.ts`, which exports `workerVarsSchema` (Zod: `SITE_URL` url, `ENVIRONMENT` enum dev|staging|production, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `OPENPANEL_API_URL` url default `https://analytics.zias.be/api`, `RENDER_MODE` enum container|local|fake default container) and `parseWorkerVars(env: Record<string, unknown>): WorkerVars`. Secrets are added in later phases.
- Create: `packages/config/src/env/mobile.ts`: `mobileEnvSchema` (`EXPO_PUBLIC_API_URL` url, `EXPO_PUBLIC_SITE_HOST` hostname, `EXPO_PUBLIC_ENVIRONMENT`).
- Create: `scripts/check-boundaries.ts` (Bun), which exports `checkBoundaries(root: string): Violation[]` and a CLI that prints violations and exits 1. It reads every workspace `package.json` and checks each `@smog/*` entry in `dependencies`/`devDependencies`/`peerDependencies` against `BOUNDARIES`. It also scans `src/**/*.{ts,tsx}` for `from "@smog/…"` imports that are not declared as dependencies.
- Test: `packages/config/src/env/worker.test.ts`, `scripts/check-boundaries.test.ts` (fixtures under `scripts/__fixtures__/boundaries/{ok,bad}`).

- [ ] Step 1: Write the failing tests.
  - `parseWorkerVars({SITE_URL:"http://localhost:5173", ENVIRONMENT:"dev", EMAIL_FROM:"SMOG <no-reply@example.com>", EMAIL_REPLY_TO:"info@smog.vlaanderen"})` returns `OPENPANEL_API_URL === "https://analytics.zias.be/api"` and `RENDER_MODE === "container"`.
  - `parseWorkerVars({})` throws an error whose message contains `SITE_URL`.
  - `checkBoundaries("scripts/__fixtures__/boundaries/ok")` returns `[]`.
  - The `bad` fixture, where `@smog/ui-web` depends on `@smog/db`, returns exactly one violation `{ from: "@smog/ui-web", to: "@smog/db" }`.
- [ ] Step 2: `bun test packages/config scripts`. Expected: FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: `bun test packages/config scripts && bun run boundaries`. Expected: PASS, and the boundaries CLI prints `boundaries: ok`.
- [ ] Step 5: Commit `feat(config): add tsconfig bases, constants, env schemas and boundaries check`.

### Task 3: `apps/site`, an empty TanStack Start site on Workers

**Files:**
- Create: `apps/site/package.json` (name `@smog/site`; scripts `dev` = `vite dev --port 5173`, `build` = `vite build`, `preview`, `check-types` = `tsc -b`, `test` = `vitest run`, `cf-typegen` = `wrangler types`, `deploy:dry` = `wrangler deploy --dry-run --env staging`)
- Create: `apps/site/vite.config.ts` (`cloudflare({ viteEnvironment: { name: "ssr" } })`, `tanstackStart()`, `react()`, `tailwindcss()`)
- Create: `apps/site/wrangler.jsonc`:
  - `name` `smog-site`, `main` `src/worker.ts`, `compatibility_date` = today, `compatibility_flags` `["nodejs_compat"]`, `observability.enabled`.
  - `env.dev`, `env.staging` and `env.production`, each with `vars` (`SITE_URL`, `ENVIRONMENT`, `EMAIL_FROM`, `EMAIL_REPLY_TO`) and a KV binding `KV` with placeholder ids (`00000000000000000000000000000000`).
  - No top-level bindings. The `.dev.vars.example` is documented.
- Create: `apps/site/src/worker.ts`, which exports a default `{ fetch, queue, scheduled }`. `fetch` delegates to `@tanstack/react-start/server-entry`; `queue` acks all messages and logs `[worker] queue <name>`; `scheduled` logs the cron.
- Create: `apps/site/src/routes/__root.tsx`, `apps/site/src/routes/index.tsx` ("SMOG & Co" heading), `apps/site/src/routes/api/health.ts` (server route GET returning `{ ok: true, environment }` from `import { env } from "cloudflare:workers"`), `apps/site/src/router.tsx`, `apps/site/src/styles.css` (`@import "tailwindcss";`)
- Test: `apps/site/vitest.config.ts` using `@cloudflare/vitest-pool-workers` (`cloudflareTest` / `defineWorkersConfig`, whichever the installed version documents) with the wrangler config and `environment: "dev"`; `apps/site/test/health.test.ts`.

- [ ] Step 1: Write the failing test `health.test.ts`. It uses `SELF.fetch("http://example.com/api/health")` (or the documented equivalent) and expects status 200 and a body `{ ok: true, environment: "dev" }`.
- [ ] Step 2: `bun -F @smog/site test`. Expected: FAIL.
- [ ] Step 3: Implement following the current TanStack Start + Cloudflare guide (see `developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/`). Generate types with `wrangler types --env dev`.
- [ ] Step 4: Run `bun -F @smog/site test && bun -F @smog/site build && bun -F @smog/site check-types && (cd apps/site && bunx wrangler deploy --dry-run --env staging)`. Expected: all exit 0.
  - Also run `timeout 40 bun -F @smog/site dev` in the background, then `curl -s localhost:5173/api/health`. Expected: `{"ok":true,"environment":"dev"}`.
  - `curl -s localhost:5173/` must contain "SMOG &amp; Co".
- [ ] Step 5: Commit `feat(site): scaffold TanStack Start worker with health route`.

### Task 4: `apps/mobile`, an empty Expo SDK 57 app with NativeWind

**Files:**
- Create: `apps/mobile/package.json` (name `@smog/mobile`, `main` `expo-router/entry`; scripts `dev` = `expo start`, `ios`, `android`, `export` = `expo export --platform ios --platform android --output-dir dist`, `test` = `jest`, `check-types` = `tsc --noEmit`, `doctor` = `expo-doctor`)
- Create: `apps/mobile/app.config.ts`, which reads `EXPO_PUBLIC_SITE_HOST` (default `smog-site-staging.workers.dev` placeholder) and sets:
  - the identity from the Global constraints
  - `userInterfaceStyle` automatic, `orientation` portrait, `ios.supportsTablet` true
  - `ios.associatedDomains` `["applinks:" + host]`
  - an Android intent filter for scheme `smog` plus an https filter for the host with `pathPrefix` `/gestures/` and `/lists/`
  - `ios.infoPlist.ITSAppUsesNonExemptEncryption` false
  - plugins `expo-router`, `expo-localization`, `expo-font`, `expo-secure-store`, `expo-video`, `expo-web-browser`, `expo-splash-screen` (background `#00805F`)
  - `experiments.typedRoutes` true
  - `updates.url` `https://u.expo.dev/9fa68b63-dfa5-498a-9196-5eba93ecac29`
- Create: `apps/mobile/eas.json` with profiles:
  - `development` (developmentClient, internal, channel `development`)
  - `staging` (internal, channel `staging`, env `EXPO_PUBLIC_ENVIRONMENT=staging`, `EXPO_PUBLIC_API_URL` = the staging workers.dev placeholder)
  - `production` (store, autoIncrement, channel `production`, env production + the production URL placeholder)
  - each profile has `EXPO_USE_PRECOMPILED_MODULES: "0"` only if still needed on SDK 57
  - `cli.appVersionSource` `local`, and `submit.production` `{}`
- Create: `apps/mobile/app/_layout.tsx` (imports `../global.css`; Stack), `apps/mobile/app/index.tsx` (a NativeWind-styled "SMOG & Co" text using `className`), `apps/mobile/global.css`, `apps/mobile/tailwind.config.js`, `apps/mobile/metro.config.js` (`withNativeWind`), `apps/mobile/babel.config.js`, `apps/mobile/nativewind-env.d.ts`, `apps/mobile/tsconfig.json`
- Create: the `apps/mobile/plugins/withScreenCapturePermissions.js` port. It removes the `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO` and `READ_EXTERNAL_STORAGE` permissions with `tools:node="remove"`; see `/home/user/ref-master/apps/native/plugins`.
- Assets: temporary placeholder icon/splash (`assets/icon.png`, etc.) copied from `/home/user/ref-cerf/apps/mobile/assets` (brand generation replaces them in phase 2).
- Test: `apps/mobile/jest.config.js` (preset `jest-expo`, `transformIgnorePatterns` allow-list incl. `nativewind|react-native-css-interop` and `.bun`), `apps/mobile/src/appConfig.test.ts`.

- [ ] Step 1: Write the failing test `appConfig.test.ts`. It imports the config function and asserts `ios.bundleIdentifier === "be.zias.smog"`, `android.package === "be.zias.smog"`, `scheme === "smog"`, `extra.eas.projectId === "9fa68b63-dfa5-498a-9196-5eba93ecac29"`, and that `ios.associatedDomains` includes `applinks:<host>` for `EXPO_PUBLIC_SITE_HOST=example.test`.
- [ ] Step 2: `bun -F @smog/mobile test`. Expected: FAIL.
- [ ] Step 3: Implement. Use `bun create expo` / `bunx create-expo-app@latest --template` in a scratch dir **only** to learn the SDK 57 template versions, then write the files by hand. Align versions with `bunx expo install --check`.
  - Verify NativeWind: try the latest stable 4.x first with Tailwind 3.
  - If it does not work with RN 0.87 / reanimated, try NativeWind 5 RC with Tailwind 4 and record the choice in `docs/DECISIONS.md`.
- [ ] Step 4: Run `bun -F @smog/mobile test && bun -F @smog/mobile check-types && bun -F @smog/mobile export && (cd apps/mobile && bunx expo-doctor)`. Expected: all exit 0. The export output must contain `dist/_expo/static/js/ios` and `dist/_expo/static/js/android`.
- [ ] Step 5: Commit `feat(mobile): scaffold Expo SDK 57 app with router and NativeWind`.

### Task 5: Release gate, CI and deploy workflows, docs

**Files:**
- Create: `scripts/release-config-check.ts` (Bun; `[releaseConfig]` error prefix), which asserts:
  - `.github/workflows/ci.yml` parses with `Bun.YAML.parse`; it has `on.push` and `on.pull_request`, `permissions.contents: read`, and the steps `oven-sh/setup-bun` with `bun-version-file: package.json`, `bun install --frozen-lockfile` and `bun run release:check`.
  - `deploy.yml` has branch triggers `develop` and `master`, env mapping develop → staging and master → production, a `wrangler d1 migrations apply` step before `wrangler deploy`, and uses the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.
  - `apps/site/wrangler.jsonc` has no top-level `d1_databases`/`kv_namespaces`/`r2_buckets` and has `env.staging` + `env.production`.
- Create: `scripts/mobile-release-check.ts` (Bun; `[mobileReleaseCheck]` prefix). It runs `bunx expo-doctor` in `apps/mobile`, then `bun -F @smog/mobile export`, and prints the bundle size. Each command failure throws.
- Create: `.github/workflows/ci.yml`:
  - Triggers: push to any branch, and pull_request.
  - Concurrency cancels in-progress runs for PRs; `permissions: contents: read`.
  - Job `release-check`: checkout, setup-bun (bun-version-file package.json), `actions/setup-node` 22, `bun install --frozen-lockfile`, `bun run release:check`.
  - Job `e2e`: placeholder that is completed in phase 9; for now it runs `echo` and `if: false`.
- Create: `.github/workflows/deploy.yml`:
  - Triggers: push to `develop` and `master`.
  - Job `deploy` with `environment: ${{ github.ref_name == 'master' && 'production' || 'staging' }}`.
  - A step that checks `secrets.CLOUDFLARE_API_TOKEN` is non-empty and otherwise prints `::warning::` and exits 0.
  - Then `bun install --frozen-lockfile`, `bun -F @smog/site build`, `bunx wrangler d1 migrations apply DB --env $ENV --remote`, `bunx wrangler deploy --env $ENV` (working-directory `apps/site`).
- Modify: root `package.json` `release:check` = `bun run check:ci && bun run boundaries && bun scripts/release-config-check.ts && bun run check-types && bun run test && bun run build && bun run knip && bun audit --production && bun scripts/mobile-release-check.ts`
- Create: `docs/PROGRESS.md` updates, `README.md` (quick start: `bun install`, `cp apps/site/.dev.vars.example apps/site/.dev.vars`, `bun dev`), and the `AGENTS.md` command list for the new apps and packages.
- Test: `scripts/release-config-check.test.ts`. The real repo passes. A fixture ci.yml without `bun run release:check` fails with an error containing `release:check`.

- [ ] Step 1: Write the failing tests.
- [ ] Step 2: `bun test scripts`. Expected: FAIL.
- [ ] Step 3: Implement. Note: the D1 migrations step needs a `DB` binding. Until phase 2 adds D1, `release-config-check` only asserts the step exists in `deploy.yml`.
- [ ] Step 4: `bun run release:check`. Expected: exit 0 (knip clean, audit clean, or findings documented in DECISIONS with the reason).
- [ ] Step 5: Commit `ci: add release gate, ci and deploy workflows` and push `develop`.
