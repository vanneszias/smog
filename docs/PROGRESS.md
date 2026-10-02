# Progress

Resume here. The spec is `docs/superpowers/specs/2026-09-29-cloudflare-rewrite-design.md`; the feature checklist is `docs/superpowers/specs/2026-09-29-feature-inventory.md`; decisions are in `docs/DECISIONS.md`. The old system is described in `docs/superpowers/analysis/` (read from `origin/master`); the old code can be read with `git show origin/master:<path>` or through a worktree (`git worktree add --detach ../ref-master origin/master`).

Workflow: superpowers by hand (the plugin was unavailable). Plans are in `docs/superpowers/plans/`, one per phase, each written when its phase starts. Execution is subagent-driven: one implementer and one task reviewer per task, and a phase review before each phase is closed.

## Phases

- [x] 0. Analysis → feature inventory → design spec → phase 1 plan
- [x] 1. Monorepo skeleton (Bun, Turbo, Biome, knip, boundaries, config, CI, empty site + mobile)
- [x] 2. Foundations (db, auth, rpc/api, local-store + guest import, styles/brand/i18n, ui-web/ui-native, /dev/ui)
- [x] 3. Learning (gestures, categories, FTS search, favorites, lists, share links; site + mobile)
- [x] 4. Account, consent, analytics, legal pages, deep links, legacy redirects, maintenance mode
- [ ] 5. Admin panel
- [ ] 6. Payments, sponsorships, jobs, emails
- [ ] 7. Render (Remotion, Container, Workflow, Mux upload, wizard preview)
- [ ] 8. Environments (wrangler envs, EAS profiles, deploy workflow) + Convex → D1 migration script
- [ ] 9. Hardening (e2e, a11y, perf, docs, parity audit)

## Log

- 2026-09-29: Phase 0 done. Orphan `develop` branch created. Analysis reports, inventory, spec, DECISIONS and the phase 1 plan committed.
- 2026-09-29: Phase 1 done. Root tooling, `@smog/config` + boundaries, `apps/site` (TanStack Start on Workers, guarded deploy), `apps/mobile` (Expo SDK 57, NativeWind 4), release gate (`bun run release:check` green with `SMOG_OFFLINE=1` here), `ci.yml` and `deploy.yml`.
- 2026-09-29: Phase 2 tasks 1–8 merged (db, auth, email core, rpc/api, local-store, styles/brand, i18n, ui-web + /dev/ui, ui-native + gallery). Phase 3 task 1 (gestures) merged.
- 2026-09-29: Phase 2 review fix wave: CSRF origin check on `/api/rpc` + `/api/openapi`, `/dev/ui` back in staging, shared test preload / cursor error / user-scoped query keys, `admin:grant`, fr typography test, stale docs.
- 2026-09-29: Phase 2 done (the phase review passed after the fix wave; release:check green).
- 2026-09-30: Phase 3 tasks 5 and 7 merged; phase 4 plan written, task 1 merged.
- 2026-09-30: Phase 3 task 6 merged (all 7 tasks in). Phase 3 review: pass with a fix wave (two groups). Group A: site analytics sources, one course banner rule (`@smog/gestures/client`, once per visit), web CourseBanner, QR PNG download, `useFeaturedGestures`, search SSR within 3 D1 reads, inventory ticks and docs.
- 2026-09-30: Phase 3 done: both fix-wave groups reviewed and merged; release:check and the full site e2e (42/42) green. Phase 4 tasks 2 (analytics) and 3 (account and consent UI) merged.
- 2026-09-30: Phase 4 tasks 4 (legal pages, app links, open in app, legacy 301s, AppBanner), 5 (Turnstile bridge for the app, app magic link) and 6 (maintenance, security headers, CSP) merged. Phase 4 review: pass with a fix wave (I1–I7, two groups). Phase 5 task 1 (admin package, audit log, admin shell) merged.
- 2026-09-30: CI split into three lanes (`release:check:core`, `:tests`, `:mobile`); every push to `develop` now deploys to staging once the lanes pass.
- 2026-10-02: Phase 4 done: fix wave B merged (fdcd6cd); release:check green. Phase 5 task 2 (catalogue API, migration 0006) merged and deployed to staging; `bun audit` ignores GHSA-86w9-cpqp-85rv (node-forge, Expo tooling only, DECISIONS).
- 2026-09-30: Phase 4 fix wave B: load-robust tests (route warm-up, RNTL and Testing Library timeouts, deferred gates, batched seeds, Workers-pool `testTimeout`, Playwright workers and warm-up, turbo `--concurrency=3`), a guest never inherits a mirrored consent (I7), the legal additions (Google photo, `smog_mx`, a shared device) and LEGAL-SIGNOFF P29–P32, inventory ticks.

## Next

- Phases 2, 3 and 4: done.
- Phase 5: tasks 1 (admin package, audit log, admin shell) and 2 (catalogue API) merged; task 3 (`@smog/video` + Mux) in progress; then 5 (users and roles), 6 (settings and emails), 4 (catalogue screens) and 7 (hardening).
- Carry into phase 5: admin gesture and category writes must set `sort_name`, reindex FTS and call `bumpCatalogVersion` (the catalog snapshot also serves `gestures.categories`); gesture name ≤ 120. The admin gestures tab gets the QR dialog (inventory L-14's admin half). The admin screens read categories (and gestures) from D1, not through the cached `gestures.categories`, so an admin sees their own edit at once. The maintenance toggle sets the admin's bypass cookie in the same response.
- Carry into phase 6: the sponsor call-to-action on the gesture detail (inventory L-17), from `sponsorships.availability`, on the site and mobile, and the `sponsorship_checkout_started` event.
- Carry into phase 6 (required before cutover, the privacy text promises it): a scheduled purge that deletes `audit_log` rows older than 3 years and expired `session` and `verification` rows within 30 days of their expiry.
- Carry into phase 8: the Convex → D1 data import must call `bumpCatalogVersion` (and rebuild FTS) when it finishes; otherwise isolates keep serving the old catalog snapshot until they are recycled.
- Carry into phase 8: a CSP `report-to`/`report-uri` endpoint before launch. Staging sends the CSP `Report-Only` with nowhere to report (phase 4 task 6), so it only shows in each browser's console. Add a small same-origin endpoint, rate-limited, that logs (or relays to OpenPanel), or run the csp e2e against staging.
- Carry into phase 8 (staging smoke): a stale admin save returns `CONFLICT` (`stale`), not `INTERNAL`. The catalogue's in-batch guards are recognised by the guard name in SQLite's "bad JSON path" error text, which is verified only in workerd (phase 5 task 2, DECISIONS).
- Carry into phase 8: required secrets and vars checked before deploy, including production `TURNSTILE_SITE_KEY` (var) and `TURNSTILE_SECRET_KEY` (secret); `SITE_URL` per env must be the origin browsers use (the rpc origin check and Better Auth compare against it).
- Carry into phase 8: the App Store privacy label and the Play data safety form name Turnstile (the app's challenge web view, LEGAL-SIGNOFF P32) and OpenPanel.

## Pending before develop → master

`master` deploys production (`deploy.yml`), so none of this may be skipped:
1. Owner sign-off of `docs/LEGAL-SIGNOFF.md`: its 4 open decisions (effective date, consent history on deletion, renewal price wording, Google photos or R2), the consent version, the complaint links, and the fix-wave additions P29–P32 (the Google photo, the `smog_mx` cookie, a shared device, Turnstile in the app).
2. The retention purges the privacy text promises: `audit_log` older than 3 years, and expired `session`/`verification` rows within 30 days (phase 6 carry).
3. Production `TURNSTILE_SITE_KEY` (var) and `TURNSTILE_SECRET_KEY` (secret), and a production `SITE_URL` equal to the browser origin (phase 8 carry).
4. Device checks no test covers: Turnstile in the iOS simulator and on an Android device with the always-pass key; open in app and universal links (including `/magic-link/app`) on a real iPhone.
5. The phase 4 fix wave merged (group A is; group B next), with release:check, the site e2e and two forced test runs green.

## Known gaps

- The legal texts (`/privacy`, `/terms`) need the owner's sign-off before any develop → master merge (see "Pending before develop → master").
- Bun is pinned at 1.3.11 (`packageManager`); upgrade when possible (see DECISIONS).
- `SMOG_OFFLINE=1 bun run release:check` (local, no network) degrades three expo-doctor checks; CI runs them online and is the authority.
- The deploy workflow deploys staging on every push to `develop`, once the three CI lanes pass (the `staging` GitHub environment has its secrets and ids). Production has never deployed: `master` needs the `production` environment's `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`, real KV ids, `SITE_URL` and the Turnstile keys, and the list under "Pending before develop → master". D1 migrations run before each deploy (`packages/db/migrations`, append-only).
- `bun run audit` ignores three moderate advisories (DECISIONS).
- The Playwright `e2e` CI job is a placeholder (off unless `vars.E2E_ENABLED == 'true'`), and the spec's root `test:e2e` script does not exist yet; both come in phase 9.
- `bun -F @smog/site deploy` bypasses turbo. Once workspace packages need a build step, run `turbo run build --filter=@smog/site^...` first (or make deploy a turbo task depending on `^build`).
- knip prints an Expo warning about a missing `userInterfaceStyle` although `app.config.ts` sets it (knip's Expo plugin loads the config its own way); cosmetic.
