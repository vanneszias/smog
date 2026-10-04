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
bun run test                 # Run all tests (turbo test)
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
```

`release:check` runs four scripts sequentially locally; CI (`.github/workflows/ci.yml`) runs the same scripts on separate runners with `fail-fast: false`: `release:check:core` (`check:ci` → `boundaries` → `scripts/release-config-check.ts` → `check-types` → `build` → `deploy:dry:render` (offline: staging built as `RENDER_MODE=container` through `SMOG_DRY_RENDER_MODE`, the deploy guard with `--dry-run`, `wrangler deploy --dry-run --containers-rollout=none`; the gate-on path, without Docker) → staging `deploy:dry` (offline: the staging build with `SMOG_RENDER_PIPELINE=1`, the deploy guard, `wrangler deploy --dry-run --containers-rollout=none`) → `knip` → `audit`), `release:check:tests` (all tests), `release:check:mobile` (online expo-doctor, both iOS/Android exports, bundle sizes and gallery checks), and `release:check:render` (`scripts/release-check-render.ts`: the `SmogRenderer` image, started with `--network host`, `GET /health`, then `test:render` on the host against it, with the last frame and the MP4 kept as a CI artifact, then the image again as the Container runs it (`RENDER_ENVIRONMENT=staging`, port 8081: `/health`, and an `http:` source refused with 422); CI builds the image first with `docker/build-push-action` and the GHA cache and passes `SMOG_RENDER_NO_BUILD=1`; locally it builds the image itself and runs only with a Docker daemon, otherwise it says it is CI only, not equivalent). Deploy waits for every lane. Pushes to `develop`/`master` run the gate through Deploy only; other branch pushes and pull requests run CI directly.

`SMOG_OFFLINE=1` only affects expo-doctor, and the result is **not equivalent to CI**. Offline, three doctor checks are degraded (the script prints this list every time): the config schema check is tolerated when the schema fetch crashes; the SDK dependency-version check only compares against the bundled native-module list, so the api.expo.dev pins (react, react-native, typescript, jest-expo, …) go unchecked; and the React Native Directory check is off. Fetch failures are warnings (`EXPO_DOCTOR_WARN_ON_NETWORK_ERRORS=1`). Every other doctor failure still fails. Never set it in CI; CI is the authority.

Deploys run from `.github/workflows/deploy.yml` on pushes to `develop` (staging) and `master` (production). It first runs `ci.yml` (reusable, `workflow_call`) as the `release-check` job; `deploy` needs it. Then `scripts/ensure-cloudflare-resources.ts` (staging `--create`; production `--check` unless the repository variable `SMOG_PROVISION_PRODUCTION` is `1`; it never changes or deletes what exists), then D1 migrations (`packages/db/migrations/*.sql`), then `CLOUDFLARE_ENV=<env> bun -F @smog/site deploy`. Without the `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets the job skips with a warning. The resources step needs, on the account and token: the Workers Paid plan (Queues), R2 enabled on the account, and the token permissions Workers R2 Storage: Edit and Workers Scripts: Edit (or Queues: Edit); a refusal prints a `[provision]` line naming the missing one. A bucket CORS that does not allow the PUT from `SITE_URL` fails the step with the `wrangler r2 bucket cors set` command to run by hand (it is never overwritten), and production provisioning refuses while `SITE_URL` is the placeholder.

The render pipeline is gated (`apps/site/render-config.ts`, phase 7 ruling 2): `wrangler.jsonc` has no `workflows`, `containers`, Durable Object binding or migration; the build adds the `RENDER_WORKFLOW` Workflow for `RENDER_MODE=local` (dev only) and the Workflow plus the `SmogRenderer` container block for `container`, which also needs `SMOG_RENDER_PIPELINE=1` (a GitHub **environment** variable per env, passed by `deploy.yml` to the resources and deploy steps; a `container` build without it fails on purpose). Dev and staging are `fake`; production is `container`, so a production build needs the flag. With the flag, the resources step first probes `wrangler workflows list`, `docker info` and `wrangler containers list` and prints a `[provision] Workflows: …` / `[provision] Containers: …` line naming what is missing; the token then needs Workflows (expected: Workers Scripts: Edit) and Containers (expected: Containers: Edit, plus pushing to the Cloudflare Registry), on Workers Paid. These names are unconfirmed until the owner's first flip (docs/PROGRESS.md owner actions, in order: the token, the flag, then the env's `RENDER_MODE`). Turning it off is the reverse: the env's `RENDER_MODE` back to `fake` first, then the flag removed. With the gate on, the deploy job builds the render image first with the GitHub Actions cache (`docker/build-push-action`, scope `smog-renderer-deploy`) and `wrangler deploy` builds on that builder (`BUILDX_BUILDER`, `SOURCE_DATE_EPOCH=0`).

Every command in a package's `test` script runs through `bun <root>/scripts/test-deadline.ts -- <command>`: after 25 minutes (`SMOG_TEST_DEADLINE_MINUTES`) it prints `Test command hung` with the process tree and Node reports, kills the command's process group and exits 124; a command that exits 75 (a stuck Vitest pool, see `StallReporter`) runs once more. Wrap any new test command the same way. `bun run test` streams turbo output (`--log-order=stream`), and the Workers-pool Vitest configs spread `WORKERS_POOL_TEST_OPTIONS` from `@smog/config/testing/vitest` (timeouts, `verbose` in CI, `[vitest-stall]` reports).

Use `bun run <script>` for scripts whose name clashes with a Bun built-in (`build`, `test`).

### Site (TanStack Start on Cloudflare Workers)
```bash
bun -F @smog/site dev        # Vite dev server with local bindings (port 5173)
bun -F @smog/site build      # Build (env.dev; deploy builds set CLOUDFLARE_ENV=staging|production)
bun -F @smog/site deploy:dry # Build for staging (with SMOG_RENDER_PIPELINE=1), run the deploy guard, wrangler deploy --dry-run --containers-rollout=none (no Docker)
bun -F @smog/site deploy:dry:render # The same with staging forced to RENDER_MODE=container (SMOG_DRY_RENDER_MODE; the guard refuses it outside --dry-run)
# Deploys: CLOUDFLARE_ENV=staging|production bun -F @smog/site deploy (never bare `wrangler deploy`)
bun -F @smog/site test       # Vitest (Workers pool)
bun -F @smog/site check-types
bun -F @smog/site cf-typegen # Generate worker-configuration.d.ts (gitignored; check-types does it too)
SMOG_DEV_RENDER_MODE=local bun -F @smog/site dev  # Real renders: adds RENDER_WORKFLOW; run `bun -F @smog/render serve` and give it a Mux (or the fake)
bun -F @smog/site render:local-loop  # Opt-in (needs Chrome): Mux fake + render server + dev server, one paid sponsorship rendered to in_review
```

Local auth (dev only): copy `apps/site/.dev.vars.example` to `.dev.vars` (it has a dev `BETTER_AUTH_SECRET`), then `bun -F @smog/db migrate:dev && bun -F @smog/db seed:dev`. The seeded admin is `admin@smog.test` with the **dev-only** password `smog-dev-admin`. Emails are not sent in dev: read them at `http://localhost:5173/dev/mail` (or `/dev/mail.json`). Migrations are append-only from now on: never edit an existing migration; add a new one (`bun -F @smog/db db:generate`). To start the local D1 from scratch, `rm -rf apps/site/.wrangler/state/v3/d1` first.

Turnstile: `TURNSTILE_SITE_KEY` is a public var in `wrangler.jsonc` (`env.<env>.vars`) and `TURNSTILE_SECRET_KEY` a secret (`wrangler secret put`). Both are required in production before launch: without the site key the web shows no widget and email sign-up, sign-in, reset, code and magic-link requests fail. Staging uses Cloudflare's always-pass test keys; dev needs neither.

Security headers and the CSP come from `apps/site/src/worker/headers.ts`, on every Worker response. The CSP is enforced in dev and production and `Report-Only` in staging. Inline scripts need Start's per-request nonce (automatic for anything Start renders) or a build-time hash (the theme script). A route that sets its own `Content-Security-Policy` keeps it; any other header the route set is kept too. Maintenance mode is the KV key `maintenance` (`maintenanceSettingSchema` in `@smog/config/maintenance`, re-exported by `@smog/admin/schema`; toggled at `/admin/settings` or with `bun run maintenance`; `on` keeps the bypass version, `off` starts a new one). During a window `/sign-in` and only the admin sign-in routes of `/api/auth` (`AUTH_SIGN_IN_ROUTES` in `apps/site/src/worker/maintenance.ts`, served by a sign-in-only Better Auth that creates no user) stay open; a signed-in admin gets past the rest with `POST /api/maintenance/bypass` (12 h cookie, valid until the window ends). A change reaches every visitor within about 2 minutes (isolate cache, KV edge cache, KV propagation).

### Mobile (Expo + Expo Router + NativeWind)
```bash
bun -F @smog/mobile dev      # Start Expo dev server
bun -F @smog/mobile ios      # Run iOS simulator
bun -F @smog/mobile android  # Run Android emulator
bun -F @smog/mobile test     # Jest (jest-expo)
bun -F @smog/mobile check-types
bun -F @smog/mobile export   # expo export for iOS + Android into dist/
bun -F @smog/mobile doctor   # expo-doctor (needs network, see SMOG_OFFLINE above)
bun -F @smog/mobile update -- --profile <development|staging|production> [eas update args]  # OTA update with the profile's eas.json origin keys (never a bare `eas update`)
```

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
- `packages/*`: shared packages (`config`, `utils`, `db`, `auth`, `rpc`, `api`, `local-store`, `payments`, `video`, `render`, `email`, `jobs`, `analytics`, `i18n`, `styles`, `brand`, `ui-web`, `ui-native`)
- `packages/features/*`: feature packages (`gestures`, `favorites`, `lists`, `account`, `sponsorships`, `admin`) with `./schema`, `./contract`, `./server`, `./client` subpath exports
- `scripts/*`: Bun scripts (boundaries check, release checks, data migration)

Package names are `@smog/<dir>` (`@smog/gestures`, not `@smog/features-gestures`).

## Dependencies
- Allowed dependency directions live in `@smog/config/boundaries` and are enforced by `bun run boundaries`; add a package there before depending on it
- Shared versions go in the root `package.json` `workspaces.catalog` and are referenced as `"catalog:"`
- Use the newest stable version of every dependency; a deviation needs a `docs/DECISIONS.md` entry

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
