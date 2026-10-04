# Phase 8: Environments and the Convex → D1 migration implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything the owner needs to launch production and move the old users and data, prepared and proven offline, with every step that needs the owner written down in order.

The phase has two halves:

1. **Environments.**
   - Each deploy env is checked before it deploys: its secrets against `wrangler secret list` (render-mode and provider aware), and its vars, `SITE_URL` and resource ids against `wrangler.jsonc`.
   - The mobile build profiles point at the same origins as the site.
   - The CSP gets a same-origin report endpoint.
   - The first production admin can be created and can sign in under maintenance.
   - Staging and production get separate Mux environments, which the code tells apart.
   - The welcome email is claimed once in D1 (migration 0012).
   - A rejected sponsorship's video gets a retention bound.
2. **The Convex → D1 migration**, a Bun tool, `@smog/migrate-convex`.
   - It reads a Convex export snapshot (a ZIP or a directory) and maps every old table field by field: WorkOS users → Better Auth users, the catalogue (restoring each sponsored gesture's own video), favorites, lists and shares, consents, admin logs, and sponsorships split into the new tables.
   - It writes a report and idempotent SQL batches for a declared target. A staging target is always pseudonymised.
   - It applies them with `wrangler d1 execute` after a preflight, then rebuilds `gesture_fts` and bumps `catalog:version`.
   - Separate commands handle the rest: a read-only Mux scan, enabling `static_renditions: highest` (a real API call, so dry-run by default), and the one-time `we_moved` email (E-13, production only, dry-run by default).
   - A fixture export proves the whole path in the Workers pool: the SQL is applied to a D1 with every migration, and the real services then read the result.

**Nothing in this phase deploys, and the session has no Cloudflare, Mux, EAS or store credentials.**
- Every push to `develop` deploys staging. So each merge must leave staging's deploy green and its built config unchanged.
- The following are owner actions: running the migration on real data, setting secrets, creating Mux environments, EAS and store work, the domain decision, the Access bypasses and the production flags.
- They are prepared here, verified offline or against fakes, and listed in order. Task 11 writes them into PROGRESS and the runbooks.

**Architecture:**
- **The deploy config check** (`scripts/check-deploy-config.ts`, Bun).
  - It reads `apps/site/wrangler.jsonc` `env.<env>` and that env's render mode, and runs `wrangler secret list --env <env>` (JSON, wrangler's default format).
  - It checks:
    - the secrets against `requiredWorkerConfig(env, renderMode)` plus the provider pairs that are enabled;
    - the vars, `SITE_URL` and the KV/D1 ids in the file.
  - `deploy.yml` runs it **before** `Ensure Cloudflare resources`, so it fails fast and has no side effects. `release-config-check` holds that order. CI runs its offline form on staging.
- **Mobile envs.**
  - `apps/mobile/eas.json`:
    - profiles `development`, `staging` and `production`;
    - remote app versions;
    - EAS environments for the OpenPanel pair;
    - a filled submit profile.
  - `app.config.ts`.
  - A `release-config-check` cross-check:
    - the staging and dev profiles equal their site env's `SITE_URL`;
    - the production profile equals the committed `PRODUCTION_LAUNCH_ORIGIN` (ruling 3).
  - Jest tests that resolve `app.config.ts` under each profile.
- **Site.**
  - `POST /api/csp-report`: same-origin by design (`report-uri` / `report-to`), rate-limited, capped, and logs one redacted line. `worker/headers.ts` adds the report directives and `Reporting-Endpoints`.
  - `scripts/admin-grant.ts` gains `--create`. The maintenance sign-in routes are proven to let a credential-less admin sign in with an email code.
- **Mux per env.**
  - `@smog/video` tags render passthroughs with the env (`render-job:<env>:<jobId>`). It gains `enableStaticRendition` and the asset's rendition state (and the fake does too), and its webhook moves to `readCappedBody`.
  - `@smog/sponsorships/server`: `isCurrentRenderUpload` answers `false` for an unknown job of this env and ignores other envs' events. The rejected video's retention and the bounded `rejected → changes_requested` live here too.
- **`@smog/migrate-convex`** (`packages/migrate-convex`, a workspace package; ruling 6).
  - `src/core/*`: pure TypeScript with no `Bun.*`, `node:*` or `cloudflare:*`, and only allowed imports (ruling 6), so it runs under `bun test` and in workerd. It holds the export schemas (Zod per Convex table), the deterministic ids, the pseudonymiser, the transforms, the report, the overrides and the SQL emitter.
  - `src/cli/*` (Bun only):
    - the reader: a directory, or a ZIP read through `fflate`, which loads the whole ZIP into memory and skips `_storage/` and system tables with its `filter`;
    - **one shared wrangler runner** (`src/cli/wrangler.ts`, with a fake), created by Task 5;
    - the commands `plan`, `apply`, `mux scan`, `mux renditions` and `we-moved`.
  - `test/fixtures/export/<table>/documents.jsonl`: one hand-written export covering every edge case below.
  - The root script is `bun run migrate:convex <command>`.
- **D1:** migration `0012_user_welcomed_at` (`ADD COLUMN` plus a backfill; no table rebuild, so 0007's trigger stays).

**Tech stack:**
- As in phase 7. The bumps and additions below are each the newest stable version, and each gets a **[dep]** DECISIONS entry. Versions were checked against the registry on 2026-10-04; check them again at install.
  - `fflate` 0.8.3, the ZIP reader (Bun has no ZIP API).
  - `@biomejs/biome` 2.5.14 → 2.5.15 and `turbo` 2.11.5 → 2.11.7 (root).
  - `better-auth`, `@better-auth/core`, `@better-auth/expo` and `@better-auth/passkey` 1.7.6 → 1.7.7. These are pinned in `packages/auth/package.json`, not in the catalog. Re-run the welcome hooks' pinned tests.
  - The `eas-cli` floor in `eas.json` becomes `>= 24.10.0`. The CLI belongs to the owner and is not a dependency.
  - **Bun stays on 1.3.11** (DECISIONS 2026-10-04: the render image pins `oven/bun:1.3.11` by digest in every stage). No upgrade in this phase.
- Cloudflare (all on the owner's side):
  - `wrangler secret list` needs Workers Scripts: Read, which Edit includes.
  - The Queues HTTP API (`POST /accounts/:id/queues/:queue_id/messages/batch`) needs **Queues: Edit**, at most 100 messages and 256 KB per batch.
  - Workers Custom Domains are used only if the owner chooses the domain path (ruling 2).

**Spec:**
- §1: no deploy from this run, no custom domains yet.
- §2: no `Bun.*` in workerd.
- §4 and §4.1: the new package and its boundaries.
- §5: `legacy_id`, append-only migrations.
- §5.1 and §6: migrated users get `email_verified = true` and no credential.
- §5.2–§5.4: every target table. §5.2 says "the sponsored video is not written into `gesture.playback_id`" (ruling 9).
- §5.5: the status mapping.
- §8.2: Mux.
- §8.3: E-13 `we_moved`.
- §9: the CSP, legacy redirects, the maintenance sign-in routes, the `/webhooks/mollie` alias.
- §10: the EAS profiles.
- §12: OpenPanel only with consent.
- §14: whole.
- §15: whole, amended by rulings 6, 7, 8 and 15.

Inventory rows; tick `Done` when shipped:
- P-40 (the data migration);
- E-13 (`we_moved`: "built; sent at cutover");
- R-03 and R-05 (migrated legacy ids and share tokens resolve);
- R-15 (unexpired re-edit tokens hashed);
- U-07 (migrated users and account linking);
- U-12 (roles imported without demotion);
- P-35 (the mobile identity in `eas.json`);
- X-16 (the store privacy forms prepared; the owner submits).

**Mandatory carries from `docs/PROGRESS.md`, point by point** (phases 4–7; the task number is in brackets):
1. The migration enables `static_renditions: highest` on every imported gesture asset, dry-run by default. [9]
2. Separate Mux environments per env, each with its own token, webhook and signing secret. Then `isCurrentRenderUpload` answers `false` for an unknown job of this env (phase 7 task 6 review M-3). [4 for the code; the owner for the environments]
3. `requiredWorkerConfig(env, renderMode)` is checked against `wrangler secret list` before each deploy, render-mode aware: `container` needs the Mux trio. [2]
4. The retention of a rejected sponsorship's video, and `rejected → changes_requested` bounded in time to match (phase 7 ruling 13). Implemented with a default; it goes to the legal sign-off. [4]
5. The production render flag `SMOG_RENDER_PIPELINE=1` on `production`, and a production smoke render. **Owner**, ordered in the runbook. [11]
6. The welcome claim `user.welcomed_at` takes migration 0012, with its backfill. [1]
7. Optional: one frame of an old sponsored video beside a new render. **Owner**. [11]
8. `REQUIRED_WORKER_CONFIG` with the phase 6 names: `MOLLIE_API_KEY` (`live_` in production), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, the `R2_ACCOUNT_ID` var, `BETTER_AUTH_SECRET`, the Turnstile pair and the Mux secrets. [2]
9. Mollie's production profile: its website set to the production origin, and the live key. **Owner**. [11]
10. The Cloudflare Email Service onboarding of `smog.vlaanderen`. **Owner**, before T-1: the first admin signs in with an email code (ruling 18). [11]
11. Remove the legacy `POST /webhooks/mollie` alias 30 days after cutover. **Deferred** to cutover + 30 days, with its log check. [11]
12. The migration hashes the unexpired re-edit tokens with `hashSponsorshipToken`, keeps `payment.mollie_id`, and migrated users never get the welcome email. [8, 7, 1]
13. `SPONSOR_LINK_IN_APP`, decided at the first iOS review. **Owner**, with the store submission. [6, 11]
14. The DLQs are checked by hand after an incident. Alerting is **deferred to phase 9**; the runbook names the check. [11]
15. E-13, the one-time `we_moved` email. [9]
16. Phase 5 review I1:
    - (a) roles and `user_keep_one_admin`: insert with the final role, never demote, never upsert a role [7, 10];
    - (b) table rebuilds drop triggers: 0012 is `ADD COLUMN` only, and a test proves the trigger survives [1];
    - (c) audit rows are `legacy`, with a `target_type` from `AUDIT_TARGET_TYPES` and `actor_id` NULL when unknown [7];
    - (d) `sort_name`, unique slugs, the `gesture_fts` rebuild and `bumpCatalogVersion` [7, 10].
17. The CSP report endpoint before launch: same-origin, rate-limited, logs. **No OpenPanel relay** (ruling 11). [3]
18. Staging smoke: a stale admin save returns `CONFLICT` on real D1. **Owner** (needs an Access session). [11]
19. Required secrets and vars before deploy: the production Turnstile pair, and a `SITE_URL` equal to the browser origin. [2]
20. The Mux secrets are required in production, and the dashboard webhook points at `<SITE_URL>/api/webhooks/mux`. [2 for the check; the owner for the dashboard]
21. Staging smoke: a Mux webhook retry more than 5 minutes later still verifies. **Owner**. [11]
22. Phase 7 task 6 review M-3: the same as carry 2. [4]
23. The App Store privacy label and the Play data safety form name Turnstile and OpenPanel. The answers are prepared [6]; the owner submits them [11].
24. The DECISIONS rules for migrated data:
    - the list limits: a list over 500 items is split into `Name (2)` …;
    - an account over 100 lists is reported;
    - positions are renumbered and never used as an index;
    - `catalog:version` is bumped after the import.
    [7, 10]
25. From the Known gaps:
    - The cleanup: `@smog/analytics`' relay and `@smog/video`'s webhook move to `readCappedBody`. [3 for analytics, 4 for video]
    - The `bun -F @smog/site deploy` turbo bypass stays a known gap; restate it. [11]
26. **Found while planning:** the staging host is wrong in the mobile config.
    - `apps/mobile/eas.json` (staging) and `app.config.ts` point at `smog-site-staging.workers.dev`. The site's staging `SITE_URL` is `smog-site-staging.zias.workers.dev`.
    - Production's `SITE_URL` (`smog-site-production.workers.dev`) is not a real workers.dev host either.

    [2, 6]
27. From the PROGRESS owner list, carried through: the Remotion licence, the container cost, the production bucket's location or jurisdiction, and the staging presigned-PUT length check. **Owner**. [11]

## Rulings made for this plan

These are recorded here and go into `docs/DECISIONS.md` with the task that implements them.

1. **The deploy config check (`scripts/check-deploy-config.ts`).**
   - Usage: `bun scripts/check-deploy-config.ts --env <staging|production> [--offline] [--warn-only]`. It reuses `ensure-cloudflare-resources.ts`'s `CommandRunner` and `[provision]` hint style; wrangler runs from `apps/site`.
   - **From `wrangler.jsonc` `env.<env>`:**
     - `RENDER_MODE` (unset is `fake`) gives `requiredWorkerConfig(env, mode)`. Every required var must be non-empty.
     - `SITE_URL` must be `https:` with no path, and must not be a known placeholder. A `*.workers.dev` host must have four labels (`<script>.<subdomain>.workers.dev`).
     - The **exact** placeholders are refused: the D1 `database_id` `00000000-0000-4000-8000-000000000000` and the KV `id` of 32 zeros.
   - **Online** (the default): `wrangler secret list --env <env>` (JSON) gives the secret names.
     - Every required secret must be listed.
     - **Providers are pairs, required only when enabled.** An env that has any of `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` needs both. An env that has any of `APPLE_CLIENT_ID` / `APPLE_CLIENT_SECRET` / `APPLE_APP_BUNDLE_IDENTIFIER` needs all three. All three are secrets (`workerSecretsSchema`).
     - A provider that is absent prints as "not configured" in a **recommended** list, with the OpenPanel pair. It is never an error.
     - Making Google or Apple mandatory in production is an owner decision (owner list). It depends on whether WorkOS offered them, which only the WorkOS dashboard shows. App Store guideline 4.8 applies: Google on iOS needs Sign in with Apple too.
     - Secret values cannot be read, so value rules (a `live_` Mollie key, Turnstile outside dev) stay in `workerEnvSchema` at runtime.
     - A failing `secret list` names its cause. For a Worker that does not exist yet (the first production deploy): "set its secrets first with `wrangler secret put … --env production`, which creates the Worker". For an auth failure: the permission it needs.
   - **`--offline`** skips `secret list`. `release:check:core` runs `--env staging --offline` after `deploy:dry`. Production is not checked offline in CI: its placeholders are expected until launch.
   - **Staging warns, production enforces.**
     - `deploy.yml` passes `--warn-only` for staging unless the staging GitHub environment variable `SMOG_REQUIRE_SECRETS=1` is set. `--warn-only` with `--env production` is refused, by the script and by `release-config-check`.
     - **`--warn-only` catches everything:** check errors, a runner that throws, wrangler's non-zero exit, unparsable output (proxy or update banners), and any unexpected exception. `main` is one try/catch. Each problem prints as `::warning::`, and the script exits 0.
   - **Order in `deploy.yml`:** after `bun install`, **before** `Ensure Cloudflare resources`. So with `SMOG_PROVISION_PRODUCTION=1`, nothing is created before a missing secret is found.
   - Rationale: one script owns the before-deploy facts the Worker cannot check itself, at the earliest point. Alternatives: the deploy guard (it runs after the build, has no token, and runs after the migrations); a Worker self-check (too late).
2. **Production's origin: workers.dev by default; the domain is the owner's decision.**
   - Production's `SITE_URL` placeholder becomes `https://smog-site-production.zias.workers.dev`, the account subdomain that staging's host shows. **That is the default launch origin** (spec §1 and §14: no custom domains yet).
   - Production first deploys on it with maintenance on (the runbook). So provisioning, the migrations, the import and the admin check all happen before the public switch.
   - `docs/cutover-runbook.md` prepares **both paths**, for the owner to choose:
     - **(W) Stay on workers.dev.**
       - The old host `app.smog.vlaanderen` is left with the old server, or the owner points it at a redirect.
       - The printed QR codes (`/gestures/<convexId>`, R-03) and the in-flight Mollie webhooks (`<old origin>/webhooks/mollie`, spec §15) then work only while the old host forwards to the new origin. The runbook gives the redirect options: a Cloudflare Redirect Rule if the zone is on Cloudflare, otherwise the old Caddy.
     - **(D) Move to `app.smog.vlaanderen`.** A prepared **domain commit**, documented as a diff and not committed, which changes:
       - `SITE_URL` and `eas.json`'s production URL and host;
       - `PRODUCTION_LAUNCH_ORIGIN` (ruling 3);
       - `routes: [{ pattern: "app.smog.vlaanderen", custom_domain: true }]` and an explicit `workers_dev` in `env.production`.

       Its checklist:
       - the zone `smog.vlaanderen` is on Cloudflare;
       - the old `A`/`CNAME` for `app.smog.vlaanderen` is deleted in the same window (a Custom Domain cannot attach while it exists);
       - the Turnstile hostnames and the Google/Apple redirect URIs cover both hosts;
       - the passkey RP ID changes, so admin passkeys made on workers.dev stop working (sign in by code, then re-register);
       - Better Auth's trusted origins follow `SITE_URL` automatically;
       - Apple's AASA CDN refreshes after the switch, so universal links lag;
       - **the CORS goes before the deploy (B4):** `wrangler r2 bucket cors set` with **both** origins runs before the domain commit is merged. Otherwise `ensure-cloudflare-resources` fails the deploy on the CORS drift;
       - the commit reaches `master` only through `develop`, so the T-0 window includes two full four-lane CI runs.
   - No check, test or copy assumes either path:
     - `ensure-cloudflare-resources.ts`'s placeholder rule follows the four-label rule;
     - the `we_moved` copy derives from `SITE_URL` (ruling 15).
3. **EAS.**
   - **Versions.** `appVersionSource: "remote"`: `app.config.ts` is dynamic, and EAS cannot write a local `autoIncrement` into it.
     - `ios.buildNumber` and `android.versionCode` leave `app.config.ts`.
     - The owner seeds the remote counters once with `eas build:version:set`: iOS 52, Android 81, the current values (the stores have 51/80).
   - **Profiles.**
     - `development`: dev client, internal distribution, channel `development`, `environment: "development"`.
     - `staging`: internal distribution, channel `staging`, `environment: "preview"`, the staging origin.
     - `production`: store distribution, `autoIncrement`, channel `production`, `environment: "production"`, the origin `PRODUCTION_LAUNCH_ORIGIN`.
   - **Env values.** `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SITE_HOST` and `EXPO_PUBLIC_ENVIRONMENT` stay in `eas.json` `env`: they are public, reviewed in git and checked. The OpenPanel write-only pair goes in **EAS environment variables**, one per EAS environment, with visibility "plain text" (it ships in the binary). It never enters git.
   - **`submit.production`.** iOS: `ascAppId: "6758547774"` and `appleTeamId: "96XKP6MU2A"`. Android: `track: "internal"` and `releaseStatus: "draft"`. The Play key is an EAS-hosted credential. `cli.version >= 24.10.0`.
   - **`PRODUCTION_LAUNCH_ORIGIN`** (`@smog/config/constants`) is the origin the production app is built for. It equals production's `SITE_URL` on path (W). On path (D) the owner may set it earlier, before T-14, for an app review that has the domain working first (the runbook's options below).
   - **`release-config-check` gains `checkEasProfiles`:**
     - development and staging: `EXPO_PUBLIC_API_URL` equals that env's `SITE_URL`, and `EXPO_PUBLIC_SITE_HOST` equals its host;
     - production equals `PRODUCTION_LAUNCH_ORIGIN`, and the check **warns**, not errors, when that differs from production's `SITE_URL`;
     - `app.config.ts`'s fallback host is the staging host;
     - `appVersionSource` is `remote` whenever a profile has `autoIncrement`.
   - **App review timing**, documented for both paths in the runbook:
     - (W): review and release on the workers.dev origin before T-0. A reviewer's demo account is a production user created with `admin:grant --create` or the import, and production must be out of maintenance for the reviewer's IP, so the runbook uses a time-boxed window.
     - (D) has three options:
       - (a) route only the new paths (`app.smog.vlaanderen/api/*` …) to the Worker before cutover; this needs the zone on Cloudflare;
       - (b) switch the domain first and submit after, accepting the broken 2.x window;
       - (c) review on workers.dev and ship a second build on the domain.
4. **Mux environments per deploy env (carries 2, 20, 22).**
   - **Production uses the existing (old) production Mux environment**: every gesture asset is there, so master access and the admin picker need its token. **Staging gets a new environment**; dev keeps the fake.
   - **The env is in the render passthrough:**
     - `renderJobPassthrough(env, jobId)` writes `render-job:<env>:<jobId>`;
     - `renderJobIdOf(passthrough, env)` returns the id only for this env;
     - another env's event, or the untagged phase 7 form, is answered `IGNORED` and touches no asset;
     - an event tagged with this env whose job this env does not know is **not current**, so its asset is deleted (M-3).
   - Why now: no real render upload exists yet (staging is `fake` and production never deployed), so the format can change freely. The tag also keeps the rule safe if two envs ever share one Mux environment.
5. **Static renditions on migrated assets (carry 1).**
   - `@smog/video` gains:
     - `enableStaticRendition(mux, assetId, "highest")`: `POST /video/v1/assets/{id}/static-renditions` with `{ resolution: "highest" }`, which answers 201 with `preparing`;
     - `staticRenditionState(asset) → ready | preparing | absent | errored | legacy-mp4`.
   - `legacy-mp4` is returned **only** when the deprecated `mp4_support` produced a `high.mp4` file. Without that file the state is `absent`. A per-file `errored` or `skipped` status is reported.
   - `mux renditions`:
     - targets the **resolved** gesture assets (ruling 9), not the export's raw `playbackId`s;
     - skips `ready`, `preparing` and `legacy-mp4` (whose `high.mp4` `renditionUrls` already tries);
     - posts for `absent` and `errored`, at most 4 per second, honouring 429 `Retry-After`;
     - keeps a ledger (`renditions-ledger.json`).
   - It is billable (Mux stores one MP4 per asset), so it is **dry-run by default**: without `--apply` it only calls `GET`s and prints the count, the ids and the cost note.
   - `mux scan` also counts the old preview assets (`previewVideoPlaybackId`). They stay in the production Mux environment and nothing will delete them: a billing note for the owner.
6. **`@smog/migrate-convex` is a workspace package, not `scripts/migrate-from-convex` (amends spec §15's path).**
   - It needs its own dependencies and a Workers-pool suite. The root `scripts/` may import only `@smog/config`, `@smog/jobs/cron` and feature `./schema`.
   - **Boundaries:** `@smog/config`, `@smog/utils`, `@smog/db`, `@smog/video`, `@smog/jobs`, `@smog/email` and `@smog/feature:*/schema`. For its integration tests only, also `@smog/feature:*`, `@smog/auth` and `@smog/rpc`.
     - The test-only entries are allowed because nothing depends on the package. A boundaries test asserts no package lists it.
     - **`src/core` is held tighter by its own test.** The runtime scan also asserts its import allow-list: `@smog/config`, `@smog/utils`, `@smog/db`, feature `./schema`, `zod` and `drizzle-orm`. It refuses `@smog/auth`, `@smog/rpc`, `@smog/video`, `@smog/jobs`, `@smog/email` and any feature `./server`.
   - **Commands** (`bun run migrate:convex <command>`); every write is dry by default where it can be:
     - `plan --export <zip|dir> --target <staging|production> --out <dir> [--now <ISO>] [--workos-users <file>] [--mux-map <file>] [--overrides <overlay-overrides.json>] [--report-only]`. It touches nothing remote. `--report-only` is spec §15's `--dry-run`. The target, the input hashes (export, WorkOS file, Mux map, overrides) and `--now` go into `manifest.json`.
     - `apply --env <dev|staging|production> --out <dir> [--dry-run] [--yes] [--reset]` (ruling 14).
     - `mux scan --export … --out …`: read-only.
     - `mux renditions --map … [--apply]` (ruling 5).
     - `we-moved --out … --env production [--apply]` (ruling 15). It replaces spec §15's `--send-we-moved` flag.
7. **Idempotency: deterministic ids and insert-only SQL (amends spec §15's `ON CONFLICT(legacy_id) DO UPDATE`).**
   - Every migrated row's id is `legacyUuid(table, key)`, a UUID v8 from SHA-256 of `smog-convex:<table>:<key>`.
   - Every insert is `INSERT … ON CONFLICT(<key>) DO NOTHING` with the **conflict target always named**:
     - `legacy_id` on `user` / `category` / `gesture` / `sponsorship`;
     - also `email` on `user`;
     - the primary key elsewhere.

     So any other constraint violation fails loudly. No statement updates a column the new system owns; for `user.role` there is never an upsert (I1).
   - **Existing accounts are claimed, not overwritten.**
     - `UPDATE user SET legacy_id = ? WHERE email = ? AND legacy_id IS NULL` never touches `role`, so 0007's trigger does not fire.
     - Child rows find users through `(SELECT id FROM user WHERE legacy_id = ?)`.
     - A differing role is **reported, not changed**.
   - Rationale: the final import runs once, under maintenance on both systems, with Convex frozen. Re-runs exist to finish an interrupted apply or to repeat a rehearsal (`apply --reset`, ruling 14).
8. **Users and auth (U-07, U-12; spec §6, §15).**
   - **Guests are skipped.** A Convex `users` row with no `workosId` is a guest. It is skipped with every row it **owns** (its favorites, its lists and their items, its consents), and counted.
     - A guest's item on a **real** user's shared list is kept, with `added_by` NULL.
     - A row with both `guestId` and `workosId` is a real user.
   - **Email.**
     - The email is trimmed and lower-cased.
     - With `--workos-users <file>` (a WorkOS user export, JSON or CSV: `id,email,first_name,last_name`), **the WorkOS email wins**, because Convex stored the email only at creation. Differences are counted. The name becomes `first last`, trimmed to 80; without one, the name is `""`.
     - A user with no email after that is **dropped and reported** as a warning, with counts of what is lost.
   - **Apple private-relay addresses** (`@privaterelay.appleid.com`) are counted in the report. Mail reaches them only after the owner registers the sending domain with Apple (owner item).
   - **Duplicate emails** merge into the oldest account: favorites become a union, lists move, and the role is admin if either was. Reported.
   - **The row:**
     - `email_verified = 1`; no `account` row;
     - `role` = Convex `role ?? "user"`, set at insert;
     - `locale` NULL, `image` NULL, `banned` 0;
     - `created_at = createdAt`, `updated_at = lastActiveAt`;
     - `legacy_id = _id`;
     - **`welcomed_at = --now`**, so a migrated user is never welcomed.
   - `email_verified` is safe because every way in (an email code, a magic link, a reset, Google or Apple with a verified email) proves control of the address again.
   - SQL inserts run no Better Auth hooks, and that is intended.
   - **At least one admin.** The plan blocks when the import would leave no admin. The preflight checks this again against D1.
9. **The catalogue and learning data.**
   - **Categories.**
     - `slug = slugify(name)`, deduplicated `-2`, `-3` … in `_creationTime, _id` order.
     - `sort_order` = rank by `normalizeText(name)`.
     - `published_at = isActive ? _creationTime : NULL`.
   - **Gestures.**
     - Slugs follow the same rule; `sort_name = gestureSortName(name)`; `description = info` trimmed.
     - `published_at = isActive ? lastUpdated : NULL`; `created_at = _creationTime`; `updated_at = lastUpdated`.
     - `gesture_keyword` comes from `concept`: trimmed, empties dropped, exact duplicates dropped, positions in order.
     - `gesture_category` comes from `categoryIds`; unknown ids are dropped and counted.
   - **Each sponsored gesture's own video is restored (B1).** The old `approve` wrote the sponsored video into `gestures.playbackId`, and expiry restored `originalVideoPlaybackId`. Spec §5.2 says the new model never does that. So for each gesture, read the export's sponsorship rows:
     - if a sponsorship that maps to `live` or `expiring` has `sponsoredVideoPlaybackId === gesture.playbackId`, then `playback_id = originalVideoPlaybackId`;
     - else, if any sponsorship's `sponsoredVideoPlaybackId === gesture.playbackId` (a missed restore), restore `originalVideoPlaybackId` and warn;
     - else, if the gesture's `playbackId` differs from that sponsorship's `originalVideoPlaybackId`, keep it and warn (the admin changed the video during the sponsorship).

     `mux_asset_id` comes from `--mux-map` for the **resolved** playback id; without it, NULL and a warning.
   - **Favorites** are the union of `user_favorites` and each user's `isDefaultFavorites` list items, at the earliest `created_at`. Rows that point at a missing gesture or a skipped user are dropped and counted. An account over `FAVORITE_IDS_MAX` (5000) is warned about.
   - **Lists.**
     - Every non-default list becomes `list` + `list_item`.
     - Positions are renumbered `0..n-1` in the old `position, createdAt, _id` order.
     - `added_by` is mapped, or NULL.
     - Names and descriptions are trimmed to 80 and 280.
   - **Splitting long lists.**
     - A list over `LIST_ITEMS_MAX` (500) is split into consecutive lists `Name`, `Name (2)` …, each of at most 500 items.
     - Each suffixed name truncates its base so that the result stays ≤ 80 characters.
     - It takes the next free suffix when the owner already has a list of that name.
     - An account that then has more than `LISTS_MAX` (100) lists is a **blocker**.
   - **Shares.**
     - Only `visibility = "shared"` lists get shares: `viewShareToken` → `view`, and `editShareToken` → `edit` only when `allowSharedEditing`.
     - Tokens keep their values; `created_by` = the owner.
     - An edit token on a list without shared editing is not migrated, and is counted.
     - A split list's shares stay on part 1.
     - Old `/lists/<convexListId>` bookmarks (an owner's own list, not a token) now answer not found. The report notes this, and so does DECISIONS.
   - **Consents.** Each `user_consents` row becomes:
     - an `analytics` event with `granted = analyticsConsent`;
     - a `marketing` event with `granted = marketingConsent`, when that field is set.

     Both get `policy_version = consentVersion`, `source = "import"` and `created_at = consentDate`. `ipAddress` and `userAgent` are dropped.
   - **Admin logs** become `audit_log` rows with `action = "legacy"` and `data = { legacy: { action, targetType, targetId, metadata } }`.
     - `target_type`: `gesture`, `category`, `sponsorship` and `user` keep theirs; anything else becomes `system` with `target_id` NULL.
     - `target_id` is the mapped new id, or NULL.
     - `actor_id` is the mapped user, or NULL.
     - Rows older than 3 years are dropped and counted.
   - **After the import:** `gesture_fts` is rebuilt for every migrated gesture (`rebuildGesturesFtsSql`, chunks of 200, the last SQL file), and `apply` bumps `catalog:version`.
10. **Sponsorships (spec §5.4, §5.5, §15; R-15).**
    - **Checkouts.** Rows are grouped into checkouts by `molliePaymentId`; a row without one is its own checkout. Per checkout:
      - one `sponsor`: `name = contactFullName`, `email = sponsorEmail`, `company = contactCompany`, `locale = "nl"`.
      - **one `invoice_request` when `invoiceRequested` (B3):**
        - `name = invoiceName ?? contactCompany ?? contactFullName`;
        - `email = invoiceEmail ?? sponsorEmail`;
        - `vat_number = invoiceVatNumber` trimmed.

        **A missing or empty VAT number is a warning, stored as `""`.** The column has no CHECK. The service-level mod-97 rule is not applied to imported rows, and DATA_MODEL says so. A VAT that fails mod-97 is kept and warned about.
      - one `payment` when there is a Mollie id: `kind = "initial"`, `mollie_id`, the summed `amount_cents`, `EUR`.
      - one `payment_item` per row: `amount_cents = paymentAmount`, `includes_logo = hasLogo ?? (paymentAmount === 6000)`. An amount other than 5000 or 6000 is warned about.
    - **Status mapping:**

      | Old | New | Payment | Notes |
      |---|---|---|---|
      | `pending` | `cancelled` | none | the legacy flow before Mollie |
      | `pending_payment` | `awaiting_payment` | `open` | `cancelled` / `canceled` when `updatedAt` is more than 24 h before `--now` |
      | `pending_approval` | `in_review` | `paid` | video = `sponsoredVideoPlaybackId ?? previewVideoPlaybackId`; with neither, `render_failed` |
      | `pending_resubmission` | `changes_requested` | `paid` | |
      | `active` | `live`, or `expiring` when `renewalReminderSentAt` is set | `paid` | |
      | `expired`, `rejected` | the same | `paid` | |
      | `cancelled` | `cancelled` | `canceled` if there is a Mollie id | |

    - `paid_at = createdAt` for rows past payment: minutes before the payment. `reviewedAt` is later, so this errs towards a shorter email window (risk 12).
    - `starts_at` / `ends_at` = `startDate` / `endDate` only for `live`, `expiring` and `expired`.
    - `reminder_sent_at = renewalReminderSentAt`.
    - **`display_name = overlayText` trimmed**, the text in the video. The old public credit used `sponsorName`; DECISIONS says so.
      - **Over 35 characters is a blocker unless overridden.** The text is what the sponsor paid for, so it is never silently truncated or substituted.
      - The owner fills `overlay-overrides.json` (`{ "<sponsorship legacy id>": "<new text, 1..35>" }`, Zod-validated).
      - The `plan` report lists every offender with its legacy id, its current `overlayText` and `sponsorName`, its status and its length. The report is personal data (see the global constraints).
    - `video_playback_id = sponsoredVideoPlaybackId`; `video_asset_id` comes from the Mux map, with a warning when missing.
    - **Logos are not migrated.** `logo_key` is NULL; `includes_logo` keeps the fact. The current old flow baked logos into the preview video. Old `overlayImageStorageId` rows are counted and dropped.
    - **Events:** one `legacy` `sponsorship_event` per sponsorship. `data.legacy` holds:
      - the old `status`, `reviewedAt`, `rejectionReason`;
      - `previewVideoPlaybackId` and `originalVideoPlaybackId`;
      - `sponsorName`, the original `overlayText` (untruncated), `hasLogo`, `durationYears` and `overlayImageStorageId`.

      `actor_id` = the mapped `reviewedBy`.
    - **Tokens:** a `reEditToken` that expires after `--now` becomes a `sponsorship_token`: `reedit`, `hashSponsorshipToken`, the same expiry. Expired ones are counted.
    - **The one-blocking-sponsorship index.** Two blocking sponsorships on one gesture after mapping are a **blocker**, listed. A missing gesture is a blocker. No `render_job` rows are made.
    - **Missing logos on re-render (I12).** A migrated `render_failed` or `in_review` row with `includes_logo = 1` and `logo_key` NULL renders **without the logo**. The render input's `logoKey` is NULL already. The admin detail shows the existing "no logo stored" note. Task 10 pins it.
11. **The CSP report endpoint (carry 17).**
    - `POST /api/csp-report` accepts `application/csp-report` and `application/reports+json` (only `csp-violation` entries).
    - The body is capped at 16 KiB (`readCappedBody`). Too large → 413; a wrong content type → 415. Otherwise 204.
    - It is rate-limited on `RL_ANALYTICS` with the key `csp:<ip>`: **no new binding**. Over the limit it answers 204 without logging.
    - **No Origin check**: browsers' reporting agents send none, or `null`, and these content types need a CORS preflight that the route never grants.
    - It logs one line, `[csp] violation { directive, blocked, document, source, line, disposition }`. URLs are reduced to origin plus path, with **no query and no fragment**: re-edit and renewal URLs carry raw tokens.
    - **No relay to OpenPanel** (spec §12: consented events only).
    - The CSP gets `report-uri /api/csp-report; report-to csp`, and documents get `Reporting-Endpoints: csp="<SITE_URL>/api/csp-report"` in every env. The path is exempt from maintenance.
    - On staging, reports reach the Worker only once Access bypasses `/api/csp-report` (owner item, ruling 19).
12. **Separate Mux environments, the code side.** `isCurrentRenderUpload` (ruling 4) answers `false` for an own-env job it does not know, and the webhook deletes that asset. The Workflow's `ready-<uploadId>` events are unchanged.
13. **The rejected video's retention (carry 4).**
    - Proposed default: `REJECTED_VIDEO_RETENTION_DAYS = 30`. The age runs **from the sponsorship's `rejected` event**.
    - **`requestChanges` from `rejected`** is allowed while the rejection is younger than that; after it, `INVALID_STATE rejectedTooLongAgo` (a reason-map entry and nl/en/fr copy).
      - For a **migrated** row with no `rejected` event, the age comes from the `legacy` event's `data.legacy.reviewedAt`.
      - Without that, the bound does not apply (documented).
    - **The daily purge** (`runRetentionPurge`) deletes the Mux asset of a sponsorship whose **`rejected` event** is older than the bound, through `deleteAsset`, then clears `video_asset_id` and `video_playback_id` in a guarded batch.
      - **A migrated row with no `rejected` event is never purged** (controller ruling): the first night after the import deletes nothing. Its old assets are listed in the runbook as an owner decision.
      - **Capped at 20 assets per run**, with the line `[retention] rejected videos { deleted, failed, remaining }` and an index-backed seek (a query-plan test).
    - The 30 days go to `docs/LEGAL-SIGNOFF.md` as a new open item.
14. **Apply: preflight, order, verification and reset.**
    - **Target guard (B2):**
      - `apply --env staging` refuses a manifest whose target is not `staging`;
      - `apply --env production` refuses one that is not `production`;
      - `apply --env dev` takes either; the fixture is synthetic anyway.
    - **Preflight**, all reads (`wrangler d1 execute --json --command`, `wrangler kv key get maintenance`). It refuses when:
      - the migrations are below 0012;
      - (staging and production) the maintenance key is not `enabled`;
      - an emitted slug is taken by a row of another origin;
      - an emitted share token or Mollie id exists on a foreign row;
      - the import would leave no admin.

      It lists the emails that will be claimed.
    - **Files** run in manifest order: `10-users`, `20-catalog`, `30-learning`, `40-account`, `50-sponsorships`, `90-fts`.
      - Each holds at most 500 statements and 512 KiB, one statement per line, SHA-256 in the manifest. A changed file is refused.
      - Remote `--file` execution is not one transaction, and the database is briefly unavailable while it runs (the hourly cron may fail then; it is fine under maintenance). So each file is idempotent on its own.
    - **Then** the catalog bump and the verification counts → `apply-report.json`.
    - **`--reset` (I6, M21)** runs `reset-imported.sql`, generated from the manifest (not from `out/` state), before applying. It works in RESTRICT order:
      1. `payment_item`;
      2. then `payment` and `sponsorship` (with their events and tokens);
      3. then `sponsor` / `invoice_request`;
      4. then lists, favorites, consents and audit rows;
      5. then `gesture_*` and `category`.

      - Users created by the import are deleted. **Claimed accounts** keep their row with `legacy_id` set to NULL.
      - The SQL never deletes the last admin; it guards in the statement, since `DELETE` does not fire the role trigger.
      - On staging, `--reset --native-catalog` also clears the native catalogue rows whose slugs collide. Production refuses `--reset`.
15. **`we_moved` (E-13).**
    - A new template `transactional/we-moved` in nl/en/fr. Its proposed nl subject is "SMOG is verhuisd". The body:
      - **derives the address from `SITE_URL`**. The "new address" sentence appears **only when the origin differs from the old `https://app.smog.vlaanderen`**, and is dropped on path (D);
      - how to sign in without the old password: an email code, a magic link, Google or Apple, or "Forgot password";
      - that favorites and lists moved;
      - that the app needs an update.

      It is listed in the admin email previews. The owner reviews the copy.
    - **Production only:** `we-moved` refuses any env but `production`, and any manifest whose target is not `production` (B2).
    - **Recipients** are read from D1 at send time: `SELECT id, email, locale FROM user WHERE legacy_id IS NOT NULL`.
    - **The send** goes through the Queues HTTP API to `smog-production-email`:
      - the queue id comes from `GET /accounts/:id/queues` with the same token (`wrangler queues info` has no JSON);
      - every body is parsed by `emailMessageSchema`, with `content_type: "json"` and `idempotencyKey: we_moved:<userId>`;
      - batches hold at most 100 messages **and** 256 KB;
      - a ledger is kept;
      - the token needs Queues: Edit.

      **Dry-run by default.** It is tested against a fake.
16. **Migration 0012 and the welcome claim (carry 6).**
    - `ALTER TABLE user ADD COLUMN welcomed_at integer`, plus the backfill `UPDATE user SET welcomed_at = updated_at WHERE email_verified = 1`. It is `ADD COLUMN` only, so the trigger survives (tested).
    - `welcome()` claims first: `UPDATE user SET welcomed_at = ? WHERE id = ? AND welcomed_at IS NULL RETURNING id`, and enqueues only on a returned row.
      - **If the claim itself throws,** it logs `[auth] Failed to claim the welcome email:` and **skips** the enqueue. A missed welcome is harmless; a duplicate is what the claim prevents.
      - The KV key stays as a second filter.
    - **The column stays server-only:**
      - it is not in `USER_ADDITIONAL_FIELDS`, which clients share;
      - the claim uses Drizzle directly, and Better Auth's adapter ignores a column it does not know.

      If the phase 2 CLI-parity check needs the field, Task 1 proves it and records the reason.
17. **Staging stays green, by construction.**
    - No task changes `env.staging` vars or bindings.
    - Task 2's step is warn-only on staging and catches everything.
    - 0012 is `ADD COLUMN` plus an `UPDATE`.
    - Task 3's change is a header plus a route.
    - Task 4's passthrough affects only real renders.
    - Each task diffs staging's `deploy:dry` `dist/server/wrangler.json` against `develop`'s; they must be identical.
18. **The first production admin (I4).**
    - `bun run admin:grant --env <env> --create <email>` inserts the user when no account has that email:
      - `email_verified = 1`, role `admin`, no credential, name `""`;
      - a new UUID;
      - `welcomed_at` set.

      With an existing account it falls back to today's update. `--dry-run` prints the SQL.
    - `AUTH_SIGN_IN_ROUTES` already holds `POST /api/auth/email-otp/send-verification-otp` and `POST /api/auth/sign-in/email-otp` (checked on 7c5dedf).
      - Task 3 proves the whole path with a test: under maintenance, an admin made by `--create` gets a sign-in code from the sign-in-only server, signs in, and gets the bypass cookie.
      - It adds any route that turns out to be missing.
    - Production email needs the Email Service onboarding (carry 10), so that goes before T-1.
19. **Staging behind Access (I5).** Nothing in code works around Access. The owner list extends the existing Bypass item to cover:
    - `/api/webhooks/*`;
    - `/webhooks/mollie`;
    - `/api/csp-report`;
    - `/.well-known/*`;
    - `/api/*` for staging mobile builds (or at least `/api/rpc/*` and `/api/auth/*`).

    The owner decides how much of staging to open.

## Global constraints

- Everything in the phase 1–7 global constraints still applies:
  - the newest versions and the catalog (Bun stays on 1.3.11; ruling and DECISIONS);
  - tokens-only styling;
  - i18n-only copy in nl/en/fr;
  - the code style (`[serviceName] Failed to …`) and the commit trailer;
  - append-only migrations (0012 is this phase's only one);
  - `inList`, one batch per change with `failWhen` guards, and keyset seeks with query-plan tests;
  - every runtime status change through `transition()` / `transitionStatements()`. The importer writes final states as data. If the `no-direct-status` scan reaches `packages/migrate-convex`, its allow-list gets `src/core/**`, with a DECISIONS note.
- **No deploy, no credentials, no external calls.** No implementer deploys, holds Cloudflare / Mux / EAS / store / WorkOS credentials, runs a remote `wrangler`, or calls real Mux, Mollie, Queues or WorkOS.
  - Every external call goes through an injected runner or `fetch`, tested against fakes: the shared wrangler fake (`src/cli/wrangler.ts`, Task 5; `scripts/` keep `ensure-cloudflare-resources.ts`'s runner), the Mux fake, and a Queues API fake.
  - The furthest a task goes is `deploy:dry` and the local dev D1 (`--local`).
- **Dry-run by default** for every command that writes outside the plan folder: `mux renditions` and `we-moved` need `--apply`. `apply` has `--dry-run`, and production needs `--yes`. Every command prints exactly what it would run.
- **Targets (B2).**
  - A staging plan always pseudonymises:
    - every `user.email`, `sponsor.email` and `invoice_request.email` becomes `<legacyUuid>@staging.invalid`;
    - names become placeholders ("Gebruiker <n>", "Sponsor <n>"; `display_name` "Sponsor <n>");
    - VAT numbers become `""`;
    - `video_asset_id` and `gesture.mux_asset_id` become NULL;
    - `sponsorship_token` rows are dropped.

    It keeps every count identical.
  - `apply` and `we-moved` refuse a production manifest on staging. A staging-target plan holds no fixture address, name, token or asset id; a test proves it.
- **No `Bun.*` in workerd.** `packages/migrate-convex/src/core/**` has no `Bun.*`, `node:*` or `cloudflare:*`, and only the allowed imports (a test). `Bun.*` is allowed in `src/cli/**`, `scripts/*` and tests.
- **Staging's deploy stays green and unchanged** (ruling 17), with the `deploy:dry` diff in each task report.
- **Every task ends with** `bun run check`, then `SMOG_OFFLINE=1 bun run release:check` with **EXIT 0**, reported in the task report.
- **Personal data.**
  - Fixtures use `@example.test` addresses and invented names.
  - The importer never logs an email, a token or a name.
  - The report lists ids and counts, except the overlay offenders. Their text is needed for the overrides, so the report says it is personal data.
  - `out/` is gitignored, and so are the ledgers. The runbook says where the export and `out/` live and when they are deleted.
- **Shared files are conflict-free by assignment** (see Parallelism):
  - `scripts/release-config-check.ts`: Task 2 (wave B), then Task 6 (wave C).
  - `docs/API.md` and `docs/DATA_MODEL.md` (except 0012, which is Task 1's): only Task 11, from the task reports.
  - `docs/LEGAL-SIGNOFF.md`: only Task 4.
  - `docs/PROGRESS.md`: only Task 11.
  - `docs/DECISIONS.md`: each task under its own `## … (phase 8 task N)` heading (Task 1 creates them all).
  - The i18n catalogues: Task 1 creates the blocks; Task 4 fills `sponsor.reedit.rejectedTooLongAgo` and the reason map, Task 9 fills `email.weMoved.*`.
  - `packages/migrate-convex/src/cli/main.ts`: Task 5 (`plan`), Task 9 (`mux`, `we-moved`) and Task 10 (`apply`). These are three different waves.
  - Plan wiring (`src/core/plan.ts`): Task 5 creates it with the read and validate pass. Task 10 wires in the transforms of Tasks 7 and 8, each exported from its own module.
  - `packages/migrate-convex/package.json`: Task 1 declares every dependency of the package, so no later task edits it. knip's entry is `src/cli/main.ts` only.
  - The fixtures:
    - Task 5 creates the layout and a minimal row per table;
    - Task 7 owns `users`, `categories`, `gestures`, `user_favorites`, `gesture_lists`, `gesture_list_items`, `user_consents` and `adminLogs`;
    - Task 8 owns `sponsorships`.
  - `bun.lock`: only Task 1 changes dependencies.
- **Docs per task:** DECISIONS entries for the rulings it implements and any deviation, and the inventory ticks. `docs/deployment.md` and `docs/cutover-runbook.md` are Task 11's.

## Review focus

1. **Staging safety.**
   - Staging's built `wrangler.json` is unchanged.
   - The deploy config check cannot fail staging, whatever wrangler does, unless the owner opted in.
   - Production never gets `--warn-only`.
   - No render flag changes.
   - Staging never receives real personal data, asset ids or tokens through the importer.
2. **Data integrity.**
   - The output is byte-identical for the same inputs and `--now`.
   - A re-run changes nothing, and reset plus re-apply gives the same counts.
   - No statement demotes or promotes an existing account, and the trigger is intact after 0012.
   - Every conflict target is named.
   - Guests' own rows never reach D1.
   - Every blocker stops `apply`.
   - The report's counts equal D1's in the integration test.
   - Sponsored gestures get their own video back (B1).
   - `invoice_request` rows always satisfy NOT NULL (B3).
3. **Migrated data in the real services** (the integration test). Each of these must work:
   - search (the FTS rebuild and the catalog bump);
   - `/gestures/<convexId>`;
   - a sponsored gesture serves the sponsor's video while `live`, and its own after the expiry sweep;
   - old view and edit share tokens;
   - an old re-edit token;
   - favorites and lists;
   - an email-code sign-in that keeps the user's data;
   - a Mollie webhook on a migrated `mollie_id`, including a retried `paid` for a migrated `awaiting_payment`;
   - the expiry and reminder sweeps;
   - approve and Retry render without a stored logo;
   - the rejected-video purge leaves migrated rows alone.
4. **External calls.**
   - Mux renditions and `we_moved` are dry by default, throttled, ledgered and resumable, and `we_moved` is production-only.
   - No signed URL, token, email or name appears in a log.
   - Queues bodies pass `emailMessageSchema` and the 256 KB batch cap.
5. **Mux env separation.** Another env's event, or an untagged one, never deletes an asset. An unknown own-env job's asset is deleted.
6. **CSP endpoint.** No query or fragment reaches a log. It is capped and rate-limited, answers 204, and is exempt from maintenance. The headers are present in every env.
7. **EAS and origins.** Each profile's origin is enforced. Versions are remote. No secret is in `eas.json`. Neither domain path is assumed anywhere.

---

### Task 1: Foundations: dependencies, migration 0012 and the welcome claim, the `@smog/migrate-convex` skeleton

**Files:**
- Root `package.json`: Biome and turbo bumps, `fflate` in the catalog, the script `migrate:convex` (`bun -F @smog/migrate-convex cli`). This task owns the root manifest for the phase; Task 2 adds one `release:check:core` step.
- `packages/auth/package.json`: the better-auth family 1.7.6 → 1.7.7, including `@better-auth/core`.
- `packages/db`:
  - `migrations/0012_user_welcomed_at.sql` (`db:generate`, plus the backfill by hand below the generated `ALTER`);
  - `schema/auth.ts` `welcomedAt` and the snapshot;
  - `test/migration-0012.test.ts`;
  - `docs/DATA_MODEL.md` (0012 only).
- `packages/auth/src/server.ts`: the claim in `welcome()` (ruling 16), server-only. Tests.
- `packages/migrate-convex/`:
  - `package.json`, with **every** dependency the phase needs (ruling 6's list, `fflate`, `zod`, `drizzle-orm`, and the Workers-pool devDependencies);
  - the tsconfigs (the `library` base for `src/core`, a Bun one for `src/cli`);
  - `vitest.config.ts` (the Workers pool, `readD1Migrations`, `WORKERS_POOL_TEST_OPTIONS`);
  - `test/wrangler.jsonc` (`DB`, `KV`);
  - `src/core/index.ts`;
  - `src/cli/main.ts`, a usage printer;
  - `test/core-rules.test.ts`: the runtime scan and the import allow-list for `src/core` (ruling 6);
  - `.gitignore` (`out/`, `*-ledger.json`).
- `packages/config/src/boundaries.ts` (+ test): the package entry and the "nobody lists it" test.
- knip (entry `src/cli/main.ts`), turbo tasks.
- The i18n empty blocks; the DECISIONS headings `## … (phase 8 task 1..11)`.

**Behaviour:**
- 0012 on the dev seed: verified users get `welcomed_at = updated_at`; unverified users stay NULL. The trigger survives.
- Two concurrent verifications send exactly one welcome. An account with `welcomed_at` set is never welcomed. A claim that throws is logged and skips the enqueue.

- [ ] TDD:
  - 0012 and the trigger;
  - the claim under concurrency, plus the existing welcome tests on 1.7.7 (if they fail, keep 1.7.6 with a DECISIONS entry);
  - the boundaries entries;
  - the core rules test.
- [ ] Staging `deploy:dry`: diff `wrangler.json`; it must be identical.
- [ ] `bun run check`, then `SMOG_OFFLINE=1 bun run release:check` EXIT 0. Commit `feat(db): migration 0012 welcomed_at, the welcome claim and the migrate-convex package`.

### Task 2: The deploy config check and production's origin

Depends on Task 1.

**Files:**
- `scripts/check-deploy-config.ts` (+ test), ruling 1.
- `packages/config/src/env/worker.ts` (+ test):
  - `PROVIDER_SECRET_GROUPS` (Google: two keys; Apple: three);
  - `RECOMMENDED_WORKER_CONFIG` (the providers and OpenPanel);
  - production's required list is otherwise unchanged.
- `apps/site/wrangler.jsonc`: production `SITE_URL` → `https://smog-site-production.zias.workers.dev`, and its comment, which drops the stale "phase 8 checks" wording. **`env.staging` is untouched.**
- `scripts/ensure-cloudflare-resources.ts` (+ test): the placeholder rule is now the four-label rule, with **a test that staging's host still passes `--create`**.
- `.github/workflows/deploy.yml`: the `Check deploy config` step **before** `Ensure Cloudflare resources`. It passes `--warn-only` when the env is staging and `vars.SMOG_REQUIRE_SECRETS != '1'`.
- `scripts/release-config-check.ts` (+ test), `checkDeployConfigStep`:
  - the step exists and comes before the ensure and migrations steps;
  - production never gets `--warn-only`;
  - `release:check:core` runs `check-deploy-config.ts --env staging --offline`.
- Root `package.json`: that `release:check:core` step.
- Tests that hard-code the old production placeholder (`packages/auth/test/auth.test.ts`) are updated. `worker-configuration.d.ts` is regenerated (it is gitignored).

**Interfaces:**
- `checkDeployConfig({ env, wrangler, secrets: string[] | null }) → { errors; warnings; recommended }`, a pure function.
- `parseSecretList(stdout)`, tolerant of leading banner lines.
- `explainSecretListFailure(result)`.
- `runCheck(argv, runner, log) → exit code`. All errors become warnings under `--warn-only`.

- [ ] TDD:
  - each refusal by mode: staging `container` adds the Mux trio;
  - the provider pairs: one Google key alone → error; neither → recommended only; two of the three Apple keys → error;
  - empty required vars;
  - the placeholder `SITE_URL` forms;
  - the **exact** D1 and KV placeholders;
  - `--warn-only` with a runner that throws, one that exits 1, and one that prints non-JSON: each gives exit 0 and `::warning::`;
  - production `--warn-only` refused;
  - `--offline`;
  - the worker-not-found and auth messages;
  - the parser on wrangler 4.147.0's real output shape, recorded in DECISIONS;
  - `release-config-check`'s step order and flags.
- [ ] `--env staging --offline` passes. `--env production --offline` fails, listing the empty Turnstile/R2 vars and the D1/KV placeholders (the expected pre-launch state). Paste both outputs into the report.
- [ ] Staging `deploy:dry` diff: identical.
- [ ] `bun run check`, then `SMOG_OFFLINE=1 bun run release:check` EXIT 0. Commit `feat(release): check each env's secrets, vars and origin before deploy`.

### Task 3: Site: the CSP report endpoint, the first production admin, and the analytics body reader

Depends on Task 1.

**Files:**
- `apps/site/src/routes/api/csp-report.ts` and `src/server/csp-report.ts` (the parser and the redaction: pure, tested).
- `src/worker/headers.ts` (+ tests): the report directives and `Reporting-Endpoints`.
- `src/worker/maintenance.ts` (+ tests):
  - the `/api/csp-report` exemption;
  - the `AUTH_SIGN_IN_ROUTES` proof (ruling 18), adding a route only if the test shows it missing.
- `scripts/admin-grant.ts` (+ test): `--create` (ruling 18).
- `apps/site/test/maintenance-admin-signin.test.ts` (Workers pool): an admin row made by `buildGrantSql(…, { create: true })`, with maintenance on:
  1. `send-verification-otp` (type `sign-in`) through the sign-in-only server; the code is read from the memory sender;
  2. `sign-in/email-otp`;
  3. `POST /api/maintenance/bypass`, which returns the cookie;
  4. a page loads with the cookie.
- `packages/analytics/src/server/*`: its capped reader replaced by `readCappedBody`, with behaviour unchanged.
- `apps/site/e2e/csp.spec.ts`:
  - the CSP header holds `report-uri` / `report-to`, and documents carry `Reporting-Endpoints`;
  - a violation triggered by the test raises `securitypolicyviolation` in the page.

  Report delivery itself is not intercepted: browsers batch it in the network service. The endpoint is unit-tested instead.

**Behaviour:** rulings 11 and 18.

- [ ] TDD:
  - the endpoint: both formats, non-CSP entries ignored, 413 / 415, the rate limit, the redaction (`/sponsor/edit?token=abc#x` → `/sponsor/edit`), the 204s;
  - the headers; the exemption;
  - `admin:grant --create`: an insert when the account is missing, the existing-account update, `--dry-run`, and the SQL never demotes;
  - the maintenance sign-in path.
- [ ] The CSP and maintenance e2e pass. Staging `deploy:dry` diff: identical.
- [ ] `bun run check`, then `SMOG_OFFLINE=1 bun run release:check` EXIT 0. Commit `feat(site): CSP report endpoint and the first production admin`.

### Task 4: Mux per env, static renditions, and the rejected video's retention

Depends on Task 1.

**Files:**
- `packages/video/src/uploads.ts`, `render-events.ts` and `webhook-handler.ts` (+ tests): the env-tagged passthroughs (ruling 4), plus the webhook's own capped reader replaced by `readCappedBody`.
- `packages/video/src/static-renditions.ts` (+ test) and `assets.ts`: `enableStaticRendition` and `staticRenditionState` (ruling 5). `muxAssetDataSchema` reads `static_renditions.files[]` and `mp4_support`.
- `src/testing/fake-server.ts`: the endpoint and its state.
- `packages/features/sponsorships/src/server/render.ts` (`isCurrentRenderUpload`) and `render-workflow.ts` (the env in the passthrough); the site's render and webhook wiring passes `ENVIRONMENT`. Tests.
- `packages/features/sponsorships/src/schema/*`:
  - `REJECTED_VIDEO_RETENTION_DAYS`, `REJECTED_VIDEO_PURGE_PER_RUN = 20`;
  - the reason `rejectedTooLongAgo`;
  - the `requestChanges` bound as a `failWhen` guard (ruling 13: the `rejected` event, else the legacy `reviewedAt`, else no bound);
  - in `sweeps.ts`, the purge in `runRetentionPurge`: only rows with a `rejected` event, capped, logged.

  Tests and the query plan.
- The admin request-changes dialog: the new reason (i18n).
- `docs/LEGAL-SIGNOFF.md`: the new open item.

**Behaviour:** rulings 4, 5, 12 and 13.

- [ ] TDD:
  - the passthrough round trip;
  - another env's, an untagged, and an unknown own-env event: IGNORED / IGNORED / deleted;
  - the Workflow's upload carries the env;
  - static renditions: the POST; each state, including `mp4_support` without `high.mp4` → `absent`, and a per-file `errored`; the fake;
  - `requestChanges` at 29 and 31 days after a `rejected` event; a migrated row using `reviewedAt`; a migrated row with neither (allowed);
  - the purge: 31 days → deleted once and ids cleared; 29 days → kept; **a migrated rejected row with only a `legacy` event → never touched**; 25 eligible → 20 deleted, the log says 5 remain; a Mux failure retried the next run;
  - the query plan.
- [ ] `render:local-loop` still reaches `in_review`. Without Chrome, record that and rely on the Workers-pool Workflow tests.
- [ ] `bun run check`, then `SMOG_OFFLINE=1 bun run release:check` EXIT 0. Commit `feat(video): env-tagged render passthroughs, static renditions, rejected video retention`.

### Task 5: Importer foundations: reader, export schemas, ids, pseudonymiser, emitter, report, wrangler runner

Depends on Task 1.

**Files (`packages/migrate-convex`):**
- `src/core/export-schema.ts`: Zod for each of the nine Convex tables of `ref-master/packages/convex/convex/schema.ts`, with `_id` and `_creationTime`.
  - An unknown field is a warning; an unknown table is listed and ignored.
  - A malformed row is a blocker naming its table and `_id`.
- `src/core/ids.ts`: `legacyUuid` (Web Crypto).
- `src/core/target.ts`: `Target`, plus the pseudonymiser helpers Tasks 7 and 8 use: `pseudoEmail`, `pseudoName`, and the asset-id and token strip.
- `src/core/gesture-video.ts`: `resolveGesturePlayback(gesture, sponsorshipRows) → { playbackId, warning? }`, ruling 9's B1 rule. It is the one copy, and Tasks 7 and 9 use it.
- `src/core/inputs.ts`: the schemas of the WorkOS export (JSON/CSV), `mux-map.json` (`playbackId → { assetId, renditions }`) and `overlay-overrides.json` (legacy id → 1..35 characters).
- `src/core/report.ts`: sections per domain (`users`, `catalog`, `learning`, `account`, `sponsorships`, `mux`), blockers first; `report.md` rendered from the JSON.
- `src/core/emit.ts`:
  - the SQL writer: quote doubling, one statement per line, files of at most 500 statements / 512 KiB;
  - `manifest.json`: the target, the input hashes, `--now`, and the file SHA-256s;
  - `reset-imported.sql` generation (ruling 14), from the per-table key lists the transforms return;
  - drizzle `SQLiteSyncDialect` rendering where a statement can be typed.
- `src/core/plan.ts`: read → validate → (transforms: none yet; Task 10 wires them) → report → emit.
- `src/cli/read-export.ts`: a directory, or a ZIP via `fflate` `unzipSync` with a `filter` that skips `_storage/` and `_`-prefixed system tables (it loads the whole ZIP into memory).
- **`src/cli/wrangler.ts`**: the shared runner (`d1 execute --json --command|--file`, `kv key get|put`, with `--local` for dev and `--remote` otherwise), its banner-tolerant JSON parser, and `createFakeWrangler()`.
- `src/cli/main.ts`: `plan`.
- `test/fixtures/export/*`: the layout and one minimal row per table. A fixture ZIP is built in the test.

**Behaviour:** rulings 6 and 7, and the pseudonymiser contract of the global constraints. `plan` on the minimal fixture writes the report and a manifest with no SQL beyond the empty files. The output is deterministic.

- [ ] TDD:
  - the schemas (a row per table, an unknown field, an unknown table, a malformed row);
  - `legacyUuid` is stable and a valid v8;
  - `resolveGesturePlayback`'s three cases and the no-sponsorship case;
  - the inputs' schemas (an override over 35 is refused);
  - the emitter's chunking, quoting and hashes;
  - the reset SQL's order (as text);
  - the ZIP and directory readers agree, and the ZIP skips `_storage/`;
  - the wrangler runner against the fake, including banners;
  - byte-identical runs;
  - the core rules test.
- [ ] `bun run check`, then `SMOG_OFFLINE=1 bun run release:check` EXIT 0. Commit `feat(migrate): export reader, schemas, ids, emitter, report and the wrangler runner`.

### Task 6: Mobile environments: EAS profiles, origins and the store answers

Depends on Task 2 (production's `SITE_URL`).

**Files:**
- `apps/mobile/eas.json` and `app.config.ts` (ruling 3): the fallback host `smog-site-staging.zias.workers.dev`; no `buildNumber` / `versionCode`.
- `packages/config/src/constants.ts`: `PRODUCTION_LAUNCH_ORIGIN = "https://smog-site-production.zias.workers.dev"`.
- `apps/mobile/src/app-config.test.ts`: per `eas.json` profile, with that profile's `env`:
  - `parseMobileEnv` passes;
  - `associatedDomains` and the intent filter use the profile's host;
  - production has no dev tools.

  `src/lib/api.test.ts` and the other tests that pin the old staging host are updated.
- `scripts/release-config-check.ts` (+ test): `checkEasProfiles`.
- `apps/mobile/.env.example`: the EAS environment variables note.
- DECISIONS:
  - the EAS rulings;
  - **the store privacy answers**, item by item, from the privacy text and LEGAL-SIGNOFF P29–P32:
    - account data (email, name, user id); favorites and lists;
    - analytics with consent only (OpenPanel, self-hosted, no tracking);
    - Turnstile in the challenge web view (Cloudflare, security);
    - the Google photo; no data sold; no tracking;
  - `SPONSOR_LINK_IN_APP` stays `true`, with the 3.1.1 fallback written down.

  Task 11 copies these into `docs/deployment.md`.

**Behaviour:** no runtime change except the staging fallback host. Jest's per-profile resolution is the proof; `mobile:release-check` keeps only the production export, unchanged.

- [ ] TDD:
  - the profile matrix;
  - `checkEasProfiles`: a mismatched staging URL or host → error; production ≠ `PRODUCTION_LAUNCH_ORIGIN` → error; `PRODUCTION_LAUNCH_ORIGIN` ≠ `SITE_URL` → warning; a local version source with `autoIncrement` → error; a wrong fallback → error.
- [ ] `bun run check`, then `SMOG_OFFLINE=1 bun run release:check` EXIT 0. Commit `feat(mobile): EAS profiles on the site origins, remote versions, store answers`.

### Task 7: Importer transforms: users, catalogue, learning, consents, audit

Depends on Task 5.

**Files (`packages/migrate-convex`):**
- `src/core/transform/users.ts`, `catalog.ts` (with **B1's gesture video resolution** through Task 5's `resolveGesturePlayback`, over the export's raw sponsorship rows), `learning.ts` and `account.ts`. Each is a pure function, `(export, inputs, target, now) → { rows, statements, resetKeys, report section }`. Each applies the staging pseudonymiser to its own tables.
- The fixtures for `users`, `categories`, `gestures`, `user_favorites`, `gesture_lists`, `gesture_list_items`, `user_consents` and `adminLogs`, covering:
  - a guest with favorites;
  - **a guest's item on a real user's shared editable list**;
  - an upgraded guest;
  - a WorkOS user without an email (with and without the WorkOS file), and a WorkOS email that differs from Convex's;
  - a private-relay address;
  - duplicate emails;
  - two admins;
  - a gesture name collision;
  - gestures without categories, and inactive gestures and categories;
  - **a gesture whose `playbackId` is an active sponsor's video**, one with a missed restore, and one changed during a sponsorship (inline sponsorship rows in this task's tests);
  - a list of 501 items with an **80-character name**, plus an existing `Name (2)`;
  - an account with 100 lists (and 101 after a split → blocker);
  - shared lists with and without editing;
  - a default list that overlaps `user_favorites`;
  - an account over 5000 favorites (generated in the test);
  - consents with and without marketing, with `granted` false;
  - admin logs of each type, one older than 3 years.

**Behaviour:** rulings 7, 8 and 9.

- [ ] TDD (`bun test`):
  - every rule above, row by row;
  - slug stability when a newer export adds gestures;
  - every insert names its conflict target (a regex);
  - no `UPDATE … role` and no `role` in any `ON CONFLICT` clause;
  - the staging target holds no fixture address or name and no asset id;
  - the `resetKeys`;
  - no email or name in stdout.
- [ ] A Workers-pool smoke: this task's statements applied to a fresh D1 with 0000–0012 all succeed, and applying them twice changes no count.
- [ ] `bun run check`, then `SMOG_OFFLINE=1 bun run release:check` EXIT 0. Commit `feat(migrate): users, catalogue, learning, consent and audit transforms`.

### Task 8: Importer transform: sponsorships

Depends on Task 5. It runs in parallel with Task 7: it refers to users and gestures only through `legacyUuid` and the `legacy_id` subqueries.

**Files (`packages/migrate-convex`):**
- `src/core/transform/sponsorships.ts` (ruling 10):
  - checkouts and `invoice_request` (B3); the status table; dates;
  - `display_name`, with `overlay-overrides.json` and the offender list;
  - the `legacy` event's full data (M4);
  - tokens; the blocking-index blocker; the Mux map for `video_asset_id`;
  - the staging pseudonymiser for `sponsor`, `invoice_request`, `display_name`, assets and tokens.
- The `sponsorships` fixtures:
  - every old status;
  - a multi-gesture checkout;
  - a stale `pending_payment`;
  - `pending_approval` with a sponsored video, with only a preview, and with neither;
  - an `active` row (whose gesture holds the sponsored id: B1's fixture for Task 10);
  - `active` with a reminder;
  - an overlay of 36 characters, with and without an override;
  - invoice requests with all fields, without a name or email, and **without a VAT number**;
  - an unexpired and an expired re-edit token;
  - two blocking sponsorships on one gesture;
  - a missing gesture;
  - a `paymentAmount` of 7000;
  - an `overlayImageStorageId` row;
  - a `hasLogo` row in `pending_approval` without a video.

**Behaviour:** ruling 10.

- [ ] TDD:
  - every status row;
  - grouping; the 24-hour rule;
  - the invoice fallbacks and the empty VAT warning;
  - the overlay blocker, the override (valid / too long), and the offender list in the report;
  - the legacy event data;
  - token hashing and expiry;
  - the blockers;
  - the staging target holds no address, name, VAT, token or asset id.
- [ ] `bun run check`, then `SMOG_OFFLINE=1 bun run release:check` EXIT 0. Commit `feat(migrate): sponsorship transform`.

### Task 9: The Mux commands and the `we_moved` email

Depends on Tasks 4 (the `@smog/video` renditions API) and 5 (the reader, the inputs, the manifest, the wrangler runner).

**Files:**
- `packages/migrate-convex/src/cli/mux.ts` (+ test):
  - `mux scan` maps every gesture `playbackId`, `originalVideoPlaybackId`, `sponsoredVideoPlaybackId` and `previewVideoPlaybackId`, and counts the preview assets;
  - `mux renditions` targets the gesture assets resolved by Task 5's `resolveGesturePlayback`.

  `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET` come from the process env, are named when missing, and are never printed. Throttle, `Retry-After`, ledger. Tested against `@smog/video/testing/server`.
- `packages/email/src/templates/transactional/we-moved.tsx`, its sample, the registry and the admin preview list; i18n `email.weMoved.*`. The "new address" sentence depends on whether `SITE_URL`'s origin equals `https://app.smog.vlaanderen`.
- `packages/migrate-convex/src/cli/we-moved.ts` (+ test), ruling 15:
  - production only;
  - the manifest target check;
  - recipients through the wrangler runner;
  - the queue id from the API;
  - batches ≤ 100 and ≤ 256 KB, `content_type: "json"`, the ledger;
  - tested against a Queues API fake.

  The `@smog/jobs` consumer test renders a `we_moved` message.
- `src/cli/main.ts`: the `mux` and `we-moved` block.

**Behaviour:** rulings 5 and 15. Both commands are dry by default.

- [ ] TDD:
  - the scan's map (unknown playback id → null plus a warning);
  - each rendition state, and `--apply` posting only for `absent` / `errored`;
  - 429 handling; the ledger skip;
  - `we-moved`: refused on staging; refused for a staging manifest; the dry run (count, one sample with the address masked); the batches by count and by bytes; the ledger; the refusal without env vars; the body schema;
  - the template in nl/en/fr, with and without the new-address sentence.
- [ ] `bun run check`, then `SMOG_OFFLINE=1 bun run release:check` EXIT 0. Commit `feat(migrate): mux scan and static renditions, and the we_moved email`.

### Task 10: Apply, preflight, reset, and the integration suite

Depends on Tasks 4, 5, 7, 8 and 9.

**Files (`packages/migrate-convex`):**
- `src/core/plan.ts`: the transforms of Tasks 7 and 8 wired in.
- `src/cli/apply.ts` (ruling 14): the target guard, the preflight, the files, the catalog bump, the verification, `--reset` / `--native-catalog`, `--dry-run`, `--yes`.
- `src/cli/main.ts`: `apply`.
- `test/integration/*.test.ts` (Workers pool): plan the fixture in process, then apply every file to D1 with all migrations and the dev seed's admin (the same email as a fixture admin). Then:
  - search and the catalogue (FTS, `bumpCatalogVersion`);
  - `getGesture(<convexId>)`;
  - **B1:** the sponsored gesture serves the sponsor's video while `live`, and its own `playback_id` after the expiry sweep;
  - `lists.shared.get` with old view and edit tokens;
  - favorites `ids`;
  - the re-edit page by the old raw token;
  - the Mollie webhook:
    - a migrated `mollie_id` `paid` → `already`, with no email for a payment more than 6 days old;
    - **a retried `paid` for a migrated `awaiting_payment` settles it** (`rendering`, a render job);
  - the expiry and reminder sweeps;
  - `approve` on a migrated `in_review`;
  - **Retry render on a migrated `render_failed` with `includes_logo` and no logo** renders without one (the fake renderer's input has `logoKey` null);
  - a `changes_requested` row with a paid logo and none stored resubmits;
  - the rejected-video purge leaves migrated rejected rows untouched;
  - an email-code sign-in of a migrated user that keeps their favorites;
  - re-applying changes no count;
  - **`--reset` then a re-apply gives the same counts**; the claimed seed admin survives with its role; an admin always exists;
  - demoting the last admin still fails;
  - an injected native slug collision fails loudly;
  - a staging-target plan applied in full has no fixture address.
- `test/apply.test.ts` (`bun test`):
  - the target guard both ways;
  - each preflight refusal;
  - the manifest hash refusal;
  - the commands per env, `--dry-run`, production without `--yes`, production `--reset` refused.

**Behaviour:** rulings 7, 10 and 14. The local rehearsal:
1. `plan --target staging` on the fixture;
2. `apply --env dev` (after `migrate:dev`);
3. the site shows the migrated gestures, lists and a sponsored gesture (screenshot paths in the report).

- [ ] TDD: the integration list above, and the apply tests.
- [ ] `bun run check`, then `SMOG_OFFLINE=1 bun run release:check` EXIT 0. Commit `feat(migrate): apply with preflight and reset, and the Workers-pool integration suite`.

### Task 11: Hardening, the runbooks and the owner sequence

Depends on Tasks 1–10.

**Files:**
- Fixes in any phase 8 file.
- `docs/API.md` (`/api/csp-report`, the passthrough format, `admin:grant --create`).
- `docs/DATA_MODEL.md` (the migrated-data rules, the empty VAT).
- `docs/deployment.md` (new; spec §14, in the style of `ref-master/docs/RELEASE.md`). It covers:
  - the Cloudflare account and the token permissions (one list, Queues: Edit included);
  - D1/KV creation and ids;
  - the queues and the bucket, with its location or jurisdiction choice;
  - secrets per env (the check's lists, with `wrangler secret put` lines), the provider pairs and the "make social mandatory" decision;
  - `SMOG_REQUIRE_SECRETS`, `SMOG_PROVISION_PRODUCTION` and `SMOG_RENDER_PIPELINE`;
  - the Access bypass list (ruling 19);
  - the Mux environments and webhooks;
  - Turnstile (both hosts on path D);
  - Google and Apple clients and the Apple secret rotation;
  - **Apple private-relay email registration** for `smog.vlaanderen`, with SPF and DKIM;
  - Mollie profiles; Email Service onboarding;
  - the Remotion licence and the container cost;
  - EAS: login, `eas build:version:set`, environments and the OpenPanel variables, credentials, builds per profile, submit;
  - the store privacy answers.
- `docs/cutover-runbook.md` (new):
  - **The domain decision (ruling 2):** paths W and D, the domain diff and its checklist (B4, DNS, passkeys, Turnstile, OAuth redirects, AASA), and the review timing for each path (ruling 3).
  - **The staging rehearsal:** `plan --target staging`, then `apply --env staging --reset`. Nothing real reaches staging, so no separate Mux environment is needed for safety. Spot checks follow.
  - **The timeline:**
    - T-14: a real `plan` (report only) to surface the blockers; overrides filled; store builds per the chosen path.
    - T-7: the rehearsal.
    - T-1: the Email Service live; the production deploy on workers.dev with maintenance on; `admin:grant --create`; the admin sign-in check.
  - **T-0, in order:**
    1. old site maintenance, with **the old `/webhooks/mollie` answering 503 from now on** (I11);
    2. `npx convex export`;
    3. `plan --target production`, review, resolve, re-export if needed;
    4. `mux scan`;
    5. `plan --mux-map --overrides`;
    6. `apply --env production --yes`;
    7. `mux renditions --apply`;
    8. the admin check;
    9. (path D) CORS for both origins, then the domain commit through `develop` → `master`, and the DNS record removed;
    10. the Mux webhook repointed;
    11. the Mollie profile website (after the alias serves);
    12. maintenance off;
    13. `we-moved --apply`;
    14. the stores released.
  - **The rejected-asset decision:** old rejected videos are never purged automatically.
  - **After cutover:**
    - watch `[mollie] legacy webhook path used`, the DLQs and the `[csp]` lines;
    - remove the alias at +30 days;
    - the Apple secret rotation date;
    - the orphan preview assets (billing).
  - **The import window:** D1 is unavailable while the import runs, and the cron may fail then.
  - **Personal data:** where the export and `out/` live, and when they are deleted.
  - **Rollback:** before step 9, keep the old site; after it, revert the domain commit.
- `docs/PROGRESS.md`:
  - log the tasks; close carries 1–27 point by point;
  - **Owner actions in order** (brief);
  - "Pending before develop → master" updated;
  - the phase 9 carries.
- AGENTS.md: `migrate:convex`, `check-deploy-config`, `SMOG_REQUIRE_SECRETS`, `admin:grant --create`, the CSP endpoint.
- The amendments to spec §14 and §15 (rulings 2, 6, 7, 14 and 15; the package path). The inventory ticks.

**Behaviour:**
- **The local end-to-end rehearsal**, from a clean dev D1:
  1. `migrate:dev`;
  2. `admin:grant --env dev --create` on a fixture admin's email (to exercise the claim);
  3. `plan --target staging`;
  4. `apply --env dev`;
  5. `apply --env dev --reset`, which gives the same counts;
  6. `mux scan` and `mux renditions --apply` against the Mux fake;
  7. `we-moved --env dev`, which must be refused (production only).

  The full site e2e then passes on that D1, or on a fresh one with the reason recorded.
- The parity walk for P-40 and E-13. The staging `deploy:dry` diff across the phase (against `7c5dedf`) must be identical.

- [ ] The full site e2e passes, and the branch's CI is green on all four lanes.
- [ ] `bun run check`, then `SMOG_OFFLINE=1 bun run release:check` EXIT 0. Commit `docs: deployment, cutover runbook and the phase 8 owner sequence`.

---

## Parallelism

| Wave | Tasks | Files (disjoint within the wave) |
|---|---|---|
| A | 1 | The root manifest, `packages/auth/package.json`, 0012, `@smog/auth`'s claim, the package skeleton with all its dependencies, the boundaries, the i18n blocks, the DECISIONS headings. |
| B | 2, 3, 4, 5 | **2:** `scripts/{check-deploy-config,ensure-cloudflare-resources,release-config-check}.ts`, `deploy.yml`, `packages/config/src/env/worker.ts`, `env.production` in `wrangler.jsonc`, the root `release:check:core`, `packages/auth/test/auth.test.ts`. **3:** `apps/site/src/{routes/api/csp-report.ts,server/csp-report.ts,worker/headers.ts,worker/maintenance.ts}`, the site maintenance and CSP tests and e2e, `scripts/admin-grant.ts`, `@smog/analytics`' relay. **4:** `@smog/video`, `@smog/sponsorships`, the site's render and Mux-webhook wiring, the admin request-changes dialog, its i18n block, `LEGAL-SIGNOFF.md`. **5:** `packages/migrate-convex/src/{core/{export-schema,ids,target,gesture-video,inputs,report,emit,plan}.ts,cli/{read-export,wrangler,main}.ts}`, the fixture layout. |
| C | 6, 7, 8, 9 | **6:** `apps/mobile/*`, `packages/config/src/constants.ts`, `release-config-check.ts` (Task 2 merged before). **7:** `src/core/transform/{users,catalog,learning,account}.ts` and their fixture tables. **8:** `src/core/transform/sponsorships.ts` and the `sponsorships` fixture. **9:** `src/cli/{mux,we-moved}.ts`, its `main.ts` block, `@smog/email`'s template and registry, its i18n block, the `@smog/jobs` consumer test. |
| D | 10 | `src/core/plan.ts` wiring, `src/cli/apply.ts`, its `main.ts` block, `test/integration/*`. |
| E | 11 | Docs and fixes. |

Eleven tasks. Wave B was the target of 6–9 tasks, and the review split it so that each importer task fits one implementer:
- Task 5: foundations;
- Tasks 7 and 8: the transforms, in parallel;
- Task 10: apply and the integration suite.

## Moved to later phases (or to the owner)

- **Phase 9:**
  - the Playwright CI job and the root `test:e2e`;
  - DLQ and `render_failed` alerting;
  - the staging render latency and cost check;
  - the a11y, perf and docs pass and the parity audit;
  - the re-edit and renewal tokens in the URL fragment;
  - the turbo bypass in `bun -F @smog/site deploy`;
  - a Bun upgrade with the image digests (its own task, with the render lane as proof).
- **Cutover + 30 days:** remove the legacy `/webhooks/mollie` alias after the log check.
- **Owner only.** Task 11 prepares and orders these, and none of them can be done from the session:
  - staging secrets, then `SMOG_REQUIRE_SECRETS=1`;
  - the Access bypass list;
  - production D1/KV ids and secrets, and the maintenance key;
  - the provider decision (Google/Apple mandatory or not);
  - the Mux environments and webhooks;
  - the render flips and the production smoke render;
  - Turnstile, Google/Apple, Apple private-relay registration, the Mollie profile, Email Service onboarding;
  - the domain decision and its DNS steps;
  - the production bucket's location;
  - the Remotion licence and the container cost;
  - EAS (login, versions, environments, credentials, builds, submissions), the store privacy forms, `SPONSOR_LINK_IN_APP`;
  - the legal sign-off (including the 30 days) and the `we_moved` copy;
  - the WorkOS export and the overlay overrides;
  - the rejected-asset decision;
  - the staging rehearsal and the production import;
  - the phase 5–7 staging smoke items and the staging presigned-PUT length check;
  - the optional old-video frame.

## Open risks (for the reviewer and the owner)

1. **The real Convex export** may not match `schema.ts` or the fixture. The reader is strict per row. The first real `plan` at T-14 is the proof.
2. **`wrangler secret list`** on a Worker that does not exist yet. Its output format is pinned by Task 2. The runbook sets secrets before the first production deploy.
3. **Remote D1 `--file`** is not one transaction, and D1 is briefly unavailable while it runs. The files are idempotent; the rehearsal measures the duration.
4. **Old data against new invariants:**
   - two blocking sponsorships on a gesture;
   - overlays over 35 characters (likely many: the old limits were 100 and 40);
   - accounts over 100 lists.

   These are blockers with an owner path: overrides for the overlays, fixes in the old admin for the rest. The T-14 `plan` surfaces them.
5. **Lost data:**
   - WorkOS users with no email lose their data unless the WorkOS export is given;
   - private-relay users get no email until Apple's registration is done.
6. **Static renditions:**
   - their cost and timing are unknown;
   - an asset with legacy `mp4_support` but no `high.mp4` gets a new rendition;
   - old preview assets stay billed.
7. **The Queues HTTP API** for `we_moved` is tested only against a fake. The email is optional (E-13).
8. **The domain decision:**
   - Path W keeps the QR codes and the in-flight Mollie webhooks dependent on the old host forwarding.
   - Path D needs the zone on Cloudflare, two CI runs inside T-0, and resets admin passkeys.
9. **Old 2.x apps** stop working when the old API stops. The review timing per path is in the runbook, and store review time is outside our control.
10. **The Apple client secret expires within 6 months.** It is a dated owner reminder.
11. **better-auth 1.7.7 against the welcome hooks.** If the pinned tests fail, Task 1 keeps 1.7.6.
12. **A sponsor email for a migrated payment paid within 6 days of cutover**, if Mollie calls again. `paid_at = createdAt` keeps that window short, and the integration test pins the older case.
13. **The T-0 Mollie window.** The old server must answer `/webhooks/mollie` with 503 from the export on, or a payment confirmed in between is lost. That is a change on the old server, and the owner makes it.
