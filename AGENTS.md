# Development Guidelines

SMOG is a Bun + Turborepo monorepo: one Cloudflare Worker (`apps/site`, TanStack Start), one Expo app (`apps/mobile`), and everything else in `packages/*`. The design spec is `docs/superpowers/specs/2026-09-29-cloudflare-rewrite-design.md`; every non-trivial choice is recorded in `docs/DECISIONS.md`.

## Commands

### Root Commands
```bash
bun install                  # Install (hoisted linker, see bunfig.toml)
bun dev                      # Start all dev servers (turbo)
bun run build                # Build all packages
bun run check                # Biome lint + format with auto-fix
bun run check:ci             # Biome in CI mode (no writes)
bun run check-types          # Typecheck all packages (turbo check-types)
bun run test                 # Run all tests (turbo test, then scripts/*.test.ts, which include the docs accuracy check)
bun run test:e2e [-- --project public|a11y|a11y-signed-in|a11y-reflow|admin|admin-a11y|serial]  # Playwright e2e (apps/site): the seven projects one after another, each wrapped by test-deadline; --project runs one (a CI shard). Fresh D1 first (see Local auth); E2E_PORT / E2E_MUX_PORT / E2E_MOLLIE_PORT move the ports
bun run knip                 # Unused files, exports and dependencies
bun run boundaries           # Enforce the package dependency graph
bun run audit                # bun audit --production (ignored advisories: docs/DECISIONS.md)
bun run mobile:release-check # expo-doctor + expo export (iOS + Android) + bundle size
bun run release:check        # Everything CI runs, in order
SMOG_OFFLINE=1 bun run release:check  # Same, on a machine without internet access
bun run admin:grant --env <dev|staging|production> [--create [--yes]] [--dry-run] <email>  # Give an account the admin role and lift any ban; --create first inserts a verified, password-less admin when none has that email (staging/production need --yes) (dev: local D1, else remote)
bun run maintenance --env <dev|staging|production> on|off [--message …] [--until ISO] [--dry-run] [--yes]  # Maintenance mode (KV; production needs --yes)
bun run cron <expiry|reminders|stale|retention>  # Run one Cron Trigger on the local dev server
bun run retention --env <dev|staging|production> --dry-run  # Count what the daily purge would delete (read-only D1 SELECT)
bun scripts/ensure-cloudflare-resources.ts --env <staging|production> --check|--create|--dry-run  # Queues, DLQs, R2 bucket + CORS (the deploy job runs it)
bun scripts/check-deploy-config.ts --env <staging|production> [--offline] [--warn-only]  # Vars, SITE_URL, KV/D1 ids in wrangler.jsonc, and (online) `wrangler secret list` against requiredWorkerConfig(env, renderMode) + provider pairs; --warn-only is staging only (the deploy job runs it first)
bun run migrate:convex <plan|apply|mux scan|mux renditions|we-moved|help> …  # The Convex → D1 importer (@smog/migrate-convex); every path option is absolute; `mux renditions` and `we-moved` are dry without `--apply`, `apply` only with `--dry-run` (production needs `--yes`); `apply --reset-only` (dev, staging) removes what a plan imported and applies nothing (a second run removes 0), `we-moved --resend <ids-file>|--failed` replays failed batches (docs/cutover-runbook.md)
```

Setup of the accounts, secrets, stores and the render flip is `docs/deployment.md`; the production switch-over (the domain decision, the Convex import timeline, the rollback) is `docs/cutover-runbook.md`; the owner's ordered list is in `docs/PROGRESS.md` (Owner actions in order).

`release:check` runs four scripts sequentially locally. CI (`.github/workflows/ci.yml`) has **five jobs**: the four lanes below (`Release check (core)`, `(tests)`, `(mobile)`, `(render)`, the same scripts on separate runners with `fail-fast: false`) and the `e2e` job, which is not part of `release:check`, so a green `release:check` does not say the e2e passed. The lanes: `release:check:core` (`check:ci` → `boundaries` → `scripts/release-config-check.ts` → `check-types` → `build` → `deploy:dry:render` (offline: staging built as `RENDER_MODE=container` through `SMOG_DRY_RENDER_MODE`, the deploy guard with `--dry-run`, `wrangler deploy --dry-run --containers-rollout=none`; the gate-on path, without Docker) → staging `deploy:dry` (offline: the staging build with `SMOG_RENDER_PIPELINE=1`, the deploy guard, `wrangler deploy --dry-run --containers-rollout=none`) → `scripts/check-deploy-config.ts --env staging --offline` → `knip` → `audit`), `release:check:tests` (all tests), `release:check:mobile` (online expo-doctor, both iOS/Android exports, bundle sizes and gallery checks), and `release:check:render` (`scripts/release-check-render.ts`: the `SmogRenderer` image, started with `--network host`, `GET /health`, then `test:render` on the host against it, with the last frame and the MP4 kept as a CI artifact, then the image again as the Container runs it (`RENDER_ENVIRONMENT=staging`, port 8081: `/health`, and an `http:` source refused with 422); CI builds the image first with `docker/build-push-action` and the GHA cache and passes `SMOG_RENDER_NO_BUILD=1`; locally it builds the image itself and runs only with a Docker daemon, otherwise it says it is CI only, not equivalent). The **`e2e` job** (always on, no `needs`, in parallel with those four lanes; Deploy's reusable call of `ci.yml` waits for it) is a matrix of seven shards, one Playwright project each on its own runner: `public` (every spec not matched below), `a11y` (every `a11y-*.spec.ts` the next two do not name: axe over the guest routes, overlays and banners), `a11y-signed-in` (`a11y-signed-in` and `a11y-keyboard`), `a11y-reflow` (`a11y-reflow` and `a11y-landmarks`), `admin` (`admin-*.spec.ts` except the next ones), `admin-a11y` (`admin-*a11y*.spec.ts`: axe over every admin screen, split off to keep each shard under 15 minutes) and `serial` (`admin-catalog` then `admin-settings`, the maintenance window, on one worker). The projects are independent (no `dependencies`); CI installs the Chromium this Playwright expects (`playwright install --with-deps chromium`, cached by version), runs `retries: 1` with traces on the retry, and `scripts/e2e-flaky-report.ts` turns a pass-on-retry into a `::warning::` and a job-summary row (a bug to fix). No `waitForTimeout` in `apps/site/e2e` (a guard test). Deploy waits for every lane. Pushes to `develop`/`master` run the gate through Deploy only; other branch pushes and pull requests run CI directly.

`SMOG_OFFLINE=1` only affects expo-doctor, and the result is **not equivalent to CI**. Offline, three doctor checks are degraded (the script prints this list every time): the config schema check is tolerated when the schema fetch crashes; the SDK dependency-version check only compares against the bundled native-module list, so the api.expo.dev pins (react, react-native, typescript, jest-expo, …) go unchecked; and the React Native Directory check is off. Fetch failures are warnings (`EXPO_DOCTOR_WARN_ON_NETWORK_ERRORS=1`). Every other doctor failure still fails. Never set it in CI; CI is the authority. The same gap, beyond doctor: `bun run audit` needs the advisory registry (a new advisory fails CI while an offline run is green), the render lane needs a Docker daemon (locally it prints "CI only, not equivalent"), and `release:check` never runs the e2e job (`bun run test:e2e`, below). A release check that exits 0 on a machine without network or Docker therefore proves the core, tests and mobile lanes minus those parts; say which parts you could not run.

Deploys run from `.github/workflows/deploy.yml` on pushes to `develop` (staging) and `master` (production). It first runs `ci.yml` (reusable, `workflow_call`) as the `release-check` job; `deploy` needs it. Then, in this order: `scripts/check-deploy-config.ts` (below), `scripts/ensure-cloudflare-resources.ts` (staging `--create`; production `--check` unless the repository variable `SMOG_PROVISION_PRODUCTION` is `1`; it never changes or deletes what exists), D1 migrations (`packages/db/migrations/*.sql`), then `CLOUDFLARE_ENV=<env> bun -F @smog/site deploy`. Without the `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets a staging deploy skips every step with a warning (green, nothing deployed) and a production deploy fails at its first step. The resources step needs, on the account and token: the Workers Paid plan (Queues), R2 enabled on the account, and the token permissions Workers R2 Storage: Edit and Workers Scripts: Edit (or Queues: Edit); a refusal prints a `[provision]` line naming the missing one. A bucket CORS that does not allow the PUT from `SITE_URL` fails the step with the `wrangler r2 bucket cors set` command to run by hand (it is never overwritten). Both the check and the resources step refuse a **placeholder origin**: a `SITE_URL` that is not a bare `https:` origin, a reserved host, or a workers.dev host without four labels (`<script>.<subdomain>.workers.dev`; staging is `smog-site-staging.zias.workers.dev`, production `smog-site-production.zias.workers.dev` by default, the domain `app.smog.vlaanderen` being the owner's choice in `docs/cutover-runbook.md`).

**The deploy config check** (`scripts/check-deploy-config.ts --env <staging|production> [--offline] [--warn-only]`, phase 8 ruling 1) holds an env to `requiredWorkerConfig(env, renderMode)` (`@smog/config/env/worker`; a `container` env also needs the Mux trio): the required vars non-empty in `wrangler.jsonc`, `SITE_URL`, the exact KV and D1 placeholder ids refused, and, online, every required secret in `wrangler secret list --env <env>` (each error prints its `wrangler secret put` line; the first `secret put` creates the Worker, so `secret list` fails until then; the token needs Workers Scripts: Read, which Edit includes). Sign-in providers are all-or-nothing pairs (`PROVIDER_SECRET_GROUPS`: Google two secrets, Apple three); an absent provider or OpenPanel pair is only listed as recommended. **`SMOG_REQUIRE_SECRETS`**: staging only warns (`--warn-only`, which also turns a crashed script or a hung `wrangler` into a `::warning::`) until the owner sets `SMOG_REQUIRE_SECRETS=1` as a variable of the **`staging` GitHub environment** (not the repository: a repository-level 1 also makes staging enforce, and production ignores it). **Production always enforces and refuses `--warn-only`.** `release:check:core` runs `--env staging --offline` (no secrets).

The render pipeline is gated (`apps/site/render-config.ts`, phase 7 ruling 2): `wrangler.jsonc` has no `workflows`, `containers`, Durable Object binding or migration; the build adds the `RENDER_WORKFLOW` Workflow for `RENDER_MODE=local` (dev only) and the Workflow plus the `SmogRenderer` container block for `container`, which also needs `SMOG_RENDER_PIPELINE=1` (a GitHub **environment** variable per env, passed by `deploy.yml` to the resources and deploy steps; a `container` build without it fails on purpose). Dev and staging are `fake`; production is `container`, so a production build needs the flag. With the flag, the resources step first probes `wrangler workflows list`, `docker info` and `wrangler containers list` and prints a `[provision] Workflows: …` / `[provision] Containers: …` line naming what is missing; the token then needs Workflows (expected: Workers Scripts: Edit) and Containers (expected: Containers: Edit, plus pushing to the Cloudflare Registry), on Workers Paid. These names are unconfirmed until the owner's first flip (docs/PROGRESS.md owner actions, in order: the token, the flag, then the env's `RENDER_MODE`). Turning it off is the reverse: the env's `RENDER_MODE` back to `fake` first, then the flag removed. With the gate on, the deploy job builds the render image first with the GitHub Actions cache (`docker/build-push-action`, scope `smog-renderer-deploy`) and `wrangler deploy` builds on that builder (`BUILDX_BUILDER`, `SOURCE_DATE_EPOCH=0`).

Every command in a package's `test` script runs through `bun <root>/scripts/test-deadline.ts -- <command>`: after 25 minutes (`SMOG_TEST_DEADLINE_MINUTES`) it prints `Test command hung` with the process tree and Node reports, kills the command's process group and exits 124; a command that exits 75 (a stuck Vitest pool, see `StallReporter`) runs once more. Wrap any new test command the same way. `bun run test` streams turbo output (`--log-order=stream`), and the Workers-pool Vitest configs spread `WORKERS_POOL_TEST_OPTIONS` from `@smog/config/testing/vitest` (timeouts, `verbose` in CI, `[vitest-stall]` reports).

Use `bun run <script>` for scripts whose name clashes with a Bun built-in (`build`, `test`).

### Site (TanStack Start on Cloudflare Workers)
```bash
bun -F @smog/site dev        # Vite dev server with local bindings (port 5173)
bun -F @smog/site build      # Build (env.dev; deploy builds set CLOUDFLARE_ENV=staging|production)
bun -F @smog/site deploy:dry # Build for staging (with SMOG_RENDER_PIPELINE=1), run the deploy guard, wrangler deploy --dry-run --containers-rollout=none (no Docker)
bun -F @smog/site deploy:dry:render # The same with staging forced to RENDER_MODE=container (SMOG_DRY_RENDER_MODE; the guard refuses it outside --dry-run)
# Deploys: CLOUDFLARE_ENV=staging|production bun -F @smog/site deploy (never bare `wrangler deploy`; it builds the workspace packages through turbo first)
bun -F @smog/site test       # Vitest (Workers pool)
bun -F @smog/site check-types
bun -F @smog/site cf-typegen # Generate worker-configuration.d.ts (gitignored; check-types does it too)
SMOG_DEV_RENDER_MODE=local bun -F @smog/site dev  # Real renders: adds RENDER_WORKFLOW; run `bun -F @smog/render serve` and give it a Mux (or the fake)
bun -F @smog/site render:local-loop  # Opt-in (needs Chrome): Mux fake + render server + dev server, one paid sponsorship rendered to in_review
```

Local auth (dev only): copy `apps/site/.dev.vars.example` to `.dev.vars` (it has a dev `BETTER_AUTH_SECRET`), then `bun -F @smog/db migrate:dev && bun -F @smog/db seed:dev`. The seeded admin is `admin@smog.test` with the **dev-only** password `smog-dev-admin`. Emails are not sent in dev: read them at `http://localhost:5173/dev/mail` (or `/dev/mail.json`). Migrations are append-only from now on: never edit an existing migration; add a new one (`bun -F @smog/db db:generate`). To start the local D1 from scratch, `rm -rf apps/site/.wrangler/state/v3/d1` first. **The next free migration number is 0015** (0013 `dead_letter` and the `audit_log` rebuild, 0014 the `sponsorship.logo_key` index); `scripts/docs-check.test.ts` fails when a document says another number.

**E2E locally, the way CI runs it:** one project at a time on a fresh D1 (`rm -rf apps/site/.wrangler/state/v3/d1 && bun -F @smog/db migrate:dev && bun -F @smog/db seed:dev`), with `CI=1 PLAYWRIGHT_CHROMIUM_PATH=<Playwright's chromium_headless_shell> taskset -c 0,1 bunx playwright test --project=<name>` from `apps/site` (full Chrome and more CPUs hid failures that only CI showed). A new spec goes into the project whose filename pattern in `apps/site/playwright.config.ts` matches and must keep its shard well under 15 minutes on CI (observed CI times: `public` ~10 min, `admin-a11y` ~9.5, `admin` ~5, `a11y-reflow` ~4.5, `a11y` ~4, `a11y-signed-in` ~3, `serial` ~3). A test that passes only on the retry is a bug (`scripts/e2e-flaky-report.ts` says so in CI).

Turnstile: `TURNSTILE_SITE_KEY` is a public var in `wrangler.jsonc` (`env.<env>.vars`) and `TURNSTILE_SECRET_KEY` a secret (`wrangler secret put`). Both are required in production before launch: without the site key the web shows no widget and email sign-up, sign-in, reset, code and magic-link requests fail. Staging uses Cloudflare's always-pass test keys; dev needs neither.

Security headers and the CSP come from `apps/site/src/worker/headers.ts`, on every Worker response. The CSP is enforced in dev and production and `Report-Only` in staging. Inline scripts need Start's per-request nonce (automatic for anything Start renders) or a build-time hash (the theme script). The CSP ends with `report-uri /api/csp-report; report-to csp`, and documents get `Reporting-Endpoints: csp="<request origin>/api/csp-report"` in every env. `POST /api/csp-report` (`apps/site/src/server/csp-report.ts`) takes `application/csp-report` and `application/reports+json` (16 KiB cap, rate-limited on `RL_ANALYTICS` as `csp:<ip>`, 204, exempt from maintenance, no Origin check and no CORS) and logs one `[csp] violation {…}` line with every URL reduced to origin plus path (re-edit and renewal URLs carry raw tokens); it never relays to OpenPanel. On staging the reports reach the Worker only once Cloudflare Access bypasses `/api/csp-report`. A route that sets its own `Content-Security-Policy` keeps it; any other header the route set is kept too. Maintenance mode is the KV key `maintenance` (`maintenanceSettingSchema` in `@smog/config/maintenance`, re-exported by `@smog/admin/schema`; toggled at `/admin/settings` or with `bun run maintenance`; `on` keeps the bypass version, `off` starts a new one). During a window `/sign-in` and only the admin sign-in routes of `/api/auth` (`AUTH_SIGN_IN_ROUTES` in `apps/site/src/worker/maintenance.ts`, served by a sign-in-only Better Auth that creates no user) stay open; a signed-in admin gets past the rest with `POST /api/maintenance/bypass` (12 h cookie, valid until the window ends). A change reaches every visitor within about 2 minutes (isolate cache, KV edge cache, KV propagation).

**Guards that fail a change on purpose (phase 9).** Each is a test; extend its table in the same commit as the change it guards.
- **Authorization:** `packages/api/test/authz.test.ts` lists every oRPC procedure with who may call it (a new procedure without a row fails), and `apps/site/test/security-authz.test.ts` runs banned and cross-user calls through the whole stack.
- **Routes and rate limits:** `scripts/security-guard.test.ts` needs one row per route file (its limiter, or "none" with a reason; the table is printed in `docs/API.md`) and scans the sources for logged secrets. `POST /api/rpc` and `/api/openapi` refuse a body over 5 MiB (`RPC_MAX_BODY_BYTES`); the `[csp] violation` log is sampled (20 lines a minute per isolate); `apps/site/src/worker/top-level.ts` logs one redacted `[error]` line per unhandled fetch, queue or scheduled error.
- **Tokens stay in the URL fragment:** a sponsor re-edit or renewal link is `/sponsor/edit#token=…` or `/sponsor/renew#token=…`, built only by `sponsorshipLinkUrl` (`@smog/sponsorships/schema`) and read after hydration (`useLinkToken`); never put a token in a query string. Old `?token=` links are moved by the client and by the legacy 302 (`Cache-Control: no-store`). `apps/site/scripts/token-links.test.ts` fails on any other form.
- **Performance budgets:** `apps/site/perf-budget.json` holds a gzip budget per route entry (the entry plus its static closure) and the Worker cap; `bun run build` (the deploy guard with `--bundle`) fails over a budget, for a route chunk with no entry (`dev/*` is exempt) and for a source map. **A new route needs a budget entry**; a lazy split lowers the budgets in the same commit (the 200/300 kB targets are not met yet, `docs/DECISIONS.md`, phase 9 task 6). Query plans of the hot D1 paths are tested with `fullScans` from `@smog/db/testing` (`plan.ts`): a full scan fails unless it is named in the test.
- **Cache policy:** one table in `apps/site/src/worker/cache.ts` (HTML `private, no-cache`; API, `/_serverFn/` and auth `no-store`; hashed assets immutable through `apps/site/public/_headers`, which matches by extension, so a new hashed extension needs a line there). `_headers` also carries Permissions-Policy, COOP and HSTS for static files, which never reach the Worker.
- **The documents:** `scripts/docs-check.test.ts` (in `bun run test`) fails when AGENTS.md, README.md or `docs/*.md` name a `bun run` script, a path, a relative link, a `docs/DECISIONS.md` section title or a next free migration number that does not exist, or when the CI lanes and e2e shards listed here differ from `ci.yml`. A path that is gitignored is accepted; any other exception goes in `PATH_ALLOW` with its reason.

**Dead letters (phase 9).** Both queue DLQs (`smog-<env>-email-dlq`, `smog-<env>-sponsorship-events-dlq`) have a push consumer (`apps/site/src/worker/dlq-queue.ts`, `max_retries` 20, `retry_delay` 300) that stores each message in D1 `dead_letter` (migration 0013) and keeps it 14 days (daily retention). The admin screen `/admin/dead-letters` lists, **replays** and **discards** (audited); the dashboard shows the open count and the daily retention cron sends one `admin_dead_letter` digest email per admin. Messages that carry a secret (the four auth emails and the renewal reminder, `@smog/email/body-policy`), key-less and invalid ones are stored **without a body** and cannot be replayed; an account deletion erases rows by recipient. Alerts for this and for `render_failed` are the digest and the Cloudflare notifications the owner sets up (`docs/deployment.md` §8a, `docs/PROGRESS.md` owner step 2).

### Mobile (Expo + Expo Router + NativeWind)
```bash
bun -F @smog/mobile dev      # Start Expo dev server
bun -F @smog/mobile ios      # Run iOS simulator
bun -F @smog/mobile android  # Run Android emulator
bun -F @smog/mobile test     # Jest (jest-expo)
bun -F @smog/mobile check-types
bun -F @smog/mobile export   # expo export for iOS + Android into dist/
bun -F @smog/mobile doctor   # expo-doctor (needs network, see SMOG_OFFLINE above)
bun -F @smog/mobile update -- --profile <development|staging|production> [eas update args]  # OTA update with the profile's eas.json origin keys and APP_VARIANT (never a bare `eas update`)
```

**App variants (phase 9).** The `development` and `staging` EAS profiles set `APP_VARIANT`, so a test build installs beside the store app: `SMOG Dev` / `be.zias.smog.dev` / `smog-dev://` and `SMOG Staging` / `be.zias.smog.staging` / `smog-staging://`, with no universal links (the AASA and `assetlinks.json` name the store ids only). Production, unset and `""` are the store identity byte for byte (a snapshot test pins it); an unknown value throws. A local `expo run:*` without `APP_VARIANT` installs under the store identity. The logic lives in `apps/mobile/app.config.ts` (Expo's loader resolves no relative imports of local TypeScript); `bun run mobile:release-check` and `apps/mobile/src/app-config.test.ts` cross-check every profile. A magic link signs in only the store app (the emailed link is an https universal link); testers of a variant use a code, a password or a provider.

Local runs need the `EXPO_PUBLIC_*` env: copy `apps/mobile/.env.example` to `apps/mobile/.env` (the app points at the local site on port 5173; use your LAN address on a device).

### Render server (`@smog/render`, Bun + Remotion)
```bash
bun -F @smog/render serve        # RENDER_MODE=local server on 127.0.0.1:3002 (rebuilds .render-bundle/ on each start, so it renders the current composition)
bun -F @smog/render test:render  # A real render with Chrome; RENDER_BROWSER_EXECUTABLE=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell locally, RENDER_SERVER_URL to target a running server
bun -F @smog/render fixture      # Re-render test/fixtures/source-2s.mp4 (needs a browser; commit the file)
docker build --platform linux/amd64 -f packages/render/container/Dockerfile .  # The image (context: the repository root)
```

The server (`packages/render/src/server/*`) is the only `@smog/render` code that may use `Bun.*`, and `bun run test` never starts Chrome or Docker: the real render runs only in `test:render` and the render lane.

### Packages
```bash
bun -F @smog/<name> test     # bun test (pure packages) or Vitest (D1/R2/KV/Queues)
bun -F @smog/<name> check-types
```

## Code Style

### Imports
- Third-party imports first, then workspace imports (`@smog/*`), then app-local imports (`@/`)
- Use `@/` alias for app-specific imports
- Use `@smog/package-name` for workspace imports

Example:
```ts
import { Ionicons } from "@expo/vector-icons";
import { BORDER_RADIUS, SHADOWS } from "@smog/styles";
import { useTheme } from "@/context/ThemeContext";
```

### Naming Conventions
- Components: PascalCase (`GestureCard`, `BottomSheet`)
- Hooks: camelCase with `use` prefix (`useBottomSheet`, `useAutoSync`)
- Services/Instances: camelCase (`gestureService`, `databaseService`)
- Types/Interfaces: PascalCase (`GestureCardProps`, `GestureCardRef`)
- Constants: UPPER_SNAKE_CASE (`BORDER_RADIUS`, `SPACING`)

### TypeScript
- TypeScript 7 (native `tsc`), strict mode, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`
- Extend a base from `@smog/config/tsconfig/*.json` (`library`, `react`, `worker`, `react-native`)
- Use `type` keyword for type-only imports: `import type { Gesture } from "@/types"`
- Explicit types for function parameters and return values

### Runtimes
- Code that runs in the Worker (`apps/site`, feature `./server`, jobs, db) never uses `Bun.*`
- Bun is for scripts, tests, the render container and the toolchain
- Env and bindings are validated once per runtime with the schemas in `@smog/config/env/*`

### Error Handling
- Use try/catch in async functions
- Log errors with service name prefix: `[serviceName] Failed to ...`
- Rethrow errors for calling code to handle

Example:
```ts
try {
  await service.doSomething();
} catch (error) {
  console.error("[serviceName] Failed to do something:", error);
  throw error;
}
```

## Project Structure
- `apps/site`: TanStack Start site and API on one Cloudflare Worker (routing, screens, wiring only)
- `apps/mobile`: Expo app (routing, screens, wiring only)
- `packages/*`: shared packages (`config`, `utils`, `db`, `auth`, `rpc`, `api`, `local-store`, `payments`, `video`, `render`, `email`, `jobs`, `analytics`, `i18n`, `styles`, `brand`, `ui-web`, `ui-native`, `migrate-convex`)
- `packages/migrate-convex`: the Convex → D1 importer (Bun CLI in `src/cli`, pure `src/core` with no `Bun.*`, `node:*` or `cloudflare:*`; nothing depends on it; `docs/cutover-runbook.md`)
- `packages/features/*`: feature packages (`gestures`, `favorites`, `lists`, `account`, `sponsorships`, `admin`) with `./schema`, `./contract`, `./server`, `./client` subpath exports
- `scripts/*`: Bun scripts (boundaries check, release and deploy config checks, resource provisioning, admin grant, maintenance, retention, EAS update wrapper)

Package names are `@smog/<dir>` (`@smog/gestures`, not `@smog/features-gestures`).

## Dependencies
- Allowed dependency directions live in `@smog/config/boundaries` and are enforced by `bun run boundaries`; add a package there before depending on it
- Shared versions go in the root `package.json` `workspaces.catalog` and are referenced as `"catalog:"`
- Use the newest stable version of every dependency; a deviation needs a `docs/DECISIONS.md` entry. Held on purpose after the phase 9 sweep (`docs/DECISIONS.md`, phase 9 task 10): Bun 1.3.11 and Biome 2.5.14 (newer stable versions are on the owner's list in `docs/PROGRESS.md`, Post-launch carries), vitest 5 and postcss 8.5.31 (tried and refused), and the Expo SDK 57 pins (React 19.2.3, React Native 0.86, Jest 29, Tailwind 3)

## Linting
- Biome handles linting and formatting
- Extends `ultracite` presets (`ultracite/biome/core`, `ultracite/biome/react`)
- Run `bun run check` before committing to auto-fix issues

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
