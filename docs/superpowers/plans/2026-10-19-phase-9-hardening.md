# Phase 9: Hardening implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the rewrite ready to launch: end-to-end tests that gate every merge, an accessibility and performance pass with automated guards, a parity audit that closes or consciously defers every open row of the feature inventory, the operational carries (alerting, replay, app variants, safer tokens), a security review, and a final documentation pass with the owner's list in its final form.

Phases 0 to 8 are done and deployed to staging (`develop` HEAD `05237bc` locally, `415bdc1` on origin). Phase 9 changes no business rule.

**Nothing in this phase deploys, and the session has no Cloudflare, Mux, Mollie, EAS or store credentials.**
- Every push to `develop` deploys staging, so each merge leaves staging's deploy green. Staging's built `wrangler.json` stays unchanged except in Task 4, which adds two queue consumers and says so (hash baseline in the global constraints).
- Items that need the owner's accounts or a decision stay owner actions (Task 11 writes them in order); they are not tasks.
- **CI is the authority.** `SMOG_OFFLINE=1 bun run release:check` is not equivalent to CI: three expo-doctor checks are degraded offline, `bun run audit` needs the registry, and the render lane needs Docker (CI only). Every task report names the checks it could not run here.

**Architecture (what the phase adds):**
- **E2E as a CI job** (`ci.yml` job `e2e`, a matrix of three shards on their own runners, parallel to the four `release-check` lanes). Deploy's reusable call of `ci.yml` waits for it. Root `bun run test:e2e`.
- **Guards instead of reviews.** Each pass leaves a test that keeps the result: axe on every public route (`a11y-*.spec.ts`), the mobile accessibility assertions, `perf-budget.json` enforced by `deploy-guard`, `EXPLAIN QUERY PLAN` tests for every hot path, the exhaustive authorization table, the rate-limit table, the log-scan test, `routes-parity.spec.ts`, `docs-check.test.ts`.
- **Operations.** `dead_letter` (migration 0013) with consumers on both DLQs, an admin replay screen, a daily digest and a `render_failed` standing count; `apply --reset-only`, `we-moved --resend`; `APP_VARIANT` builds; re-edit and renewal tokens in the URL fragment.

**Tech stack:** as in phase 8. Playwright (`@playwright/test` 1.63.0 and `@axe-core/playwright` 4.13.0 today) is checked against the registry by Task 1 and Task 10. No new runtime dependency is expected; Lighthouse is not added (ruling 4).

**Spec:** §13 (testing strategy: the Playwright row, the visual review), §14 (the `ci.yml` description), §16 (accessibility, motion, tap targets, states), §12 and §7 (rate limits, error model), §2 principle 6 (observability through Workers Logs), phase list entry 9. Amended in Task 11.

**Inventory rows:** the ~50 unticked rows, section 8 and the 1.3 list: Task 9 ticks or defers each one with evidence. Rows that belong to a task's work (U-11 Task 3, P-18 Task 6, P-14 and R-18 Task 9, P-30 Tasks 3 and 5, P-26/P-27 Task 8) are ticked by Task 9 after they land.

**Phase 9 carries from `docs/PROGRESS.md`, point by point** (the task or the reason is in brackets):
1. The Playwright CI job and the root `test:e2e`. **Do now** [1].
2. `we-moved --resend` / the DLQ replay. **Do now** [2 for the ledger side, 4 for the DLQ replay].
3. `APP_VARIANT` for the `development` and `staging` EAS profiles. **Do now** [3]. The Apple bundle ids and Google OAuth clients per variant are owner actions.
4. Sample or cap the `[csp] violation` log lines. **Do now** [8], as a per-isolate token bucket (ruling 6).
5. DLQ and `render_failed` alerting. **Do now** [4] (consumer, digest, dashboard); Cloudflare-side notifications are owner actions [11].
6. The staging render latency and cost check. **Deferred to after the render flip**: it needs the real container on staging (owner step 3). It moves to "Post-launch carries" [11].
7. The a11y, perf and docs pass and the parity audit. **Do now** [5, 3, 6, 9, 11].
8. The re-edit and renewal tokens in the URL fragment. **Do now** [7].
9. The turbo bypass in `bun -F @smog/site deploy`. **Do now** [2].
10. A Bun upgrade with the render image digests. **Deferred to the owner** [10 records the checklist]: the digests need registry access and the render lane needs Docker; neither exists here. Bun stays 1.3.11.
11. Biome 2.5.15 or later. **Try** [10]; keep 2.5.14 if the false positives remain.
12. The importer's reset-only mode and a preflight that accounts for `--reset`. **Do now** [2].
13. The legacy `POST /webhooks/mollie` alias removal. **Deferred to cutover + 30 days** (a normal task, not phase 9).
14. R2 jurisdiction buckets. **Keep unsupported** (ruling 8) [11 records it and the design sketch].
15. From Known gaps: the e2e job placeholder [1]; knip's cosmetic Expo warning (kept, cosmetic).

## Rulings made for this plan

These go into `docs/DECISIONS.md` with the task that implements them.

1. **E2E in CI: its own job, three shards, always on.**
   - A job `e2e` in `ci.yml`, no `if:`, no `needs`, `timeout-minutes: 30`, matrix `shard: [public, a11y, admin, serial]` on `ubuntu-latest`. The shards are **independent Playwright projects** (no `dependencies`), each on its own runner with its own dev server, ports and D1. `serial` runs `catalog` then `maintenance`, which change what every visitor sees; `admin` runs `admin-*.spec.ts` (Task 4's `admin-dead-letters.spec.ts` lands there by name); `a11y` runs `a11y-*.spec.ts` (created empty by Task 1 so Task 5 never edits the config); `public` (the old `chromium` project) runs the rest and is where Tasks 5 (screenshots), 6, 8 and 9 add specs. Re-measure after waves B and C: any shard over 15 minutes on CI is split.
   - It runs in parallel with the release lanes (not after them): the lanes take 15 to 25 minutes, and a failure in either blocks Deploy because `deploy.yml` calls `ci.yml`.
   - Browsers: the sandbox's preinstalled Chromium is older than the Playwright version expects, so CI installs the matching one (`playwright install --with-deps chromium`, cached by version); `playwright.config.ts` keeps launching `/opt/pw-browsers/chromium` only when it exists and no `PLAYWRIGHT_CHROMIUM_PATH` is set.
   - Mollie, Mux and Turnstile stay faked (`@smog/payments/testing`, `@smog/video/testing`, the always-pass keys); `RENDER_MODE=fake`; the e2e never starts Chrome for Remotion or Docker. Rationale: the same fakes the unit tests use, and the render lane already proves the real render.
   - Alternative rejected: a fifth matrix entry in `release-check` (it would run `bun install` and the release script around it, and its 45-minute budget is for the heavier lanes).
2. **Flake policy.** `retries: 0` locally, `retries: 1` in CI with traces on the first retry; a test that passes only on retry is **reported** (job summary, `::warning::`, `scripts/e2e-flaky-report.ts`) and is a bug to fix, not tolerated. Fixed sleeps are banned (a grep test); waits are on a condition. "Reliable" is proven by three consecutive full passes on a fresh D1 at the end of Tasks 1, 5, 6, 7, 8, 9 and 11.
3. **Accessibility bar.** WCAG 2.2 AA. Automated: axe `serious` and `critical` must be zero on every public route and state, light and dark x 390 and 1280 (admin is already covered); keyboard-only runs for the core flows with focus return and visible focus; reflow at 320 px and text spacing; reduced motion. Mobile: RNTL assertions on labels, roles, state, hit areas, live regions, reduce motion; no device automation. What a machine cannot judge (a screen-reader pass, high contrast, dynamic type on a device) is an owner action. Findings are fixed in the kit first (tokens only, i18n only).
4. **Performance bar.** Deterministic and offline, enforced by `deploy-guard` from `perf-budget.json`. **Re-based on measurement:** the client entry's static closure is about **456 kB gzip** today (52 chunks), so "200/300 kB" cannot be a hard ceiling without real splitting. Budgets are the **measured value + 15 % per entry**, measured after Task 6's named lazy splits (the legal page and the QR dialog first; targets 200 kB for the home route and 300 kB for any route, recorded with what blocks them where not reached), with a **ratchet** (the guard hints when a budget is more than 10 % above the measurement; each landed split lowers it). The Worker script has a hard cap of 5 MiB gzip (measured about 1.8 MiB). Remotion and MediaBunny stay lazy (existing `checkClientRenderIsLazy`), no source maps ship. Cache policy by path class (hashed `/assets/*-<hash>.*` immutable; unhashed `/assets/logo.svg` and brand assets a day; `robots`/`sitemap`/manifest an hour; HTML `private, no-cache`; API `no-store`). Every hot D1 path has an `EXPLAIN QUERY PLAN` test with no full scan. The runtime spec asserts only what is valid on `vite dev` (CLS <= 0.1, image and lazy attributes); no request-count, size or tight wall-clock assertions there or in the Workers pool (a generous order-of-magnitude ceiling at most). **Lighthouse is not added** (heavy, network-bound). Real-device and real-network numbers are owner/post-launch.
5. **Dead letters.** Both DLQs get a push consumer on the site Worker that stores each message in D1 `dead_letter` and acks it; the admin replays or discards from a screen; a daily digest email and the dashboard card are the alert. Alternatives rejected: polling the Queues HTTP API from a cron (needs an API token secret on the Worker), Cloudflare-side alerting only (no replay). DECISIONS' earlier statement that a DLQ is "reachable only through an HTTP pull consumer" is amended by Task 4: a DLQ is an ordinary queue and takes one push consumer.
   - **(a) Migration 0013 rebuilds `audit_log`.** Its `action` and `target_type` columns have CHECK constraints and admin writes must write an audit entry, so the new `dead_letter` target type and `dead_letter.replay`/`.discard` actions need a full table rebuild (copy, drop, rename, indexes and any triggers recreated, tested on a seeded table). Avoiding new values is not possible; the rebuild runs against staging D1 in the deploy job before the Worker deploys.
   - **(b) No silent loss when D1 is down.** `max_retries` 20 with a 300 s `retry_delay` and `message.retry({ delaySeconds })` on a D1 error; only the exhausted case logs `[dlq] lost` and increments a KV counter that the digest reports.
   - **(c) Minimisation.** Templates that carry a token or a code (auth emails, renewal and changes-requested links) are stored without a body and are not replayable; the rest keep `to` and `props`. Replay refuses key-less emails. Lists never return bodies. Account deletion removes rows by `to`; retention is 14 days (a new `LEGAL-SIGNOFF` row). The consumers are the reason staging's built config changes in Task 4.
6. **CSP report log sampling.** A per-isolate token bucket (at most 20 `[csp] violation` lines per minute, then one `[csp] suppressed {count}` line) on top of the existing `RL_ANALYTICS` limit. A separate `ratelimits` binding was rejected: it changes the built config for a log-volume concern.
7. **Tokens in the URL fragment.** New links are `/sponsor/edit#token=…` and `/sponsor/renew#token=…`; the page reads the fragment on the client and sends the token in a request body; the pages already read the token on the client and send it in the body, so the work is a hash reader, `replaceState` and the builders. Old `?token=` links (already emailed, migrated, copied by admins) keep working and are moved into the fragment on first render; the legacy 301 emits the fragment. Those first requests still reach the logs: accepted, bounded by expiry and revocation. `Referrer-Policy: no-referrer` on the two routes.
8. **R2 jurisdiction: keep unsupported.** The bucket holds sponsor company logos (a 2 MB image per gesture), not personal data; the personal data is in D1 (which has its own location choice) and Mux. The owner can already pick a `--location` hint. Supporting `--jurisdiction eu` needs an optional `R2_JURISDICTION` var, the presigned endpoint host (`<account>.eu.r2.cloudflarestorage.com`) derived from it in `logo.ts` and in the CSP `connect-src`, `-J` in `ensure-cloudflare-resources.ts` (list, create, CORS) and the check-deploy-config line; it is a small task and its design is recorded in DECISIONS (Task 11) so it can be done on the owner's word. Doing it now would touch `headers.ts` and the env schema for a need nobody has stated.
9. **`APP_VARIANT`.** `development` and `staging` profiles set `APP_VARIANT`; `app.config.ts` derives name, bundle id, package and scheme with a suffix; production and unset are today's identity (pinned by a test). Variants claim no universal links. The staging site's trusted origins accept `smog-staging://` and development's `smog-dev://`; production accepts neither. Owner actions: Apple bundle ids and capabilities, Google OAuth clients per package, EAS credentials per profile.
10. **Importer reset-only and preflight.** `apply --reset-only` runs only the plan's `reset-imported-*.sql` (dev and staging; production refuses it as it refuses `--reset`); with `--reset` the preflight's foreign-row checks exclude the rows the reset deletes, so a rehearsal over an earlier export no longer needs a hand-run reset file.
11. **`we-moved --resend`.** Clears ledger entries for given keys (or the failed ones) and sends again; dry by default, production only, no address in any output. Delivery failures replay through Task 4's admin screen, not through this tool.
12. **The turbo bypass.** `bun -F @smog/site deploy` runs `turbo run build --filter=@smog/site^...` first. Today it is a no-op (workspace packages have no build step); it keeps the deploy correct the day one gets one.
13. **Toolchain.** Biome: try the newest, keep 2.5.14 unless the false positives are gone. Bun: stays 1.3.11 here; the upgrade is an owner checklist (the image digests and the render lane need a registry and Docker). A sweep of the newest-stable rule runs last, alone.
14. **Observability.** No external error reporter (spec principle 6, X-18, and the privacy text names no such processor). One log convention (`[service] event {json}`), one top-level error logger, redaction by test. The alert path is the dead-letter digest and card, `admin_render_failed`, and Cloudflare notifications the owner enables. `observability` in `wrangler.jsonc` is unchanged.
15. **Parity audit disposition.** Every open row gets exactly one of: done (evidence), dropped or changed (DECISIONS entry exists or is added), gap fixed (test), gap deferred (reason, owner or date). No row is ticked without evidence; the audit table lives in DECISIONS.
16. **Security review scope.** Exhaustive authorization table over every oRPC procedure, webhook checks (Mux HMAC and tolerance; Mollie is verified by re-fetching the payment, it has no signature), a rate-limit table with an explicit "none, because" entry per route, header review, a log-scan test for secrets and personal data, and the audit-ignore re-evaluation. Findings are fixed in the task; accepted risks go to DECISIONS.

## Global constraints (phase 9, every task)

Everything in the phase 1-8 global constraints still applies. Restated and adapted:

- **No deploy, no credentials, no external calls.**
  - No implementer deploys, holds Cloudflare / Mux / Mollie / EAS / store / WorkOS credentials, runs a `wrangler` against a remote, or calls a real Cloudflare, Mux or Mollie API.
  - Every external call goes through an injected runner or `fetch` and is tested against the fakes (`@smog/video/testing`, `@smog/payments/testing`, `MemoryEmailSender`, the wrangler fake of `@smog/migrate-convex`).
  - The furthest a task goes is `deploy:dry` and the local dev D1 (`--local`).
- **Git.** Work on the task branch in your worktree and commit there (end the message with the attribution lines the session gives; the trailer is the same as in earlier phases). **Never touch `master`, never open a PR, never push**: only the controller pushes and merges. `develop` is only changed by the controller's merges.
- **Staging's built `wrangler.json` stays unchanged** (the `deploy:dry` diff goes in every task report).
  - Baseline: sha256 `25dcbfed502d449a23c7dbf326f4c9700a2e893d9004ea65dee031abfdd51e50` of `apps/site/dist/server/wrangler.json` with the keys `configPath` and `userConfigPath` dropped, serialised with sorted keys (the same procedure as phase 8).
  - **The one exception is Task 4** (the two DLQ consumers; the first staging deploy attaches them, so a message already in a staging DLQ is consumed at once). It reports the new hash and the exact diff; after its merge the controller records the new hash as the baseline for the remaining tasks. No other task may change a binding, a var, a queue, a cron or a route of the built config. A task that believes it needs to stops and asks.
- **Migrations are append-only.** The next free number is **0013, owned by Task 4**. Task 6 may add **0014** (indexes only). **0013 rebuilds `audit_log`** (its CHECK constraints), see Task 4. Never edit an existing migration; `bun -F @smog/db db:generate`, then check the snapshot.
- **Every test command is wrapped** by `bun <root>/scripts/test-deadline.ts -- <command>` (a new `test*` script too, including `test:e2e`). The Workers-pool Vitest configs spread `WORKERS_POOL_TEST_OPTIONS` from `@smog/config/testing/vitest`.
- **Newest stable versions**, through the root `workspaces.catalog` (`"catalog:"`; Task 1 moves the Playwright packages there). A deviation needs a DECISIONS entry (`[dep]` prefix for an addition). Check the registry at install; Bun stays on 1.3.11 and Biome on 2.5.14 until Task 10 decides.
- **No `Bun.*` in Worker code** (`apps/site/src`, feature `./server`, `@smog/jobs`, `@smog/db`, `@smog/migrate-convex/src/core`). `Bun.*` is for scripts, tests, the render container and the CLI.
- **Boundaries.** A new dependency edge goes into `@smog/config/boundaries` first; `bun run boundaries` must pass.
- **Code style.** Biome (Ultracite); `[serviceName] Failed to ...` logs, rethrow; tokens-only styling; every user-facing string through i18n (nl, en, fr, with the key-parity test); `type` imports; explicit parameter and return types; `noUncheckedIndexedAccess`.
- **Personal data.** Fixtures use `@example.test` and invented names. Nothing logs an email, a token, a code, a signed URL or a secret.
- **Conventions for the shared files.** Merge order inside a wave is task-number order (1, 2, 3, 4). **`docs/DECISIONS.md`:** each task appends its own `## ... (phase 9 task N)` section as the **last** block, never edits another task's. **i18n catalogues** (`packages/i18n/src/locales/{nl,en,fr}.json`): each task adds its keys under its own distinct top-level key block; the controller resolves textual merge conflicts (mechanical). **`docs/API.md`, `docs/DATA_MODEL.md`:** a task edits only the section named in its brief. **`packages/config/src/boundaries.ts`:** no change is expected by any task; if one is needed, ask. **`apps/site/src/components/**`:** Task 6 touches only the lazy-boundary files named in its brief, Task 5 everything else except Task 7's and the admin screens. **Committed generated files** (`routeTree.gen.ts`, drizzle snapshots) are regenerated by the task that adds the route or migration; the controller resolves merges.
- **Shared files are conflict-free by assignment** (see the plan's Parallelism table). If a task needs a file another task of its wave owns, it stops and asks the controller instead of editing it. The i18n catalogues (`packages/i18n`) are shared by tasks of one wave in **distinct key blocks**; the controller resolves textual merge conflicts.
- **Docs per task.** A DECISIONS entry per ruling it implements and per deviation, under its own heading `## ... (phase 9 task N)`; inventory ticks only in Task 9 (the parity audit) except where the task says so; `docs/PROGRESS.md`, `README.md`, `docs/deployment.md` and `docs/cutover-runbook.md` are Task 11's (earlier tasks put the facts in their report, and in DECISIONS).
- **Every task ends with** `bun run check`, `bun run check-types`, the task's own tests, and then `SMOG_OFFLINE=1 bun run release:check` with **EXIT 0**, all in the task report.
  - **Online vs offline.** `SMOG_OFFLINE=1` degrades three expo-doctor checks (the config schema fetch, the SDK dependency-version pins that need api.expo.dev, the React Native Directory check) and the result is **not equivalent to CI**. `bun run audit` is also network-bound: a new advisory can fail CI while the offline run is green. CI (four release-check lanes plus, from Task 1, the e2e job) is the authority; report any check you could not run here.
- **The e2e rules** (from Task 1 on): no `waitForTimeout` sleeps, no retry loops that hide a race, no test that depends on another test's data except through the documented projects, every fixture row cleaned up in `finally`/`afterEach`. A test you touch and find flaky is fixed, not skipped.
- **Report** (the task report file): what changed, the commands run with their exit codes, the `deploy:dry` hash and diff, deviations with their DECISIONS lines, anything deferred with its reason.

## Review focus (every task reviewer)

1. Staging safety: the built config hash, no real calls, no secret in a log or a fixture.
2. Determinism: no flaky test added, timings bounded, cleanup in `finally`.
3. The task's acceptance list, point by point, and its carries.
4. File ownership: nothing edited outside the task's files without a reason in the report.
5. Docs and DECISIONS entries exist and say why, not only what.

---

## Tasks

### Task 1: Playwright e2e as a real CI job and the root `test:e2e`

Wave A. Rulings 1 and 2.

**Files (owned):**
- `.github/workflows/ci.yml` (the `e2e` job), root `package.json` (`test:e2e`), `turbo.json` (a `test:e2e` task, `cache: false`), the root catalog entries for Playwright (below).
- `apps/site/playwright.config.ts`, `apps/site/e2e/global-setup.ts`, `apps/site/e2e/helpers.ts`, and the existing specs **only** to fix flakes, replace sleeps or to match projects (no new feature coverage).
- `apps/site/package.json`: **only** the `test:e2e` line (wrapped with `scripts/test-deadline.ts`; the root script calls it). Task 2 owns the `deploy*` lines of the same file and does not touch `test:e2e`.
- `scripts/release-config-check.ts` (+ test): **the CI-workflow check only** (the `e2e` job, no `E2E_ENABLED`, the shard names, the root script). **Do not touch `checkQueues`, `CONSUMER_SETTINGS` or `QUEUE_BINDINGS`: Task 4 owns them** (two wave-A tasks edit one file in different functions; the controller merges Task 1 first).
- `scripts/e2e-flaky-report.ts` (+ test), `AGENTS.md` (the commands block and the CI paragraph).

**Behaviour:**
- The `e2e` job in `ci.yml` is **always on** (the `vars.E2E_ENABLED` placeholder and its `needs: release-check` are gone). It runs **in parallel** with the four `release-check` lanes as a matrix of shards. Deploy's reusable call of `ci.yml` waits for it with no change to `deploy.yml`.
- **Projects and shards** (ruling 1). Today there are `chromium` (everything but two specs), `catalog` (depends on `chromium`) and `maintenance` (depends on `catalog`). Replace them with **independent projects, no `dependencies`**, so a shard runs one project on its own runner: `public` (the old `chromium`: every spec not matched below, including later `perf`/`routes-parity` specs), `a11y` (`a11y-*.spec.ts`, **created now, empty until Task 5**, so Task 5 never edits the config), `admin` (`admin-*.spec.ts` except the two serial specs; Task 4's `admin-dead-letters.spec.ts` lands here by name), `serial` (`catalog` then `maintenance`, in that order, on one worker). `bun run test:e2e` locally runs the projects one after another in that order (`catalog` before `maintenance`), each as its own wrapped command; `bun run test:e2e -- --project admin` runs one. Task 5 and the briefs refer to the `public` and `a11y` projects, not `chromium`.
- Steps per shard: checkout, Bun (from `package.json`), Node 22, `bun install --frozen-lockfile`, copy `apps/site/.dev.vars.example` to `.dev.vars`, install **the Chromium this Playwright version expects** (`bunx playwright install --with-deps chromium`, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` unset for this step, `~/.cache/ms-playwright` cached by the Playwright version), `migrate:dev` + `seed:dev`, then `bun run test:e2e -- --project <shard>`. Upload `test-results/` and the JSON report on failure. `timeout-minutes: 30`. The shards use the deadline wrapper and the job timeout only; no reliance on the Vitest stall reporter (DECISIONS "CI test hang").
- **Deadline:** the wrapper's 25 minutes applies per command; the root script wraps **each project's command separately** (or sets `SMOG_TEST_DEADLINE_MINUTES` for the all-in-one run), so a local all-projects run does not trip it.
- **Workers:** CI `E2E_WORKERS=2` on 4-core runners if the measurement shows it is stable, else 1; record what was measured.
- **Playwright through the catalog:** `@playwright/test` and `@axe-core/playwright` move into the root `workspaces.catalog` (`"catalog:"` in `apps/site`), at the newest stable, or a DECISIONS line says why they stay pinned.
- **Flake policy** (ruling 2): `retries: 1` in CI with traces on first retry, `0` locally; a flaky pass is written to the job summary and raises `::warning::` through `e2e-flaky-report.ts` (reads the JSON reporter). `reuseExistingServer` stays `false` in CI; a port in use fails loudly.
- **Sleeps:** `waitForTimeout(` appears **six times** today (`sponsor.spec.ts:682`, `analytics.spec.ts:107`, `admin-sponsorships-a11y.spec.ts:175`, `admin-screenshots.spec.ts:40,46`, `account.spec.ts:299`). Replace each with a condition (some are deliberate "no request was sent" waits: use `page.waitForRequest` with a bounded negative assertion on a counter after a settled signal, or `expect.poll`) and add a guard test that keeps `waitForTimeout(` out of `apps/site/e2e`. These specs belong to Tasks 5/7 later; Task 1 lands first.
- `release-config-check` asserts: the `e2e` job exists and has no `if:`, the shard names match projects, `test:e2e` exists at the root, no `E2E_ENABLED` remains.
- **Measure and record** (report and DECISIONS): wall time per shard with `CI=1` here, the expected CI time (x1.5), the slowest 10 tests, the list of the 6 skips with their reasons (today: the screenshot specs gated by `ADMIN_SHOTS_DIR`/`SPONSOR_SHOTS_DIR`, and two in `csp.spec.ts`). Any shard over 15 minutes locally is split further.

**Acceptance:**
- [ ] The full suite passes **three times in a row** on a fresh D1 with `CI=1` (130 pass / 6 skipped or the new counts, each skip justified).
- [ ] `bun run test:e2e` works from the root, and `-- --project admin` too.
- [ ] `release:check` is green; the workflow YAML parses (checked by the release-config-check test).
- [ ] Zero `waitForTimeout(`; the guard test exists.
- [ ] The staging `deploy:dry` hash is unchanged.

**Carries:** the Playwright job and root script (PROGRESS Phase 9 carries 1); the `E2E_ENABLED` placeholder.
**Not in this task:** new coverage (Task 5, 6, 9), `checkQueues` (Task 4).


### Task 2: Tooling carries: importer reset-only, `we-moved --resend`, the turbo deploy path

Wave A. Rulings 10, 11, 12.

**Files (owned):**
- `packages/migrate-convex/src/cli/{apply,we-moved,main}.ts`, `src/core/{plan,preflight}` as needed, `test/**`, `docs/DATA_MODEL.md` ("Migrated data", only the reset paragraph).
- `apps/site/package.json`: the `deploy` and `deploy:dry*` lines only (Task 1 owns the `test:e2e` line), `apps/site/scripts/deploy-guard.ts` only if the deploy path needs it.
- `scripts/maintenance.ts`/`retention.ts` are **not** touched.

**Behaviour:**
1. **`apply --reset-only`** (ruling 10): `apply --env <dev|staging> --out <plan dir> --reset-only [--dry-run]` runs the plan's own `reset-imported-*.sql` and nothing else, after the manifest check and the target guard, **without** the preflight's "no foreign row" checks (they would fail on the very rows being removed) but with its connectivity and "migrations >= 0012" checks. Production refuses it (and `--reset`), as today. Prints the counts it removed; a second run removes 0.
2. **Preflight accounts for `--reset`**: the reset file deletes **by that plan's own keys** (`emit.ts` `resetStatements(keys)`), so with `--reset` the foreign-row checks (slug, share token, Mollie id, address) ignore only the rows **this plan's reset will delete**. A row from any other source, **including another export's import, still blocks** (wiping another export needs that export's own plan folder, as the runbook says). Tested in the Workers-pool integration suite with two fixtures: A's rows are ignored for A's `--reset`, and still block B.
3. **`we-moved --resend`** (ruling 11): `we-moved --env production --out <dir> --resend <ids-file | --failed> [--apply]`. The ledger records *queued*, not *delivered*. `--resend` clears the ledger entries for the given ledger keys (or, with `--failed`, for keys whose Queues API call failed or was never made) and sends them again through the same path. Dry by default; never prints an address; production only; never resends an entry whose consumer `email:sent` marker exists (the consumer is idempotent, so a duplicate is harmless, but the tool says what it skipped). Delivery failures that reach the email DLQ are replayed with Task 4's admin replay, not by this tool: document that split in the command's help.
4. **The turbo bypass** (ruling 12): `bun -F @smog/site deploy` runs `turbo run build --filter=@smog/site^...` first (workspace packages have no build step today, so it is a no-op that keeps working when one appears), then the existing `vite build && deploy-guard && wrangler deploy`. Read the installed turbo's bundled docs first (AGENTS.md: "This is NOT the Turborepo you know"). A test proves the order and that `--filter=@smog/site^...` with no matching task exits 0. Turbo's strict env mode will not pass `CLOUDFLARE_ENV` to the build task (a no-op today); `deploy`'s own steps keep using the shell env. `deploy:dry` calls `bun run deploy`, so every `release:check:core` now starts turbo from `apps/site`: run `deploy:dry` once and compare the hash before claiming it unchanged.

**Acceptance:**
- [ ] On a clean dev D1: `apply --env dev --out A`, then `apply --env dev --reset-only --out A` (the counts match the plan, a second run removes 0), then `apply --env dev --out B` (a different fixture) works. With A still applied, B's preflight still refuses (another export's rows block).
- [ ] Production refuses `--reset-only`; a staging plan on production is still refused.
- [ ] `we-moved` tests cover `--resend` with the Queues fake: partial failure, resend, no duplicate keys, no address in any output.
- [ ] `deploy:dry` still passes and its hash is unchanged; `bun run build` is unchanged.
- [ ] `docs/cutover-runbook.md` is **not** edited here (Task 11 folds the new commands in); the command help text and DECISIONS carry the facts.

**Carries:** the importer's reset-only mode (Known gaps), the `we-moved --resend` tool, the turbo bypass (carry 25 of phase 8).


### Task 3: Mobile: `APP_VARIANT`, the accessibility pass and the sign-out confirmation

Wave A. Rulings 3 (mobile part) and 9.

**Files (owned):**
- `apps/mobile/**` (`app.config.ts`, `eas.json`, `src/**`, tests), `packages/ui-native/**`.
- `packages/auth/src/server.ts` (trusted origins, ~line 167) **only**; the scheme call sites: `apps/site/src/lib/open-in-app.ts` (+ test; or state in DECISIONS that variants deliberately keep "Open in app" on `smog://` only), `flow-actions.ts`, `packages/features/account/src/client/use-sign-in-methods.ts`, `apps/mobile/src/account/profile-methods.tsx`, and the Turnstile bridge's allowed schemes if any (grep `smog://`, `smog-`, `scheme`). No other `@smog/auth` change.
- `scripts/mobile-release-check.ts` (+ test). **Not** `scripts/release-config-check.ts` (Task 1's file in this wave): put the variant cross-checks in `apps/mobile` tests and `mobile-release-check.ts`. DECISIONS "Mobile builds share one identity" says the variant work needs a `release-config-check` rule: **record this deviation** (the rule lives in `mobile-release-check` and app-config tests to avoid the wave-A file collision; move it later if wanted).
- `packages/i18n` keys: `a11y.*` additions and the sign-out confirmation, in their own block.

**Behaviour:**
1. **`APP_VARIANT`** (ruling 9, DECISIONS "Mobile builds share one identity"): `development` and `staging` EAS profiles set `APP_VARIANT`; `app.config.ts` derives, per variant, the name (`SMOG Dev`, `SMOG Staging`), `ios.bundleIdentifier`, `android.package` and `scheme` (suffix `.dev`/`.staging`, scheme `smog-dev`/`smog-staging`); `production` and an unset variant are byte-for-byte today's identity (a test pins the production config). Universal-link files (AASA, assetlinks) and the associated domains stay production-only; the staging and development variants do not claim the site's universal links. Deep-link handling (`native-intent`) accepts the variant's own scheme. Better Auth trusted origins (staging site) include `smog-staging://`, development `smog-dev://`, and **production does not** accept either (a test per env).
2. **Mobile accessibility pass** (ruling 3), automated where it can be: RNTL tests (in `ui-native` and `apps/mobile`) asserting, for every kit component and every screen in `apps/mobile/src/screens.test.tsx`: an `accessibilityLabel` (i18n `a11y.*`) and `accessibilityRole` on every `Pressable`/icon button, `accessibilityState` for selected/disabled/busy, `accessibilityLiveRegion`/announcements for toasts and search result counts, a minimum 44 x 44 hit area (`hitSlop` counts), modal focus (`accessibilityViewIsModal`) on sheets and dialogs, reduce-motion honoured (`AccessibilityInfo.isReduceMotionEnabled` mocked both ways), dynamic type not clipped (a layout does not use fixed heights on text containers: a lint-style test over the kit), and colour pairs already covered by `@smog/styles`. Fix every gap the tests find. A real VoiceOver/TalkBack pass is an **owner action** (listed in Task 11), not done here.
3. **U-11** (inventory): `settings/account` asks for confirmation before signing out (Alert with Cancel and Sign out, nl/en/fr), then signs out and navigates to the welcome screen, clearing the analytics identity as today. Tests for both buttons.

**Acceptance:**
- [ ] `bun -F @smog/mobile test`, `bun -F @smog/ui-native test` pass; the production `app.config.ts` snapshot equals the pre-task one.
- [ ] A test resolves `app.config.ts` under each of the three variants and checks name, ids, scheme and that `eas.json` profiles set the matching `APP_VARIANT`.
- [ ] `bun run mobile:release-check` (online; offline is not equivalent, report which doctor checks were degraded) and both `expo export` runs pass.
- [ ] The staging `deploy:dry` hash is unchanged (the trusted-origins list is runtime code, not config).
- [ ] The report lists the owner actions the variants create: the Apple bundle ids and capabilities per variant (Sign in with Apple, Associated Domains), **the staging site's `APPLE_APP_BUNDLE_IDENTIFIER` secret changed or extended so the Sign in with Apple audience matches the variant's bundle id** (`check-deploy-config` knows the Apple trio), Google OAuth clients per Android package, the EAS credentials per profile.

**Carries:** `APP_VARIANT` (Phase 9 carries 3), the mobile half of the a11y pass, U-11, P-30 (mobile part), P-25 (reduce motion).


### Task 4: Dead letters, replay and alerting

Wave A. Rulings 5 and 14. **The only task that may change staging's built config.** The largest task: do it as two commits (storage, consumers, migration, retention; then admin API, screen, digest).

**Files (owned; verified paths):**
- `packages/db`: migration **0013** (below), `src/schema/{account,enums}.ts` (`AUDIT_ACTIONS`, `AUDIT_TARGET_TYPES`), new `src/schema/dead-letter.ts`, `src/retention.ts` (`RetentionTable`), snapshot, `docs/DATA_MODEL.md` (0013 only).
- `packages/jobs` (`src/messages.ts` read; the DLQ handlers, `queueKind`, types), `apps/site/src/worker/queues.ts` (dispatch: `queueKind()` returns `null` for `*-dlq` today and the unknown-queue default acks and warns; add the DLQ branch **before** it; update the comment "a DLQ has no consumer" and its tests, which pin the old behaviour), `apps/site/src/worker/scheduled.ts`, `apps/site/src/worker.ts` only for wiring.
- `packages/features/admin` (procedures, `src/schema/audit.ts`, client hooks) and `packages/migrate-convex/src/core/transform/account.ts` (it imports the audit enums: update only what the new enum values require).
- `packages/features/sponsorships/src/server/sweeps.ts` (+ tests): `runRetentionPurge` initialises `Record<RetentionTable, number>`, so adding a table breaks it; and the render-failed count query (admin cannot import another feature's `./server`: the count comes through the sponsorships package's own admin procedure, which you may extend).
- `scripts/retention.ts` (+ test; the dry-run counts mirror the purges), `apps/site/test/scheduled.test.ts`.
- `packages/api/src/{contract,router,admin-deps}.ts` and `packages/api/test/authz.test.ts` (mount `admin.deadLetters.*`; the three procedures go in the authz table).
- Site: new `routes/admin/dead-letters*.tsx`, `routes/admin/index.tsx` (the dashboard card; stats live in `components/admin/sponsorships/dashboard-stats`), `components/admin/admin-rail.tsx` (nav entry), the committed `routeTree.gen.ts` (regenerated), `routes/dev/e2e-seed.ts`, `server/e2e-seed-handler.ts` and `e2e-seed.test.ts` (a dead-letter seed operation), `packages/email` (one admin digest template, registry, `samples.ts`).
- `apps/site/wrangler.jsonc` (the DLQ consumers per env, and the doc comment lines ~31-35 that say "no consumer: checked by hand"), **`scripts/release-config-check.ts` `checkQueues`/`CONSUMER_SETTINGS`/`QUEUE_BINDINGS` + `release-config-check.test.ts`**: today it requires a consumer for exactly `email` and `sponsorship-events` and fails with `unexpected consumer …` for any other, so without this edit `release:check:core` fails in this task's own branch. Task 1 edits the same file in a different function.
- `packages/i18n` blocks `admin.deadLetters.*` and `email.adminDeadLetter.*`; `docs/LEGAL-SIGNOFF.md` (one new open decision); `docs/API.md` (admin dead letters only); `docs/DECISIONS.md`. No boundary change is expected (feature -> `@smog/jobs`/`@smog/email` is allowed); if one is needed, ask.
- The new e2e spec is **`apps/site/e2e/admin-dead-letters.spec.ts`** so Task 1's `admin` project picks it up by name.

**Behaviour (ruling 5):**
1. **Migration 0013 rebuilds `audit_log`** (ruling 5a). `audit_log` has `CHECK` constraints on `action` and `target_type` (`audit_log_action_check`, from `AUDIT_ACTIONS`/`AUDIT_TARGET_TYPES`); SQLite cannot alter a CHECK, and admin writes must write an audit entry (the admin guard counts the inserts), so avoiding new values is not an option. The migration creates `dead_letter` and rebuilds `audit_log` (create new, copy, drop, rename, recreate its five indexes **and every trigger on it**: check `0007` and later for triggers; table rebuilds drop them, phase 8 carry 16b). A Workers-pool test seeds an `audit_log` (including `legacy` rows with `data` and NULL `actor_id`), applies 0013 and compares rows and indexes; the drizzle snapshot is checked. Risk note: the deploy job runs it against staging D1 before the Worker deploys; the table holds up to three years of rows, so the report states the row count the test used and the expected duration.
2. **Consumers** on both DLQs (`smog-<env>-email-dlq`, `smog-<env>-sponsorship-events-dlq`), the site Worker. **No silent loss while D1 is down** (ruling 5b): the consumers get `max_retries` 20 and `retry_delay` 300 s; a D1 error calls `message.retry({ delaySeconds })`; only the exhausted case logs `[dlq] lost {queue,type,id}` (no body), and a KV counter `dlq-lost:<date>` feeds the digest so a loss is visible. Each message goes to D1 `dead_letter` (id = the queue message id, `ON CONFLICT DO NOTHING`; `queue`, `origin_queue`, `type`, `attempts`, `received_at`, `body`, `replayable`, `replayed_at`, `discarded_at`, `error`) and is acked.
3. **Stored bodies (ruling 5c).** `EmailMessage` holds `to` and free `props`. Several templates carry **raw sponsorship tokens in links** (`renewal-reminder`, changes-requested, via `lifecycle.ts` and `sweeps.ts` URL builders), and the auth emails carry codes and reset/magic links. Store **no body** and `replayable = 0` for every email template that carries a token or code (a maintained list in `@smog/email`, with a test that fails when a template that takes a `url`/`token`/`code` prop is not classified); the others are stored with `to` and `props` as is. **Replay refuses** a message without an `idempotencyKey` (the key is optional in `emailMessageSchema`; a duplicate send is not accepted) and one already replayed. The admin **list and detail never return a body** (type, queue, counts, ages, error text only). **Erasure:** account deletion removes `dead_letter` rows whose body's `to` is the deleted address (`account.delete`), and the DSAR export does not include them (stated in LEGAL-SIGNOFF); rows older than 14 days are purged by the daily retention (`RetentionTable` + `runRetentionPurge` + `scripts/retention.ts` dry run).
4. **Admin API** (admin role, audited with new action values `dead_letter.replay`/`dead_letter.discard` and target type `dead_letter`, in the same batch as the write): `admin.deadLetters.list` (keyset page, filters), `replay {id}` (re-enqueues the stored body on the origin queue, sets `replayed_at`), `discard {id}`. A test replays twice and proves one effect (idempotency key plus `replayed_at`).
5. **Screen and card:** the dashboard card (unreplayed per queue, oldest age, the `render_failed` count reusing the existing `admin_render_failed` recipients lookup in the sponsorships server code) and a list screen with Replay and Discard (confirm dialog, focus return, keyboard operable). Admin axe spec in light/dark x 390/1280 and a keyboard-only run, seeded through `/dev/e2e-seed`, cleaned in `finally`.
6. **Daily digest:** the retention cron sends **one** `admin_dead_letter` email when unreplayed rows exist, lost counters are non-zero or `render_failed` rows are older than 24 h. The KV marker `dlq-digest:<date>` (TTL 3 days) is written **after** the enqueue succeeds, so a failed send does not skip the day. Counts and types only. nl/en/fr.
7. **Config:** report the **new staging hash and the exact `wrangler.json` diff** (only the consumer entries). `ensure-cloudflare-resources` needs no change (it already de-duplicates consumer and DLQ names). The report says: the first staging deploy attaches the consumers, so a message already in a staging DLQ is consumed immediately.
8. **DECISIONS:** amend the entry near line 1558 (DLQ "reachable only through an HTTP pull consumer on the Queues API"): a DLQ is an ordinary queue and takes one push consumer; say why that reasoning no longer holds and why the consumer is preferred over polling the API.

**Acceptance:**
- [ ] `release:check:core` passes in this branch (the `checkQueues` edit and its test are in).
- [ ] Workers-pool tests: the 0013 rebuild, both consumers (persist, dedupe, auth bodies dropped, retry with delay on D1 failure, `lost` after exhaustion and the counter), the classification test, replay twice = one effect, key-less replay refused, erasure on account deletion, purge, digest once per day with the marker rule.
- [ ] Authz table has the three procedures; e2e spec passes three times; `docs/API.md` and DECISIONS written.

**Carries:** DLQ and `render_failed` alerting, the DLQ replay half of the we-moved carry.


### Task 5: Web accessibility: axe on every public route, keyboard and reflow runs, fixes

Wave B. Ruling 3. Needs Task 1 merged (the e2e projects).

**Files (owned):**
- New `apps/site/e2e/a11y-public.spec.ts`, `a11y-keyboard.spec.ts`, `a11y-reflow.spec.ts`; `apps/site/e2e/helpers.ts` only for shared axe helpers (Task 1 is merged by then), and a new `apps/site/e2e/screenshots.spec.ts` (spec §13 "Visual review": public routes, light/dark x 390/1280, written as artifacts when `PUBLIC_SHOTS_DIR` is set, not asserted).
- Fixes in `packages/ui-web/**`, `apps/site/src/routes/**` and `apps/site/src/components/**` **except** `components/sponsor/*-view*`, `routes/sponsor/{edit,renew}.tsx` and `lib/{redirect,sponsor-search}.ts` (Task 7's), and the admin screens (already covered by phase 5/6/Task 4 specs; admin regressions you find are reported, fixed only if one line), and **except the lazy-boundary files Task 6 owns** (legal page, `gesture-qr-dialog`, root-closure dialogs): a11y findings there go to the controller.
- `packages/i18n` `a11y.*` keys (web ones; Task 3 has the mobile ones).

**Behaviour:**
- **axe on every public route and state**, light and dark x 390 and 1280: `/`, `/gestures` (empty query, a query, no results, a category), `/gestures/<slug>`, `/favorites` and `/lists` (signed out, signed in empty, with items), a shared list (view and edit), `/account` (every section; the delete and export dialogs open), `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, `/verify-email`, `/magic-link`, `/privacy`, `/terms`, `/sponsor` steps 1 to 3 (the token pages are Task 7's), the consent banner, the app banner, the offline banner, the 404 and the error boundary. Zero `serious`/`critical` violations plus the existing `BLOCKING_RULES`; the exclusions list `AXE_EXCLUDED` in `helpers.ts` (today only `mux-player`) stays the single one, with a reason per entry; a new entry (the Turnstile iframe, if axe needs it) is justified in DECISIONS. Compare results per rule id, not by counts, so a finding that only a newer CI Chromium shows is recognisable.
- **Keyboard-only runs** (Tab, Shift+Tab, Enter, Space, Escape, arrows): skip link works and lands on `main#main-content`; header menu and the language/theme switches; search -> result -> favorite -> add to list; list reorder by keyboard with the live-region announcement; sign-in form with the error summary focused on failure; every dialog and sheet traps focus, closes on Escape and returns focus to its opener; focus is always visible (the 2 px `focus-ring` outline is asserted by computed style on a sample of controls, including inside the sticky selection bar).
- **Reflow and text spacing** (WCAG 1.4.10, 1.4.12): at 320 px wide and 400 % zoom (a 1280 x 1024 viewport at devicePixelRatio 4 is not needed: use a 320 x 256 viewport) no horizontal page scroll on any route above; with the WCAG text-spacing override stylesheet injected, no clipped or overlapping text in the header, cards and the sponsor wizard bar. `prefers-reduced-motion: reduce` disables the favorite pop, sheet and toast animations (computed `animation-duration`/`transition-duration` assertions).
- **Landmarks and names**: one `main`, a `header`/`footer`, unique `h1` per route, `lang` follows the locale (nl, en, fr), page titles are unique and localised, form errors are tied with `aria-describedby`, `aria-live` regions exist for toasts and result counts. Fix what the specs find in the kit or the routes (tokens only, i18n only).
- **Contrast**: the `@smog/styles` unit test already proves the token pairs; axe's `color-contrast` is on for every state above (hover and disabled states are sampled with a tiny helper, not enumerated).

**Acceptance:**
- [ ] The new specs pass three times in a row; they run in the `public` shard (they belong to Task 1's `a11y` project (`a11y-*.spec.ts`, created empty by Task 1) and `screenshots.spec.ts` to `public`; do not edit the Playwright config).
- [ ] Every violation found is fixed or has a DECISIONS line (rule, element, why it is a false positive or deferred).
- [ ] `bun -F @smog/ui-web test`, the site unit tests and `check-types` pass; screenshots under `e2e/__screenshots__` regenerate only where the UI changed (the diff is explained in the report).
- [ ] The staging hash is unchanged.

**Carries:** the a11y pass (Phase 9 carries 7), P-30, P-29 (web part), P-37 (header keyboard behaviour), spec §16 "Accessibility".
**Owner actions it creates (listed in Task 11):** a screen-reader pass (VoiceOver, TalkBack, NVDA) over the sponsor wizard and sign-in; high-contrast and 200 % text on a real device.


### Task 6: Performance: budgets, bundle, caching headers, D1 query review

Wave B. Ruling 4. Task 4 is merged (migration 0014, if any, follows 0013).

**Files (owned):**
- `apps/site/scripts/deploy-guard.ts` (+ tests) and a new `apps/site/perf-budget.json`; `apps/site/vite.config.ts` (chunking, a `sourcemap: false` guard), `apps/site/public/_headers`, new `apps/site/src/worker/cache.ts` (the policy; `worker/headers.ts` gets **one** import and call site: Task 8 edits that file later), `apps/site/test/cache-policy.test.ts`. **Not** `scripts/release-config-check.ts` (Task 1's): the cache-policy guard lives in site/deploy-guard tests.
- Migration `0014_*.sql` only if a plan below needs an index (indexes only), `packages/features/*/test/*plan*.test.ts`, `docs/DATA_MODEL.md` (indexes only).
- `apps/site/e2e/perf.spec.ts` (project `public`).
- **Lazy-import boundaries, limited to these named files** (Task 5 does not touch them): the legal page component (`legal-page`, 21 kB gzip, in the entry today), `gesture-qr-dialog` (7 kB), and any `*-dialog` or admin-only import reachable from the root route's static closure (list them from the manifest first). Anything else a split needs is reported to the controller.

**Behaviour:**
1. **Budgets in the deploy guard** (ruling 4, re-based). Measured today from `dist/client/.vite/manifest.json`: the client entry plus its static-import closure is **52 chunks, 1.39 MB raw, about 456 kB gzip** (entry chunk 129 kB gz; two `src-*` chunks 106 and 67 kB; `schemas` 26 kB; `legal-page` 21 kB; QR dialog 7 kB). The Worker script is about 1.8 MiB gzip. Therefore:
   - `perf-budget.json` records **per entry** (home, a gesture page, `/sponsor`, admin, each other route group) the measured initial JS gzip **+ 15 %**, **measured after the splits below land**, and the Worker script budget (<= 5 MiB gzip, a hard cap from ruling 4, which is far above the measurement). There is no floor at 200/300 kB: the **targets** are 200 kB (home) and 300 kB (any route), reached by the named lazy splits where they can be, otherwise recorded as the measured value with a note on what blocks them (shared `src-*` chunks, `schemas`).
   - **Ratchet:** `deploy-guard` fails when a measured size exceeds its budget and prints a "lower the budget to X" hint when it is more than 10 % under; the DECISIONS entry says each landed split lowers the number.
   - Keep (do not re-add) `checkClientRenderIsLazy` and `CLIENT_LAZY_MARKERS` (Remotion and MediaBunny stay out of the entry closure); add the guard that no `.map` file ships and `sourcemap` is not enabled.
   - A test lowers a budget and expects the failure; the sizes before and after the splits go in the report.
2. **Worker limits:** record script size and gzip from `wrangler deploy --dry-run`; in the Workers pool import the built worker entry, log the module-evaluation time and assert only a **generous order-of-magnitude ceiling (2 s)** or a deterministic proxy (script size, module count). No tight wall-clock assertion (ruling 2). Measure `performance.now()` around the D1 batches of search, a catalogue page, the sponsor checkout and a retention batch and note them in the report; no assertion.
3. **Caching headers** (P-18): hashed `/assets/*-<hash>.*` get `public, max-age=31536000, immutable` (**not** a blanket `/assets/*`: inventory R-18's `/assets/logo.svg`, added by Task 9, is not hashed and gets the one-day policy); `/brand/*`, icons and `og.png` a day; `/robots.txt`, `/sitemap.xml` and the manifest (Task 9) an hour; HTML `private, no-cache`; API and RPC `no-store`; the maintenance page `no-store`. A unit test checks `cache.ts` path by path; the e2e checks the real headers on six URLs.
4. **D1 query review:** `EXPLAIN QUERY PLAN` shows no full `SCAN` of a large table (FTS virtual-table scans allowed) for: search and its ranking join, the browse/category keyset page, gesture by slug, favorites and `favoriteIds`, lists overview and detail, share-token lookup, sponsor availability, the admin sponsorship list with each filter and sort, the audit keyset page, the users search (`instr`, bounded `SCAN` accepted), the render watchdog, the stale/expiry/reminder sweeps, the retention selects, the Mollie webhook lookup by `mollie_id`, `legacy_id` lookups, and the dead-letter list (Task 4). Many exist (grep `EXPLAIN QUERY PLAN`): extend, do not duplicate. A missing index is migration 0014 with its plan test.
5. **Runtime perf spec** (`perf.spec.ts`, against `vite dev`): only checks that are valid on unbundled dev code: CLS <= 0.1 on `/`, `/gestures`, a gesture page and `/sponsor`, `width`/`height` or an aspect box on images, `loading="lazy"` below the fold, the video poster and `preload="none"`, no sound autoplay. **No request-count or response-size assertions against `vite dev`** (hundreds of unminified modules, optimizer-dependent: noise); those are covered by the bundle budgets, or, if wanted, by a spec against `vite preview` of the built output (the `preview` script exists), where a request-count ceiling measured +50 % is allowed. Lighthouse is not added.

**Acceptance:**
- [ ] `bun run build` fails when a budget is exceeded (test) and passes now; sizes before/after in the report and DECISIONS (the 456 kB baseline, the splits made, the new per-entry budgets).
- [ ] Plan tests exist for every path above; 0014 only if forced (the report says which plan).
- [ ] `bun -F @smog/site test`, the `public` project three times, `deploy:dry` hash unchanged (static assets and `_headers` are not in `wrangler.json`; confirm).

**Carries:** the perf pass, P-18, the query/index review.


### Task 7: Re-edit and renewal tokens in the URL fragment

Wave B. Ruling 7.

**Files (owned):**
- `apps/site/src/routes/sponsor/{edit,renew}.tsx`, `apps/site/src/components/sponsor/{reedit-view,renewal-view,token-pages}*` and their tests, `apps/site/src/lib/sponsor-search.ts` (+ tests), **`apps/site/src/lib/legacy-redirects.ts`**, `apps/site/test/legacy-redirects.test.ts` and the call site in `src/worker.ts` (the legacy `/sponsors/re-edit` entry; `lib/redirect.ts` is the auth-callback sanitiser: not this task's). `lib/token-page.ts` (`tokenPageHeaders`/`tokenPageHead`) is pinned, not rewritten.
- The URL builders: `packages/features/sponsorships/src/server/lifecycle.ts` (~245, `${siteUrl}${path}?token=`), `sweeps.ts` (~401), `use-reedit.ts`, and `packages/email/src/samples.ts` (sample links), and the places that put a link in an email (`packages/email` template props are data; the **builder** is what changes), the admin token dialog text (`TokenDialog`: the copied URL), `apps/site/e2e/sponsor.spec.ts` and the CSP/sponsor specs that open token links.
- `docs/API.md` (the sponsorship token paragraph only).

**Behaviour (ruling 7):**
- **New links carry the token in the fragment**: `/sponsor/edit#token=<raw>` and `/sponsor/renew#token=<raw>` (emails, the admin's "copy link" dialog, the success pages). A fragment never reaches the server, a CDN, Workers Logs or a `Referer`.
- **Today** the pages already read the token on the client (`Route.useSearch()` then `ReeditView`) and the logo and submit calls already send `{ token }` in the **body** (`routes/api/sponsor/reedit-logo.ts`): SSR does not render token-dependent data, so the work is replacing `validateTokenSearch` with a hash reader (TanStack Router's `hash` is not in the search) plus `replaceState`, and the builders. The page shows the neutral loading state until the hash is read, with no error flash. A missing/invalid token shows the existing `LinkState` copy.
- **Old links keep working**: `?token=` (links already emailed, migrated re-edit tokens, copies admins made) is still accepted. On first render the client moves it into the fragment with `history.replaceState` (so later navigation, a reload, a screenshot and the browser history hold no query token) and then proceeds as above. The legacy redirect from `/sponsors/re-edit?token=` sends `Location: /sponsor/edit#token=<same>` (a fragment in a `Location` header is not logged); the generic table appends a query string, so give the entry a "token to fragment" mode. Use **302/307 for the token-carrying redirect** (a 301 for a URL with a token is cached indefinitely); keep 301 for the other legacy entries. The first request of an old link still lands in the logs: that is accepted and documented (the token is single-purpose, expires, and is revoked on use or on reject/expire/cancel).
- `Referrer-Policy: no-referrer` plus the `<meta name="referrer">` already ship on both pages (`lib/token-page.ts`, DECISIONS 858): keep and pin them with a test.
- The logo upload, preview and the renewal checkout flows work unchanged; a token must not be copied into `console`, `sessionStorage`, analytics events, the sentry-like `[csp]` log (the report endpoint already strips fragments and queries: keep its test) or error messages.
- The e2e specs (sponsor, CSP, token pages) use fragment links; one test keeps the legacy `?token=` path alive and asserts the address bar loses the query after load.

**Acceptance:**
- [ ] Unit and component tests for the hash reader (valid, missing, malformed, query fallback), the `replaceState` move, the redirect `Location`, and the URL builders (no `?token=` is ever produced).
- [ ] A grep test over `packages/**/src` and `apps/site/src` fails on a new sponsorship `token=` query builder, with an **allow-list** for the Better Auth links that legitimately use `?token=` (`/api/auth/magic-link/verify?token=`, `/reset-password?token=`, `/api/auth/verify-email?token=` in `samples.ts`) and the mobile `/magic-link/app?token=`.
- [ ] The sponsor e2e, the CSP spec and the keyboard-only token runs pass (three consecutive runs of `sponsor.spec.ts`); axe on the two token pages in every `LinkState` (valid, invalid, expired, used), light/dark x 390/1280 (the token pages' axe belongs to this task, not Task 5).
- [ ] DECISIONS: the design, the accepted first-request log, why not a POST-redirect-GET exchange cookie (more state for no gain).
- [ ] The staging hash is unchanged.
- [ ] DECISIONS one line: no mobile impact (AASA/assetlinks claim only `/gestures/*`, `/lists/*`, `/magic-link/app`; `native-intent` has no sponsor paths). Owner list: verify one real mailbox with a link scanner (Outlook Safe Links) keeps the fragment.

**Carries:** the fragment tokens (Phase 6 task 8 fix round 1 I-8, Phase 9 carries 8), R-15, R-25.


### Task 8: Security hardening review and observability

Wave C. Rulings 6, 14, 16. Needs Tasks 4, 6 and 7 merged (it edits `worker/headers.ts` after Task 6's one-line hook).

**Files (owned):**
- `apps/site/src/worker/{headers,maintenance}.ts`, `apps/site/src/server/{csp-report,rpc,context}.ts` (the RPC route `routes/api/rpc/$.ts` calls `server/rpc.ts`), `public/_headers` (headers only; Task 6 owns its cache lines, merged before), `apps/site/test/security-*.test.ts` (new and existing), `packages/api/test/authz.test.ts`, `packages/rpc/src/{middleware,errors}.ts` where a gap is found, a new `scripts/security-guard.test.ts`, `packages/utils/src/log*` (a tiny structured-log helper and redaction, only if the review finds the need), `bun audit` ignore list in the root `package.json`.
- `docs/DECISIONS.md` (the security review entry), `docs/API.md` (the rate-limit table only).

**Behaviour:**
**Much already exists: review and pin the missing cases, do not invent work.** Already present: HSTS, nosniff, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'` in `worker/headers.ts`; `respondSecurely` already catches and logs a top-level 500 (`[site] Failed to handle the request`); `authz.test.ts` already walks `appContract` and fails on an unlisted procedure; `packages/video/src/webhooks.test.ts` already tests the tolerance edges. The deltas below are what is really missing.

1. **Authorization on every oRPC procedure.** Extend `packages/api/test/authz.test.ts` so it is **exhaustive** (check what it already does and add only the gap: the explicit level table incl. `token` and `webhook`, anonymous/user/admin calls per procedure, banned users, cross-user access, the audit-in-same-batch check per admin write; Task 4's three procedures are in it): it walks the real router (every leaf of `@smog/api`'s router and of the admin router) and requires each procedure to appear in an explicit table with its level (`public`, `session`, `verified`, `admin`, `token`, `webhook`), and asserts the middleware actually enforces it (an anonymous call, a user call and an admin call per procedure, with the expected `UNAUTHORIZED`/`FORBIDDEN`/ok). A procedure missing from the table fails the test, so a new one cannot ship unlisted. Also: a banned user is refused everywhere; a user cannot read or write another user's favorites, lists, sponsorship, account export; list share-token procedures honour `view` vs `edit`; admin writes write an audit entry in the same batch (the existing guard, asserted for each write procedure through the table).
2. **Webhooks.** Mux: pin any missing case of HMAC verification and tolerance (valid, wrong secret, tampered body, stale timestamp, a retry after 5 minutes at the unit level) and the body cap. Carry 21 (a real Mux retry on staging) **stays an owner action**. Mollie: has no signature, so the webhook **re-fetches** the payment by id and ignores the body (a test proves a forged `status` in the body changes nothing; an unknown id answers 200 `UNKNOWN`, a malformed id 400). The legacy `/webhooks/mollie` alias has the same guarantees. Both are exempt from maintenance and origin checks by design: a test lists them.
3. **Rate limits.** The limiters live in `apps/site/src/server/context.ts` (`cf-connecting-ip`), route handlers (`csp-report.ts`, `mollie-webhook.ts`, analytics) and `@smog/rpc` middleware (there is no `worker/rate-limit*`). Write the table of every route and procedure group with its limiter (`RL_API`, `RL_SPONSOR`, `RL_AUTH`, `RL_ANALYTICS`) or an explicit "none, because" (health, webhooks, static); a test fails for a route with neither. Keys cannot be spoofed with `X-Forwarded-For`. A missing `cf-connecting-ip` falls back to `"unknown"` (one shared bucket): list it as an accepted risk (dev only). **P-10, the missing 5 MiB request cap on the RPC path** (verified: `routes/api/rpc/$.ts` -> `server/rpc.ts` has no `readCappedBody` or `content-length` check), is **this task's** fix: cap the body (413) and test it; the logo upload keeps its 2 MB limit. **CSP report log sampling** (ruling 6): a per-isolate token bucket logs at most 20 `[csp] violation` lines per minute, then one `[csp] suppressed {count}` line when the window closes; the `RL_ANALYTICS` rate limit stays; a test with a fake clock covers it. No new `ratelimits` binding (the built config stays unchanged).
4. **Headers.** The real gap is the static-assets path: `public/_headers` lacks `Permissions-Policy` and `Cross-Origin-Opener-Policy` (the Worker sets them on its responses). Add them there and test per env; review the rest of `headers.ts` against this list and pin it (no new header work if it matches): `Strict-Transport-Security` (max-age 1 year, no preload decision: owner), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (camera/mic/geolocation off, except what the sponsor logo upload or the QR needs: none), `Cross-Origin-Opener-Policy: same-origin` (check Turnstile and the Mollie redirect keep working: they are navigations, not popups), frame-ancestors `'none'` (no embedding; `/dev/ui` aside), CSP `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` plus Mollie's checkout host only if a form posts there (it redirects: no). Add what is missing with a test per header per env; static assets get the same set through `_headers` where applicable.
5. **Secrets and personal data never logged.** A scan test (`scripts/security-guard.test.ts`) over `apps/site/src`, `packages/**/src` and `scripts`: no `console.*` call interpolates an identifier named like `token|secret|password|code|authorization|cookie|apiKey|email` without going through the redaction helper or an allow-list entry with a reason; the CSP and webhook logs keep their reductions. Check by test that thrown error messages from `@smog/payments`, `@smog/video` and the email sender do not include request headers or bodies. Review the auth hooks' logs (Better Auth debug off in production).
6. **Dependencies.** Run `bun audit --production` (online in CI; offline here it may not reach the registry: say so). Re-read each of the eight ignored advisories in the root `package.json`: still not reachable from the Worker or the apps? Newer fixed versions available (then update and drop the ignore)? Record the re-evaluation date in each DECISIONS line. `bun outdated`: list what is not newest-stable and why.
7. **Observability** (ruling 14). `respondSecurely` is the existing top-level handler for `fetch`; add the same for `queue` and `scheduled` if missing. No external error reporter (X-18; spec principle 6; privacy text names no processor for it). Standardise what exists: every Worker log line is `[service] event {json}` or `[service] Failed to ...: <message>`; one `[error]` helper that logs the name and a redacted message of an unhandled error at the Worker's top level (`fetch`, `queue`, `scheduled`) with the request id, never the stack's data; `logErrors` in rpc keeps `[rpc:<path>]`. The alert path is: the dead-letter digest and card (Task 4), `admin_render_failed`, and Cloudflare-side notifications that are **owner actions** (Workers observability alerts on error rate, queue backlog, cron failures; Task 11 lists them). `observability` in `wrangler.jsonc` is **not** changed.

**Acceptance:**
- [ ] The exhaustive authz test fails when a procedure is missing from its table (a test proves it with a temporary stub router); the RPC body cap has a test.
- [ ] Every item above has a test; new headers appear in `security-headers.test.ts` per env (CSP enforced in dev/production, Report-Only in staging, as today).
- [ ] The full e2e `public` and `serial` shards pass (headers change can break Turnstile, Mux player, the Mollie fake redirect, the Remotion Player's blob/worker use under the CSP): run them three times.
- [ ] `deploy:dry` hash unchanged (headers are runtime code).
- [ ] DECISIONS "Security review (phase 9 task 8)": findings, fixes, accepted risks, the audit re-evaluation.

**Carries:** the security review, the CSP log sampling (Phase 9 carries 4), P-10 and P-26/P-27 evidence for Task 9, webhook signature checks.


### Task 9: The parity audit (the feature inventory's open rows)

Wave **C2: after Task 8 is merged** (it needs Task 8's rate-limit table, the P-10 fix and its P-26/P-27 evidence). Ruling 15. Reads everything; edits only where listed.

**Files (owned):**
- `docs/superpowers/specs/2026-09-29-feature-inventory.md` (ticks and notes; **this task is the only one that ticks rows in phase 9**), `docs/DECISIONS.md` (one `## Parity audit (phase 9 task 9)` section), `docs/superpowers/specs/2026-09-29-cloudflare-rewrite-design.md` (small amendments where the audit finds the spec stale: §13 testing and §14 CI are Task 11's).
- Fixes for **real gaps** in files nobody else owns in this wave: `apps/site/public/**`, `apps/site/src/routes/{manifest,browserconfig,sitemap,robots}*` (new routes regenerate the committed `routeTree.gen.ts`; the controller resolves merges), `packages/brand`, `apps/site/src/routes/**` leaf routes, small server fixes. **Not** `apps/site/src/worker/*` (Task 8's), nor `apps/mobile` screens (Task 3's, merged).
- New `apps/site/e2e/routes-parity.spec.ts` and `packages/*/test/parity-*.test.ts` where a row needs a pinning test.

**Procedure (ruling 15).** There are about 50 unticked rows (`grep -n "\[ \]"` on the inventory) plus section 8 ("old bugs the rewrite must fix") and section 1.3 (rows marked "no DECISIONS entry"). For each row record one disposition in the audit table you write into the DECISIONS section (id, disposition, evidence = the file, test or DECISIONS entry):
- **Done, ticked**: implemented and tested; cite the test.
- **Dropped or changed, ticked**: the row says so and a DECISIONS entry exists; add the missing entry (the "no DECISIONS entry" rows of 1.3) and tick with `[x] dropped` or `[x] changed`.
- **Gap, fixed here**: implement and test; tick.
- **Gap, deferred**: only with a reason and an owner or a later date; keep `[ ]` with the note.

**Pre-triage the planner did (verify, do not trust):**
- **Gaps likely real:** **P-14 PWA manifest and R-18 browserconfig**: `manifest.webmanifest`, `browserconfig.xml` do not exist in the repository (grep finds only the inventory); implement `/manifest.webmanifest` (generated from `@smog/brand`/tokens with the old values: name `SMOG&Co`, lang nl, display standalone, start_url `/`, theme `#00805f`, background `#ebf4eb`, the icon set that exists in `public/`), `/browserconfig.xml`, link tags in `__root`, and a `release-config-check` entry **requested from the controller** (Task 1's file; put the check in a site test instead). Icons: `public/` has `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, `icon.svg`, `favicon.ico`; the old app had nine `android-chrome-*` sizes, mstile PNGs and iOS startup images. Using the icon set that exists is a `changed` row: **write the DECISIONS entry** (and update the P-14 text that says nine sizes). `browserconfig.xml` would point at `mstile-*.png` that do not exist: either generate them in `@smog/brand` (`compose.ts`; mind `drift.test.ts`/`outputs.test.ts`) or, recommended, **drop `browserconfig.xml` as legacy IE/Edge with a DECISIONS line** and mark R-18 `changed`. `yandex-browser-manifest.json` is dropped (DECISIONS). **`/assets/logo.svg` (R-18)** also does not exist (`public/assets` is absent; `/assets/` is Vite's hashed output): add it, unhashed, with the one-day cache policy of Task 6. **P-10**: confirmed missing and **fixed by Task 8**; here only tick it with Task 8's test as evidence. **R-01..R-25 route rows**: write `routes-parity.spec.ts` that walks the inventory's route table (including the legacy 301s, `/favorites`, `/sponsor`, deep-link files, `/assets/logo.svg`, `/robots.txt`, `/sitemap.xml`) against the dev server. **P-34** OpenAPI UI dev and staging only: pin with a production-env test. **P-23** developer tools on dev and staging builds only. **P-32** `static_renditions` on uploads. **W-03/W-04/W-08/W-09** the endpoint and rate-limit shapes (use Task 8's table).
- **Likely done, only unticked:** U-11 (Task 3 delivered the confirmation), P-18 (Task 6), P-26/P-27 (Task 8), P-29/P-30 (Tasks 3 and 5), P-33, P-36, P-37, P-39, J-08, X-04, X-09, X-11, X-12, X-17, X-18, R-04, R-06, R-07, R-12, R-23 to R-25.
- **Dropped or changed (confirm the DECISIONS reference, tick):** L-19, A-13, P-38, J-05, J-09, W-05, W-06, W-10, W-11, X-01, X-02, X-05, X-10, X-14, X-15.
- Walk **section 8** (old bugs): one line each, with the test that pins the fix.
- **R-15's note** must be updated after Task 7 (the legacy redirect now carries the token in the fragment, not `?token=`).
- **Not done, recorded with a reason in DECISIONS** (so the audit shows them): load/abuse testing of the rate limits, a cost review, a backup-restore drill (the runbook has D1 Time Travel; the owner runs a drill).

**Acceptance:**
- [ ] Every row of the inventory is `[x]` or `[ ]` with a stated reason and owner/date; no row is ticked without evidence.
- [ ] The audit table is in DECISIONS; gaps fixed here have tests; deferrals are copied to Task 11's list.
- [ ] `routes-parity.spec.ts` passes three times; `bun run test` for touched packages passes.
- [ ] The staging hash is unchanged.

**Carries:** the parity audit (Phase 9 carries 7), the inventory's "Done boxes are ticked by later phases" promise, the 1.3 "no DECISIONS entry" list.


### Task 10: Toolchain: Biome (and the Bun decision)

Wave D, **alone** (a Biome bump can reformat every file). Ruling 13.

**Files (owned):** root `package.json` and `bun.lock` (the catalog and `devDependencies`), `biome.json*`, every file Biome reformats, `docs/DECISIONS.md` (the two toolchain entries and the `bun outdated` table).

**Behaviour:**
1. **Biome.** Try the newest stable release (the 2.5.14 pin exists because of 2.5.15's `noUnnecessaryConditions` false positives, DECISIONS phase 8 task 1). Install it, run `bun run check`. Accept the bump **only if** the diff is mechanical formatting or true positives and no rule needs a blanket disable. A rule with a false positive is turned off or downgraded **by name with a DECISIONS line and the upstream issue**, only if it is a handful of sites. If it needs more than that, keep 2.5.14, record the version tried and why, and stop.
2. **Bun.** Stays on 1.3.11 unless **all** hold: the newest stable Bun downloads here (the 2026-09-29 entry says the GitHub release download was blocked), `bun install --frozen-lockfile` gives an identical lockfile, every test lane passes, **and** the render image's `oven/bun` digests (three stages in `packages/render/container/Dockerfile`) can be looked up and updated and the render lane proven. The last needs a Docker daemon and registry access, which this machine lacks: therefore the expected outcome is **deferred to the owner with a checklist** (the commands and the digests to fetch), recorded in DECISIONS and in Task 11's list. Do not change `packageManager`.
3. **Newest stable sweep.** `bun outdated` (or `npm outdated` per workspace): list every dependency behind the newest stable; bump the safe ones (patch/minor, no peer conflicts) through the catalog, each with the `[dep]` note only if it deviates; majors that are blocked (React 19.2.3 under Expo SDK 57, Jest 29, RN 0.86) keep their existing DECISIONS lines; anything else new is recorded with a reason. Re-run the whole suite after the bumps.

**Acceptance:**
- [ ] `bun run check:ci`, `check-types`, `build`, `bun run test`, `knip`, `boundaries` pass; `deploy:dry` hash unchanged (a dependency bump must not change the built config; if the bundle changes size, the Task 6 budgets still pass).
- [ ] **All e2e projects** (`public`, `a11y`, `admin`, `serial`) pass once more (a Vite/Playwright bump can break any shard).
- [ ] The online-only checks (expo-doctor, `audit`) are named in the report as **not run here** when offline.
- [ ] DECISIONS: Biome (done or kept, with the evidence), Bun (kept, with the owner checklist), the outdated table.

**Carries:** "A Bun upgrade with the render image digests" and "Biome 2.5.15 or later" (Phase 9 carries).


### Task 11: Docs final pass, the owner list in its final form, and the phase close

Wave E, last. Depends on Tasks 1-10.

**Files (owned):** `README.md`, `AGENTS.md`, `docs/PROGRESS.md`, `docs/deployment.md`, `docs/cutover-runbook.md`, `docs/API.md`, `docs/DATA_MODEL.md`, `docs/LEGAL-SIGNOFF.md` (only if a task's report says), the spec's §13/§14/§15 amendments, `docs/DECISIONS.md` (the phase 9 index and the amendment of superseded entries), a new `scripts/docs-check.test.ts`.

**Behaviour:**
1. **Accuracy check by machine** (`scripts/docs-check.test.ts`, run in `bun run test`): every `bun run <script>`/`bun -F <pkg> <script>` named in AGENTS.md, README and the docs exists in the matching `package.json`; every relative link and every path in backticks that looks like a repository path resolves (an allow-list for generated, gitignored and future paths); every `docs/DECISIONS.md` heading referenced from the docs exists; "the next free migration number" statements equal the real next number; the CI job names in AGENTS.md equal `ci.yml`'s (accept the matrix forms such as `Release check (core)` and the e2e shards). The "paths in backticks that resolve" check needs a sizeable allow-list (gitignored, generated, future, `docs/superpowers/plans/...`): **budget for it and cover AGENTS.md, README.md, `docs/deployment.md` and the runbook first**, extending to the rest only if clean.
2. **README** (26 lines today): what SMOG is, the stack, the layout, the quick start (install, `.dev.vars`, migrate, seed, dev, tests, e2e), the commands that matter, where the docs are, the environments and the deploy model, licence/credits. Short; links, no duplication of AGENTS.md.
3. **AGENTS.md**: the commands block gains `test:e2e` and its shards, the e2e CI job, the budgets (`perf-budget.json`), `apply --reset-only`, `we-moved --resend`, the dead-letter admin and the digest, `APP_VARIANT`, the fragment tokens, the security guards; the CI paragraph says five jobs (four lanes plus e2e) and the offline-versus-CI gap; remove statements that stopped being true.
4. **docs/*.md pass**: `deployment.md` and `cutover-runbook.md` fold in the new commands (reset-only in the rehearsal section, resend in T-0 step 13's gate, the dead-letter replay in the DLQ checks, the fragment links in the "old links" notes), the R2 decision (ruling 8: jurisdiction unsupported, the design sketch for a later task), the app variants' owner steps, the Cloudflare notifications to enable; `API.md` and `DATA_MODEL.md` list 0013 (and 0014 if it exists), the dead-letter procedures, the cache policy, the manifest routes; the spec's §13 (e2e shards and the CI job), §14 (`ci.yml` has the e2e job), §16 (a11y checks that exist) amendments, marked as amended with the DECISIONS reference.
5. **PROGRESS.md final form**: tick phase 9 once the phase review's fix wave is merged (the log line says what is pending); a phase 9 log entry per task; **delete the "Phase 9 carries" section** and replace it with "Post-launch carries" holding only what is genuinely left (the legacy-alias removal at cutover + 30 days, the staging render latency and cost check after the flip, the Bun upgrade checklist, R2 jurisdiction if the owner wants it, deferred parity rows with owners); drop the Known-gaps entries that are fixed (the e2e placeholder, the turbo bypass, reset-only, DLQ alerting); **Owner actions in order** gets its **final form**: every earlier step kept in order, with the phase 9 additions slotted where they belong (require the `e2e` check in branch protection; the Cloudflare notifications; the real-device screen-reader and Turnstile checks; the variant bundle ids and OAuth clients; the dead-letter retention row in the legal sign-off; the Bun upgrade checklist) and a one-screen "what is still blocked on you" summary at the top.
6. **Final verification** (report the commands and exit codes): the full e2e (`bun run test:e2e`) **three times in a row** on a fresh D1; `SMOG_OFFLINE=1 bun run release:check`; `bun scripts/check-deploy-config.ts --env staging --offline`; the staging `deploy:dry` hash against the baseline the controller recorded after Task 4 (and the diff since `05237bc` explained); the local importer rehearsal once more (migrate, `admin:grant --create`, plan, apply, `apply --reset`, `apply --reset-only`, `mux scan`, `we-moved` refused) since Task 2 touched it.

**Acceptance:**
- [ ] `scripts/docs-check.test.ts` passes and fails on a deliberately broken link (the test proves it).
- [ ] No document names a command, path, count or number that is no longer true (the docs-check covers what a machine can; the report lists what was read by hand).
- [ ] Owner list: ordered, complete, each step with its place in `docs/deployment.md` or the runbook.
- [ ] The report says which CI lanes could not be run here (the render lane needs Docker; expo-doctor and audit need the network) and that CI is the authority.

**Carries:** "Docs final pass" and the "owner action list final form" of the phase 9 scope.



---

## Parallelism

Each wave's tasks own disjoint files (the brief of each task lists them). A task that needs another task's file stops and asks the controller. Worktrees per task; merges in task order within a wave; the controller runs the full gate between waves.

| Wave | Tasks | Files (disjoint within the wave) |
|---|---|---|
| A | 1, 2, 3, 4 | **1:** `.github/workflows/ci.yml`, root `package.json`/`turbo.json`/catalog (Playwright), `apps/site/playwright.config.ts`, `e2e/{global-setup,helpers}.ts` and sleep/flake fixes in existing specs, the `test:e2e` line of `apps/site/package.json`, `scripts/release-config-check.ts` (**CI-workflow check only**), `scripts/e2e-flaky-report.ts`, `AGENTS.md` commands. **2:** `packages/migrate-convex` (apply, we-moved, preflight, tests), the `deploy*` lines of `apps/site/package.json`, `docs/DATA_MODEL.md` reset paragraph. **3:** `apps/mobile/**`, `packages/ui-native/**`, `packages/auth/src/server.ts` (trusted origins), `apps/site/src/lib/open-in-app.ts`, the account client scheme call sites, `scripts/mobile-release-check.ts`, mobile i18n keys. **4:** `packages/db` (0013, schema, `retention.ts`), `packages/jobs`, `packages/features/admin`, `packages/features/sponsorships/src/server/sweeps.ts` and the render-failed count, `packages/api/{contract,router,admin-deps}` and `authz.test.ts`, `packages/email`, `apps/site/src/worker/{queues,scheduled}.ts`, `apps/site/wrangler.jsonc`, **`checkQueues` in `scripts/release-config-check.ts`**, `scripts/retention.ts`, the admin route/rail/dashboard card, `routeTree.gen.ts`, the e2e seed, `admin-dead-letters.spec.ts`, `LEGAL-SIGNOFF.md`. Tasks 1 and 4 edit `release-config-check.ts` in **different functions**: merge Task 1 first. |
| B | 5, 6, 7 | **5:** new `e2e/a11y-*.spec.ts` and `screenshots.spec.ts`, `packages/ui-web`, `apps/site/src/{routes,components}` except the sponsor token pages, admin, and Task 6's lazy-boundary files; web `a11y.*` keys. **6:** `apps/site/scripts/deploy-guard.ts`, `perf-budget.json`, `vite.config.ts`, `public/_headers` (cache lines), `src/worker/cache.ts` (+ one call in `headers.ts`), the named lazy-boundary files (legal page, `gesture-qr-dialog`, root-closure dialogs), migration 0014 if needed, plan tests, `e2e/perf.spec.ts`. **7:** `routes/sponsor/{edit,renew}.tsx`, `components/sponsor/*-view*` and token pages, `lib/{sponsor-search,legacy-redirects}.ts`, `test/legacy-redirects.test.ts`, the `worker.ts` call site, the URL builders (`lifecycle.ts`, `sweeps.ts`, `use-reedit.ts`, `samples.ts`), the admin token dialog, the sponsor and CSP e2e specs. |
| C1 | 8 | `apps/site/src/worker/{headers,maintenance}.ts`, `src/server/{csp-report,rpc,context}.ts`, `public/_headers` (headers), `packages/api/test/authz.test.ts`, `packages/rpc` middleware/errors, `scripts/security-guard.test.ts`, the audit ignore list. |
| C2 | 9 | After Task 8: the inventory, the audit section of DECISIONS, `public/**` and leaf routes (manifest, `/assets/logo.svg`), `routeTree.gen.ts`, `e2e/routes-parity.spec.ts`, parity tests. |
| D | 10 | Root `package.json`, `bun.lock`, `biome.json*` and whatever Biome reformats. Alone. |
| E | 11 | `README.md`, `AGENTS.md`, `docs/*`, `scripts/docs-check.test.ts`, the spec's amendments, the phase close. |

Eleven tasks. Dependencies inside waves A and B: none (merge order 1, 2, 3, 4; DECISIONS and i18n conventions are in the global constraints). Wave C is serial: 9 needs 8. Across waves: Task 5 needs Task 1's projects; Task 6's migration (0014) follows Task 4's 0013; Task 8 needs Tasks 4, 6 and 7 merged (it edits `headers.ts` after Task 6 and tests the dead-letter and token pages); Task 9 needs Tasks 3, 5, 6, 7 and 8 landed to tick their rows; Task 10 needs everything else merged; Task 11 is last.

**Merge-time gate after every wave (controller):** `bun run check:ci`, `check-types`, `bun run test`, `bun run test:e2e` (from wave A on), the staging `deploy:dry` hash against the recorded baseline, and the CI run on the branch (all four lanes plus the e2e shards). After Task 4 the controller records the new hash.

## Moved to later phases (or to the owner)

- **After the render flip:** the staging render latency and cost check (measure a real container render on staging, compare with phase 7 task 4's measurement of about 0.34 s per frame, and the monthly cost against `docs/deployment.md` §14).
- **Cutover + 30 days:** remove the legacy `POST /webhooks/mollie` alias after the log check.
- **Owner only** (Task 11 puts them in the final ordered list; none can be done from the session):
  - everything in the existing "Owner actions in order" (staging secrets and `SMOG_REQUIRE_SECRETS`, the Access bypass list, the Mux environments and the render flip, the Email Service, Turnstile, the providers, Mollie, production ids and secrets, the legal sign-off, the first production deploy, the domain decision, the stores, the T-14 plan, the rehearsal, T-0);
  - new in phase 9: require the `e2e` job in branch protection for `develop` and `master`; enable Cloudflare notifications (Workers error rate, queue backlog, cron failures); a screen-reader pass (VoiceOver, TalkBack, NVDA) and a high-contrast/200 % text pass on real devices; the Apple bundle ids, Google OAuth clients and EAS credentials for the `development` and `staging` variants; the dead-letter retention row of the legal sign-off; the Bun upgrade checklist (digests, render lane); R2 jurisdiction if wanted; the HSTS preload decision.
- **Not done, with reason:** load/abuse testing of the rate limits, a cost review and a backup-restore drill (the runbook has D1 Time Travel; the owner runs a drill; recorded in DECISIONS by Task 9); Lighthouse CI (heavy, network-bound; budgets and the CLS spec instead); an external error reporter (spec principle, privacy text); mobile device automation (Maestro/Detox: no device farm, owner pass instead).

## Open risks (for the reviewer and the owner)

1. **E2E time and flakiness in CI.** The suite passes locally on this machine in its own ports; CI runners are slower and have fewer cores, and the first Vite compile is slow. Mitigations: three shards, warm-up, `retries: 1` with flaky reporting, 30-minute timeouts. If a shard exceeds 20 minutes locally Task 1 splits it further. The first real CI run may still need a tuning commit.
2. **Browser mismatch.** The local Chromium (141) is older than the one this Playwright expects; CI installs the matching one, so rendering, axe results and screenshots can differ slightly. Task 5 runs axe in the same way both places, but a violation that appears only on the newer browser can first show in CI. Screenshots are artifacts, not asserted.
3. **Task 4 changes the built config and rebuilds `audit_log`.** Two DLQ consumers on the site Worker: the first staging deploy after it attaches them, so a message already in a staging DLQ is consumed (stored in D1) at once. Migration 0013 rebuilds `audit_log` on staging D1 before the Worker deploys (duration measured by the test on a seeded table only). Body storage is personal data with a 14-day retention that needs the owner's legal sign-off. If D1 stays down through 20 retries at 300 s, messages are lost (logged `[dlq] lost`, counted in the digest).
4. **Security headers can break third parties.** COOP, `Permissions-Policy`, `frame-ancestors` and HSTS interact with Turnstile, Mux player, Mollie's redirect and the Remotion Player; Task 8 runs the CSP, sponsor and video e2e three times, but the real Mollie and Turnstile are only proven on staging by the owner.
5. **Fragment tokens.** The pages already read the token on the client, so SSR does not change; the risk is the hash reader and the builders. Old links still hit the logs once, and a link scanner that drops fragments would break new links (owner check with one real mailbox).
6. **Budgets are measured on one machine.** The 15 % margin may be wrong on CI's Linux/Node; a first CI failure of the budget is a measurement to adjust in `perf-budget.json`, not a regression, after checking the bundle diff.
7. **Parity audit may find real gaps late.** The manifest and `browserconfig.xml` look missing (P-14, R-18). Task 9 sits in wave C so a gap has room for a fix wave; a gap in a file Task 8 owns goes to the controller.
8. **`APP_VARIANT` identities need owner setup** (Apple, Google, EAS) before a staging or development build can sign in with Apple or Google. The pre-task production identity must stay byte-identical: the test is the guard, and the first production build after the phase is the real check.
9. **Biome and the formatting diff.** Task 10 may touch many files; it runs alone and is dropped (version kept) if the false positives remain.
10. **Offline versus CI.** `SMOG_OFFLINE=1 bun run release:check` is green here without expo-doctor's online checks, the audit and the render lane. Every task relies on CI for those; a phase-close CI run on all five jobs is the gate before the owner sequence.
11. **Cloudflare unknowns stay unknown.** The token permission names for Workflows and Containers, the startup-time limit at deploy, and the real queue and cron behaviour are first proven at the owner's flips; phase 9 adds guards (budgets, a startup-time test) but cannot confirm them.

## Review dispositions

The plan review (`plan-review.md`) was approve-with-fixes. Every claim was checked against the code before editing.

- **Applied as written:** C1 (`checkQueues` rejects any consumer but email and sponsorship-events: verified at `release-config-check.ts` ~735; it moves to Task 4, Task 1 keeps the CI-workflow check); C2 (verified `audit_log_action_check`/`target_type` CHECK constraints in `schema/account.ts`; choice: **rebuild** in 0013, because admin writes must audit and new values are unavoidable); C3 (budgets re-based on the measured 456 kB, named lazy splits, ratchet); C4 (20 retries at 300 s, `retry`, KV lost counter, DECISIONS amendment); I1 to I10 and the Minor items 1 to 12 (paths, ownership, PII classification and erasure, reset-only acceptance, 302/307 for the token redirect, dev-server perf assertions removed, `/assets/logo.svg` and the immutable scope, waitForTimeout x6, project names, deadlines, Playwright to the catalog, P-10 moved to Task 8, wave C split into C1 and C2, icon and mstile DECISIONS lines, `screenshots.spec.ts`, load/cost/restore under "Not done", the `APPLE_APP_BUNDLE_IDENTIFIER` owner action and the recorded `release-config-check` deviation, merge conventions for DECISIONS, i18n, API.md, `components/**`).
- **Not independently verified (taken from the review):** the 456 kB figure (the planner did not build), the 24 spot-checks beyond the ones re-grepped (`checkQueues`, CHECK constraints, `legacy-redirects.ts`, `token-page.ts`, six `waitForTimeout`, `_headers` lacking Permissions-Policy/COOP, `AXE_EXCLUDED`). Task 6 re-measures first and its numbers win over the review's.
- **Disagreed or adjusted:** none outright. One refinement: Task 4's replay refuses key-less emails instead of accepting a duplicate (the review offered both); and Task 3's `release-config-check` rule stays in `mobile-release-check` (a recorded deviation) rather than serialising Task 3 behind Task 1.
