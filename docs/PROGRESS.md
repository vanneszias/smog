# Progress

Resume here. The spec is `docs/superpowers/specs/2026-09-29-cloudflare-rewrite-design.md`; the feature checklist is `docs/superpowers/specs/2026-09-29-feature-inventory.md`; decisions are in `docs/DECISIONS.md`. The old system is described in `docs/superpowers/analysis/` (read from `origin/master`); the old code can be read with `git show origin/master:<path>` or through a worktree (`git worktree add --detach ../ref-master origin/master`).

Workflow: superpowers by hand (the plugin was unavailable). Plans are in `docs/superpowers/plans/`, one per phase, each written when its phase starts. Execution is subagent-driven: one implementer and one task reviewer per task, and a phase review before each phase is closed.

## Phases

- [x] 0. Analysis → feature inventory → design spec → phase 1 plan
- [x] 1. Monorepo skeleton (Bun, Turbo, Biome, knip, boundaries, config, CI, empty site + mobile)
- [x] 2. Foundations (db, auth, rpc/api, local-store + guest import, styles/brand/i18n, ui-web/ui-native, /dev/ui)
- [x] 3. Learning (gestures, categories, FTS search, favorites, lists, share links; site + mobile)
- [ ] 4. Account, consent, analytics, legal pages, deep links, legacy redirects, maintenance mode
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

## Next

- Phase 2: done. All 9 tasks are merged, and the phase review fix wave (rpc CSRF origin check, /dev/ui staging gate, shared helpers, admin:grant) is on develop.
- Phase 3: done.
- Phase 4: tasks 1–3 are merged (account, analytics, account and consent UI). Task 4 (legal pages, app links, open-in-app, legacy redirects, AppBanner) is in progress; `/privacy` 404s until it lands, so it must merge before any develop → master merge. Then tasks 5 (Turnstile bridge + magic link on mobile) and 6 (maintenance, headers, CSP), and the phase review.
- Carry into the phase 4 plan: a native Turnstile widget (WebView), so mobile email sign-in works with captcha on; magic link on mobile via a universal link; a CSP with a hash for the theme pre-paint script; the `/api/analytics` relay must reject foreign origins with `isForeignRequest` from `@smog/rpc` (spec §7, §12), like `/api/rpc`.
- Carry into the phase 5 plan: admin gesture and category writes must set `sort_name`, reindex FTS and call `bumpCatalogVersion` (the catalog snapshot also serves `gestures.categories`); gesture name ≤ 120. The admin gestures tab gets the QR dialog (inventory L-14's admin half). The admin screens read categories (and gestures) from D1, not through the cached `gestures.categories`, so an admin sees their own edit at once.
- Carry into the phase 6 plan: the sponsor call-to-action on the gesture detail (inventory L-17), from `sponsorships.availability`, on the site and mobile. L-15 (open in app) and L-16 (home app banner) are already phase 4 task 4.
- Carry into phase 4 task 6: the legacy 301s (`apps/site/src/lib/legacy-redirects.ts`) answer in the Worker's `fetch` before Start. If the security-headers middleware lives in Start, wrap the Worker `fetch` so the 301s get HSTS and the other headers too, or accept bare 301s and record it.
- Carry into the phase 6 plan (required before cutover, the privacy text promises it): a scheduled purge that deletes `audit_log` rows older than 3 years and expired `session` and `verification` rows within 30 days of their expiry.
- Carry into phase 8: the Convex → D1 data import must call `bumpCatalogVersion` (and rebuild FTS) when it finishes; otherwise isolates keep serving the old catalog snapshot until they are recycled.
- Carry into phase 8: a CSP `report-to`/`report-uri` endpoint before launch. Staging sends the CSP `Report-Only` with nowhere to report (phase 4 task 6), so it only shows in each browser's console. Add a small same-origin endpoint, rate-limited, that logs (or relays to OpenPanel), or run the csp e2e against staging.
- Carry into phase 8 (staging smoke): a stale admin save returns `CONFLICT` (`stale`), not `INTERNAL`. The catalogue's in-batch guards are recognised by the guard name in SQLite's "bad JSON path" error text, which is verified only in workerd (phase 5 task 2, DECISIONS).
- Carry into phase 8: required secrets and vars checked before deploy, including production `TURNSTILE_SITE_KEY` (var) and `TURNSTILE_SECRET_KEY` (secret); `SITE_URL` per env must be the origin browsers use (the rpc origin check and Better Auth compare against it).
- Carry into phase 8: the Mux secrets join the required list for production (`MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_WEBHOOK_SECRET`; `wrangler secret put --env production`), and the Mux dashboard webhook points at `<SITE_URL>/api/webhooks/mux` with that signing secret. Staging and production use **separate Mux environments** (each its own access token, webhook and signing secret): one shared environment would show staging uploads in the production picker, deliver every event to both endpoints and bill staging's assets as real ones (`test: true` is dev only). Staging has none yet: the admin then offers only a pasted playback id (phase 5 task 3).
- Carry into phase 8 (staging smoke, Mux webhook retries): with staging's Mux webhook set, answer one delivery with a 503 (e.g. unset `MUX_WEBHOOK_SECRET` briefly) and confirm that Mux's retry more than 5 minutes later still verifies, i.e. that Mux signs each attempt with a fresh `t`; if it does not, widen the window for retries or verify `t` against the event's `created_at` (phase 5 task 3, review M6).

## Known gaps

- The legal texts (`/privacy`, `/terms`) need the owner's sign-off before any develop → master merge: `docs/LEGAL-SIGNOFF.md` lists every change from the old pages and the open decisions (effective date, consent history on deletion, renewal price wording).

- Bun is pinned at 1.3.11 (`packageManager`); upgrade when possible (see DECISIONS).
- `SMOG_OFFLINE=1 bun run release:check` (local, no network) degrades three expo-doctor checks; CI runs them online and is the authority.
- The deploy workflow has never deployed: it needs the `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets per GitHub environment (`staging`, `production`), real KV ids and the workers.dev `SITE_URL`s. D1 migrations exist (`packages/db/migrations`, append-only).
- `bun run audit` ignores three moderate advisories (DECISIONS).
- The Playwright `e2e` CI job is a placeholder (off unless `vars.E2E_ENABLED == 'true'`), and the spec's root `test:e2e` script does not exist yet; both come in phase 9.
- `bun -F @smog/site deploy` bypasses turbo. Once workspace packages need a build step, run `turbo run build --filter=@smog/site^...` first (or make deploy a turbo task depending on `^build`).
- knip prints an Expo warning about a missing `userInterfaceStyle` although `app.config.ts` sets it (knip's Expo plugin loads the config its own way); cosmetic.
