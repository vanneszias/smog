# Phase 10a: Brand and design system implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give SMOG a recognisable identity and rebuild every web and mobile screen on shadcn/ui (web) and React Native Reusables (mobile), using an existing registry component or block before writing one, with the information architecture redesigned as the spec describes.

**Spec:** `docs/superpowers/specs/2026-10-21-phase-10-brand-and-design-system.md` (approved by the owner, 2026-10-21). Roadmap: `docs/superpowers/plans/2026-10-21-phase-10-roadmap.md`. Specs 2 (i18n) and 3 (lessons) are separate plans that build on this one.

Phases 0 to 9 are done and deployed to staging (`develop` HEAD at plan time: the roadmap commits on top of `f070828`). Phase 10a changes no business rule and no API.

**Nothing in this phase deploys by hand, and the session has no Cloudflare, Mux, Mollie, EAS or store credentials.** Every push to `develop` deploys staging after CI, so each merge leaves CI green. The owner reviews the staging site after Tasks 4, 5, 6 and 8.

## Owner decisions this plan implements
1. shadcn is adopted properly: the CLI generates the components, our tokens map onto shadcn's variable names.
2. Colour is bold: green is a surface (hero, header, auth screens), orange the accent, neutrals light and warm.
3. Figtree, self-hosted, for UI, body and headings.
4. Web navigation: Favorites and Lists merge into **My space**; Sponsor moves to the footer and menu. Mobile keeps its four tabs.

## Rulings made for this plan
These go into `docs/DECISIONS.md` with the task that implements them.
1. **Alias period.** `tokens.ts` gains shadcn's names (`background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, `radius`, plus `success`, `warning`, `sidebar-*`, `chart-*`) as the **new vocabulary**; the current role names (`surface`, `surface-raised`, `primary-strong`, `danger`, ...) stay as aliases until Task 9 removes them, so unmigrated screens keep compiling and looking right. The class guard test accepts both until Task 9, then only the new.
2. **Tailwind's default scales return on the web** (Tailwind 4: delete the `--spacing-*`, `--text-*` and similar resets in `theme.css` generation) so registry code compiles unchanged. The mobile Tailwind 3 preset follows the same names and scales where NativeWind supports them.
3. **Generated components are ours.** shadcn output is committed into `@smog/ui-web`; we edit it once to keep the kit contracts (44 px targets, the 2 px focus ring, state layers, i18n names from `@smog/i18n`, reduced motion, `className` merged last, React 19 `ref` prop). Re-running the CLI is a conscious update recorded in DECISIONS, never automatic.
4. **Public API first.** `@smog/ui-web` keeps its exported names and props while its internals change, so screens compile after the component swap (Task 2 and 3); screens move to registry vocabulary only where a block is used (Tasks 4 to 6).
5. **Heavy blocks are lazy.** `command`, `chart`, `carousel` and any block over ~10 kB gzip load on demand; `perf-budget.json` budgets are re-measured per task and never loosened without a DECISIONS entry.
6. **React stays 19.2.3** and `radix-ui` stays the unified package at the version the lockfile resolves, unless a registry component needs newer (a DECISIONS entry then).
7. **Font delivery.** Figtree variable (woff2, Latin and Latin Extended subset covering nl, fr, en), served from the Worker's static assets with a long-cache hashed name, preloaded from the root route, `font-display: swap`, `size-adjust` fallback to avoid layout shift; no CSP change. The render container's overlay font (Inter 600, a render contract) is unchanged.
8. **Brand assets regenerate.** `bun -F @smog/brand generate` and `bun -F @smog/styles generate` produce every committed output (favicon, icons, OG, email logo, mobile icons, email theme); the existing drift tests stay and the outputs change deliberately in the task that changes the colours.
9. **Visual snapshots are regenerated, not patched,** once per user-visible task; the task report lists the changed specs and why.

## Global constraints (every task)
- Read `AGENTS.md`, the spec, and `docs/DECISIONS.md` (the UI entries: kit API, tokens, a11y contracts, perf budgets).
- TDD where logic exists; for generated/visual work, the guards are the tests: `classes.test.ts` (both kits), `contrast.test.ts`, drift tests, the kit `contract.test.tsx`, the `a11y-*` e2e shards, `perf-budget.json`.
- `check:ci`, `check-types`, `bun run test`, `build` (deploy guard with budgets), `knip`, `boundaries`; staging `deploy:dry` hash must be unchanged from `5c706b1c16adc89e253bdeaa5d73c1c36b1bbf1438aece8f0ba9799e66fc30bb`.
- E2E: the affected Playwright projects one at a time on a fresh D1 with CI-matching settings (AGENTS.md "E2E locally, the way CI runs it"); every task that changes markup runs all seven before it hands back. No `waitForTimeout`.
- No new `Bun.*` in Worker code; the 44 px, focus-ring, motion, contrast and i18n-name contracts hold on every new component.
- Copy stays in `@smog/i18n`; new strings are added in nl, fr and en together (spec 2 later moves them to D1).
- Container restarts kill agents every ~30 to 45 minutes: checkpoint to a state file, write the draft report first, commit in small steps.
- Each task appends its own `## ... (phase 10a task N)` section as the last block of `docs/DECISIONS.md` and writes `task-N-report.md` (draft first).

## Review focus (every task reviewer)
Behaviour regressions (a screen that lost a state: loading, empty, error, offline), accessibility contract regressions (axe, keyboard, reflow at 320 px and 200 % text, contrast on the green surfaces), tokens used outside the vocabulary, off-registry hand-rolled components where a registry one exists, bundle growth, copy lost from i18n, tests deleted rather than updated.

## Tasks

### Task 1: Foundations: tokens, font, brand assets, shadcn init
**Files:** `packages/styles/src/tokens.ts`, `generate-web.ts`, `generate-native.ts`, `contrast.ts` and tests, generated outputs; `packages/ui-web/components.json` (new), `packages/ui-web/src/lib/cn.ts`, `styles.css`; `apps/site/public/fonts/*`, `apps/site/src/routes/__root.tsx` (preload), `apps/site/src/styles.css`; `packages/brand/*` (reversed and monochrome lockups, recolour).
**Behaviour:**
1. **Colour system** per the spec: green primary with a deeper green for text and pressed, orange accent, warm tinted neutrals, a deep green-black dark mode, and **green surface roles** (`primary` used as `bg-primary` with `primary-foreground` white; `sidebar` set) for the header, hero and auth; all pairs added to `contrast.ts` (AA for text, 3:1 for UI) including text on green and green on warm neutral. The shadcn vocabulary is added with the old names as aliases (ruling 1).
2. **Tailwind defaults return** on the web theme (ruling 2); both kits' `classes.test.ts` accept the new vocabulary and the alias names.
3. **Figtree** self-hosted and preloaded (ruling 7); `--font-sans` points at it; the CLS spec still passes.
4. **shadcn init:** `components.json` (style, base colour, aliases to `@/` or the kit paths, `lib/cn`), the CLI run once to confirm generation works offline from the registry or the pinned copy; if the sandbox cannot reach the registry, vendor the needed component sources and record the registry commit in DECISIONS.
5. **Brand outputs:** reversed (white on green) and monochrome logo lockups; the favicon, icons, OG image, email logo and mobile icons regenerate; the email theme follows the new colours.
**Acceptance:** all drift and contrast tests green with the new values; the site renders with Figtree and the new palette (typography and colour change, layout unchanged); e2e `a11y` shards green; screenshots regenerated; budgets re-measured.
**Parallel with:** nothing (every later task depends on it).

### Task 2: Web primitives swap (shadcn components into `@smog/ui-web`)
**Files:** `packages/ui-web/src/components/*`, `src/index.ts`, `API.md`, per-component tests, `apps/site/src/dev/ui-gallery*.tsx`.
**Behaviour:** replace, in dependency order, each hand-rolled or hand-wrapped primitive with the shadcn generated component edited for our contracts (ruling 3), keeping exported names and props (ruling 4): button, input, textarea, label/field, checkbox, radio-group, switch, select, tabs, tooltip, dialog, alert-dialog, sheet, dropdown-menu (menu), toast (**sonner**, replacing the Radix toast: provider, a11y live region, i18n), badge, card, avatar, progress, skeleton, table, pagination, breadcrumb, separator, scroll-area, accordion, alert, `input-otp` and `form` (react-hook-form + zod resolver on top of the existing `useFieldControl` behaviour where a screen uses it). Additions: `command` (search palette, lazy), `carousel` (lazy), `toggle`/`toggle-group`, `hover-card`, `sidebar`, `collapsible`, `aspect-ratio`. Hand-rolled stay only where no registry component exists (`stepper`, `chip`, `offline-banner`, `empty-state` composed from registry parts). The gallery (`/dev/ui`) shows every component, light and dark, green surfaces included.
**Acceptance:** every kit test, `contract` expectations and `API.md` updated; axe on the gallery clean; no screen changes behaviour; bundle budgets re-measured (lazy where needed).
**Parallel with:** Task 7 (mobile) once Task 1 has merged.

### Task 3: Domain components and shared screens' parts on the new primitives
**Files:** `packages/ui-web/src/domain/*` (gesture card, grid, row, parts, category chips, search results, favorite button, list picker, share link, video player, banners, consent banner), `apps/site/src/components/learning/*`, `app-shell/*` pieces that are shared.
**Behaviour:** rebuild each domain component from registry parts and the brand: **video-first gesture cards** (large poster, name, favorite, category badge), category chips with image/icon, the video player frame, banners on the green surface, the consent banner as a registry `card`/`alert`; hand illustrations (`@smog/brand/svg`) as the brand motif for empty states, errors, the 404 and auth side panels; the `command` palette as the global search (keyboard `/`, results grouped).
**Acceptance:** `dev-ui-domain` gallery and its e2e updated; axe, keyboard, reflow specs green; budgets.
**Depends on:** Task 2.

### Task 4: Web shell, navigation, home, gestures (owner review on staging)
**Files:** `apps/site/src/components/app-shell/*`, `routes/__root.tsx`, `routes/index.tsx`, `routes/gestures/*`, `components/learning/*`, footer.
**Behaviour:** header on the green surface (logo reversed, Gestures, **My space**, search trigger, one user/settings menu with language and theme); **Sponsor** moves to the footer and the user menu; the route `/favorites` and `/lists` redirect (302) into **My space** (`/my` with Favorites and Lists as tabs; a guest keeps the local store); home = hero (brand, big search), image category chips, "continue where you left off" (recent gestures from the local store), featured gestures, one banner slot, footer with legal; gesture list = filters in a sheet on mobile widths, result grid; gesture detail = large video, name, related, save/favorite/share, QR. `perf-budget.json` gains entries for new routes, re-measured; `routes-parity.spec.ts` updated for the moved routes.
**Acceptance:** specs `shell`, `home`, `gestures`, `a11y-public`, `a11y-landmarks`, `a11y-keyboard`, `a11y-reflow` updated and green; screenshots regenerated; sitemap/manifest unaffected; legacy URLs redirect.
**Depends on:** Task 3. **Owner reviews staging after this task.**

### Task 5: Web screens: My space, account, auth, sponsor, legal, errors
**Files:** `routes/my*.tsx` (new), `routes/account.tsx` and `components/account/*`, `routes/sign-in` and the other auth routes and `components/auth/*`, `routes/sponsor/*` and `components/sponsor/*`, `routes/privacy.tsx`, `terms.tsx`, `legal-page.tsx`, the root 404/error pages.
**Behaviour:** **My space** with tabs (Favorites, Lists, Shared by me), lists keep dnd-kit reorder, share and QR; **account** as a settings layout with a side navigation (profile, sign-in methods, preferences, language, privacy and data); **auth** pages on the shadcn authentication blocks, centred card, green/illustrated side panel on wide screens, `input-otp` for email codes, Turnstile unchanged; **sponsor** wizard on registry `stepper`-style progress, `form`, `radio-group`, `table`; legal pages with typography and a table of contents; error, 404 and empty states with the hand illustrations.
**Acceptance:** every spec of these areas updated (`account`, `auth`, `sponsor*`, `lists`, `favorites`, `legal`, `a11y-signed-in`, `a11y-keyboard`); screenshots; budgets.
**Depends on:** Task 4. **Parallel with:** Task 6.

### Task 6: Admin on the sidebar and dashboard blocks
**Files:** `routes/admin.tsx` and `routes/admin/*`, `components/admin/*`.
**Behaviour:** the shadcn **sidebar** layout (collapsible groups: Content: gestures, categories; Community: users, sponsorships; Operations: dead letters, audit, emails, settings; the groups for spec 2 and 3 are added later), breadcrumbs, `dashboard` cards and a lazy `chart` for the dashboard, the shadcn **data-table** pattern (sort, filter, pagination, row actions, column visibility) for gestures, users, sponsorships, audit, dead letters, `sheet` for editors, `alert-dialog` for destructive actions; existing behaviours (Mux upload and picker, optimistic concurrency `CONFLICT`, audit, maintenance) are unchanged.
**Acceptance:** every `admin-*` spec updated and green (including the serial maintenance window and `admin-a11y`), screenshots, budgets (the admin entry stays under its budget).
**Depends on:** Task 4. **Parallel with:** Task 5.

### Task 7: Mobile foundations and primitives on React Native Reusables
**Files:** `packages/ui-native/src/components/*`, `lib/*`, `API.md`, `contract.test.tsx`, tailwind preset (generated from `tokens.ts`), `apps/mobile/tailwind.config.js`, `theme-root.tsx`, fonts (Figtree via `expo-font`), `apps/mobile/src/components/dev/component-gallery*`.
**Behaviour:** generate the Reusables components that exist (button, card, input, label, badge, tabs, dialog, alert-dialog, select, switch, checkbox, radio-group, progress, skeleton, accordion, toggle, separator, avatar, tooltip/popover where available, toast) on NativeWind 4 / Tailwind 3 with the same token names (ruling 1, mobile side of ruling 2); keep what Reusables lacks (bottom sheet on `@gorhom`, menu as the action sheet, stepper); apply the brand (Figtree, green header surfaces, new icons and splash from Task 1's outputs); `contract.test.tsx` parity with `ui-web` updated; the component gallery shows everything light and dark.
**Acceptance:** jest suites and the a11y audit helper green; `mobile:release-check` (offline lanes) green; both exports build; bundle sizes within their limits.
**Depends on:** Task 1. **Parallel with:** Tasks 2 to 6 (different packages; conflicts only in `tokens.ts` and DECISIONS).

### Task 8: Mobile screens and tabs (owner review of a staging build when possible)
**Files:** `apps/mobile/app/**`, `apps/mobile/src/components/**`.
**Behaviour:** the four tabs keep their names (Home, Search, Favorites, Lists) on the new IA and brand: home hero and categories, search with the command-style results, video-first gesture screen, lists and favorites, auth and settings screens on the new components; the sign-out confirmation, consent sheet, offline banner and app-variant badge keep their behaviour.
**Acceptance:** `screens.test.tsx`, `a11y.test.tsx`, `a11y-source.test.ts` updated and green; both platform exports; the owner's real-device and screen-reader pass stays an owner action.
**Depends on:** Tasks 4 (IA) and 7.

### Task 9: Close: remove the aliases, regenerate, document, phase review
**Files:** `tokens.ts` (aliases removed), both `classes.test.ts`, screenshots, `docs/*`, `AGENTS.md`, spec amendments, `scripts/docs-check.test.ts`.
**Behaviour:** remove the alias names and migrate stragglers; the class guards accept only the new vocabulary; every screenshot regenerated at 390 and 1280, light and dark; budgets re-measured and recorded; the three-times full e2e on a fresh D1 per project; `SMOG_OFFLINE=1` release lanes run separately; `AGENTS.md` (the UI kit section, the shadcn update procedure, the font), README screenshots, `docs/PROGRESS.md` (phase 10a done, the owner review items), the spec's section amendments; then the whole-phase review and its fix wave.
**Acceptance:** all lanes and the seven e2e shards green on CI; `docs-check` green; staging deploy green.
**Depends on:** Tasks 5, 6 and 8.

## Parallelism
Task 1 alone. Then Task 2 and Task 7 together; Task 3 after Task 2; Task 4 after Task 3; Tasks 5 and 6 together after Task 4; Task 8 after Tasks 4 and 7; Task 9 last. At most two implementers at once (the e2e shards and the 2-CPU runners are the bottleneck); merge conflicts are expected only at the end of `docs/DECISIONS.md` and `tokens.ts` and are resolved by keeping both sides.

## Open risks
- **Bundle size** is the tightest constraint (about 434 kB gzip shared closure against 503 to 525 kB budgets); lazy blocks and per-task measurement are the mitigation, a budget increase needs a DECISIONS entry.
- **E2E churn** is large: about 270 role/name locators and all screenshots; each task owns its specs.
- **Registry access** from the sandbox is unverified (Task 1 step 4); the fallback is vendoring pinned sources.
- **Reusables on NativeWind 4** works with Tailwind 3 today; NativeWind 5 stays deferred.
- **Green surfaces and contrast:** text on `#00805F` passes AA for white only above a size/weight threshold; Task 1 sets the pairs in `contrast.ts` before any screen uses them.

## Review dispositions
(filled in by the plan review)
