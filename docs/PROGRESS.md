# Progress

Resume here. The spec is `docs/superpowers/specs/2026-09-29-cloudflare-rewrite-design.md`; the feature checklist is `docs/superpowers/specs/2026-09-29-feature-inventory.md`; decisions are in `docs/DECISIONS.md`. The old system is described in `docs/superpowers/analysis/` (read from `origin/master`); the old code can be read with `git show origin/master:<path>` or through a worktree (`git worktree add --detach ../ref-master origin/master`).

Workflow: superpowers by hand (the plugin was unavailable). Plans are in `docs/superpowers/plans/`, one per phase, each written when its phase starts. Execution is subagent-driven: one implementer and one task reviewer per task, and a phase review before each phase is closed.

## Phases

- [x] 0. Analysis → feature inventory → design spec → phase 1 plan
- [x] 1. Monorepo skeleton (Bun, Turbo, Biome, knip, boundaries, config, CI, empty site + mobile)
- [ ] 2. Foundations (db, auth, rpc/api, local-store + guest import, styles/brand/i18n, ui-web/ui-native, /dev/ui)
- [ ] 3. Learning (gestures, categories, FTS search, favorites, lists, share links; site + mobile)
- [ ] 4. Account, consent, analytics, legal pages, deep links, legacy redirects, maintenance mode
- [ ] 5. Admin panel
- [ ] 6. Payments, sponsorships, jobs, emails
- [ ] 7. Render (Remotion, Container, Workflow, Mux upload, wizard preview)
- [ ] 8. Environments (wrangler envs, EAS profiles, deploy workflow) + Convex → D1 migration script
- [ ] 9. Hardening (e2e, a11y, perf, docs, parity audit)

## Log

- 2026-09-29: Phase 0 done. Orphan `develop` branch created. Analysis reports, inventory, spec, DECISIONS and the phase 1 plan committed.
- 2026-09-29: Phase 1 done. Root tooling, `@smog/config` + boundaries, `apps/site` (TanStack Start on Workers, guarded deploy), `apps/mobile` (Expo SDK 57, NativeWind 4), release gate (`bun run release:check` green with `SMOG_OFFLINE=1` here), `ci.yml` and `deploy.yml`.

## Next

Execute `docs/superpowers/plans/2026-09-29-phase-2-foundations.md`, Task 1.

## Known gaps

- Bun is pinned at 1.3.11 (`packageManager`); upgrade when possible (see DECISIONS).
- expo-doctor's schema and React Native Directory checks have only run in CI (network); locally they run with `SMOG_OFFLINE=1`.
- The deploy workflow has never run: it needs the `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets per GitHub environment (`staging`, `production`), real KV ids and the workers.dev `SITE_URL`s. D1 migrations start in phase 2.
- `bun run audit` ignores three moderate advisories (DECISIONS).
- The Playwright `e2e` CI job is a disabled placeholder until phase 9.
