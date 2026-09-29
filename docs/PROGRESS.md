# Progress

Resume here. The spec is `docs/superpowers/specs/2026-09-29-cloudflare-rewrite-design.md`; the feature checklist is `docs/superpowers/specs/2026-09-29-feature-inventory.md`; decisions are in `docs/DECISIONS.md`. The old system is described in `docs/superpowers/analysis/` (read from `origin/master`); the old code can be read with `git show origin/master:<path>` or through a worktree (`git worktree add --detach ../ref-master origin/master`).

Workflow: superpowers by hand (the plugin was unavailable). Plans are in `docs/superpowers/plans/`, one per phase, each written when its phase starts. Execution is subagent-driven: one implementer and one task reviewer per task, and a phase review before each phase is closed.

## Phases

- [x] 0. Analysis → feature inventory → design spec → phase 1 plan
- [ ] 1. Monorepo skeleton (Bun, Turbo, Biome, knip, boundaries, config, CI, empty site + mobile)
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

## Next

Execute `docs/superpowers/plans/2026-09-29-phase-1-monorepo-skeleton.md`, Task 1.

## Known gaps

(none yet)
