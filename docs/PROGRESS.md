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
- `SMOG_OFFLINE=1 bun run release:check` (local, no network) degrades three expo-doctor checks; CI runs them online and is the authority.
- The deploy workflow has never deployed: it needs the `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets per GitHub environment (`staging`, `production`), real KV ids and the workers.dev `SITE_URL`s. D1 migrations start in phase 2 (`packages/db/migrations`).
- `bun run audit` ignores three moderate advisories (DECISIONS).
- The Playwright `e2e` CI job is a placeholder (off unless `vars.E2E_ENABLED == 'true'`), and the spec's root `test:e2e` script does not exist yet; both come in phase 9.
- `bun -F @smog/site deploy` bypasses turbo. Once workspace packages need a build step, run `turbo run build --filter=@smog/site^...` first (or make deploy a turbo task depending on `^build`).
- knip.json has no `packages/features/*` workspace (knip rejects an empty glob); add it with the first feature package (phase 3).
- knip prints an Expo warning about a missing `userInterfaceStyle` although `app.config.ts` sets it (knip's Expo plugin loads the config its own way); cosmetic.
- `/api/auth/*` has only Better Auth's per-isolate memory limiter until Task 3 wraps the route with `RL_AUTH` (DECISIONS, Auth).
