# Phase 10, spec 1: brand and design system (draft for approval)

Status: **draft, awaiting the owner's approval.** Part of `docs/superpowers/plans/2026-10-21-phase-10-roadmap.md`; i18n (spec 2) and lessons (spec 3) build on this.

## 1. Goal
The app feels unbranded and sad. Give it a recognisable SMOG identity and rebuild every screen on shadcn/ui (web) and React Native Reusables (mobile), using an existing component or block before writing one. The redesign includes the information architecture (what is where), not only the skin.

## 2. What exists today (survey, 2026-10-21)
- **No shadcn.** The web kit `@smog/ui-web` (35 components plus 14 domain ones) is shadcn-like (Radix, cva, tailwind-merge, lucide) but hand-assembled, with its own API contract that `@smog/ui-native` mirrors (`API.md`, `contract.test.tsx`).
- **Tailwind 4.3.3** on the site and `ui-web`; **Tailwind 3.4.19 + NativeWind 4.2.7** on mobile, by design. React is pinned to 19.2.3 (Expo SDK 57).
- **A closed token theme.** `@smog/styles/src/tokens.ts` is the only place values are written; it generates the Tailwind 4 `@theme` and the Tailwind 3 preset. The theme deletes Tailwind's default scales, so stock shadcn classes (`bg-muted`, `text-sm`, `size-9`) compile to nothing. `classes.test.ts` in both kits fails on off-token classes; `contrast.test.ts` checks the colour roles.
- **Brand today:** green `#00805F`, orange `#EE971C`, a horizontal and a stacked logo, three hand illustrations, Inter in the tokens but **no web font is loaded** (system fallback, CSP allows own origin only). The PDFs use the green "SMOG&CO" logotype with the hands.
- **Screens:** ~25 web pages (home, gestures, gesture detail, favorites, lists, account, auth x7, sponsor x4, admin x13, legal), 14 mobile screens in 4 tabs (Home, Search, Favorites, Lists).
- **Tests bound to markup:** 41 e2e specs, mostly role- and name-based (about 270 `getByRole("button")`); visual snapshots in `e2e/__screenshots__` (all invalidated by a rebrand); perf budgets per route entry (~434 kB gzip shared closure, budgets 503 to 525 kB).

## 3. Decisions to approve
**D1. Adopt shadcn properly.** Add `components.json` and generate the components with the shadcn CLI into `@smog/ui-web` (so upgrades and new blocks come from the registry), instead of keeping the hand-assembled kit. The kit's behaviour contracts (44 px targets, focus ring, state layers, i18n names, reduced motion) are kept by editing the generated components once, in the repo.
**D2. Open the token theme to shadcn's semantic names.** Map our roles onto shadcn's variables (`background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, `radius`, plus `success`/`warning` and the chart/sidebar sets the blocks use) in `tokens.ts`, regenerate, and stop deleting Tailwind's default scales so registry components compile unchanged. `classes.test.ts` is rewritten to enforce the new vocabulary instead of the old closed one. Contrast tests stay and run on the new brand colours.
**D3. Mobile on React Native Reusables** (NativeWind 4 / Tailwind 3 compatible, so it stays on the current stack). Same token source, same names, generated from `tokens.ts`. `ui-native` keeps mirroring `ui-web` where Reusables has the component and gains the Reusables version where it does not exist today.
**D4. Delete what shadcn replaces.** Each hand-rolled component with a shadcn/Reusables equivalent is replaced, not wrapped; hand-written ones remain only where no registry component exists (domain components such as the gesture card and video player, composed from registry parts).
**D5. React stays 19.2.3**; shadcn/Radix versions are chosen to fit (a decision entry if the newest registry code needs newer React).

## 4. Brand identity proposal (for approval)
Built from what already exists so that the app, the PDFs and the logo agree:
- **Colour.** Keep the **SMOG green** as the primary identity colour (`#00805F`, ~AA on white; a deeper `#006B50` for text and pressed states) and the **orange** as a warm accent for highlights only (`#EE971C`; never as text on white). Neutrals shift from the grey-green wash (`#F7F9F7`) to a warmer, softer off-white with a faint green tint, so surfaces feel friendly rather than clinical; dark mode gets a deep green-black. Tokens verified by the contrast tests.
- **Typography.** Self-host a **variable font** (proposal: *Figtree* for UI and body, rounded and highly legible, OFL; display headings in the same family at heavier weight, no second font). Delivered from the Worker's own origin (no CSP change), preloaded, `font-display: swap`, subset to Latin + the accents nl/fr need.
- **Shape and feel.** Larger radii (12 to 20 px) and soft elevation; generous spacing; icons stay lucide (web) / lucide-react-native (mobile).
- **Illustration and imagery.** Use the three hand illustrations as the brand motif (hero, empty states, 404, auth screens, footer, sponsor pages); large video-first gesture cards, because the gesture is the product.
- **Voice.** Friendly, plain Dutch first, same register in fr/en (copy is reviewed in spec 2's translation pass).
- **Logo.** Existing logo and hands stay; add a monochrome and a reversed (white on green) lockup for banners and the PDF header.
The owner approves this section (or sends changes) before D2's tokens are written.

## 5. Information architecture (proposal)
Today: header with Gestures, Favorites, Lists, Sponsor; admin has its own rail. Proposed:
- **Learners (web):** header = logo, Gestures, My space (Favorites + Lists as tabs of one page), Sponsor as a quiet footer/menu link; a prominent search in the header on every page; language and theme in one user/settings menu. Mobile keeps 4 tabs (Home, Search, Favorites, Lists) with the same naming.
- **Home:** hero (brand + big search), categories as image chips, "continue where you left off", featured gestures, one banner slot (course/app), footer with legal.
- **Gesture detail:** video first and large, name overlay, audio button, related gestures, save/favorite, share; teacher-only panel appears for teachers (spec 3).
- **Account:** a settings layout with a side navigation (profile, sign-in methods, preferences, language, privacy, data) instead of one long page.
- **Auth:** one centred card per page using shadcn's authentication blocks; illustrations on a side panel on wide screens.
- **Admin:** shadcn **sidebar block** with collapsible groups (Content: gestures, categories; Community: users, sponsorships; Operations: dead letters, audit, emails, settings); data tables with the shadcn data-table pattern.
- **Teacher area** (spec 3) and **translation screens** (spec 2) get their own sidebar groups, shown by role.

## 6. Screen to block mapping (shadcn blocks and components first)
| Area | Use |
|---|---|
| Auth pages | `login-*` / `signup-*` blocks, `input-otp` for email codes, `alert` for errors |
| Home, gestures | `card`, `carousel`, `badge`, `command` (search palette), `aspect-ratio`, `skeleton` |
| Gesture detail | `tabs`, `card`, `button`, `hover-card` for related, `toggle` for favorite |
| Lists, favorites | `sortable` (keep dnd-kit), `dropdown-menu`, `dialog`, `sheet`, `sonner` toasts |
| Account | `sidebar` settings layout, `form` (react-hook-form + zod), `switch`, `select`, `alert-dialog` |
| Sponsor wizard | `stepper` pattern from blocks, `form`, `radio-group`, `progress`, `table` |
| Admin | `sidebar-*` and `dashboard-*` blocks, `data-table`, `chart`, `breadcrumb`, `pagination`, `sheet` for editors |
| Legal, empty, 404 | `empty` / `typography` pieces with the hand illustrations |
| Mobile | Reusables: button, card, input, tabs, dialog, alert-dialog, select, switch, checkbox, radio-group, progress, skeleton, toast, accordion; bottom sheet stays `@gorhom` |

## 7. Plan (steps, each deployed to staging after review)
1. **Foundations.** Brand tokens in `tokens.ts` (D2), regenerate `theme.css`/preset/email theme, self-hosted font, `components.json`, shadcn init, contrast tests green. No screen changes visible except typography and colour.
2. **Web components swap.** Replace each kit component with the shadcn one in dependency order (button, input, form, dialog ... ); keep the `@smog/ui-web` public API where possible so screens compile; update kit tests and `API.md`; i18n names/a11y contracts re-applied.
3. **Web shell and IA.** App shell (header, search, user menu, footer), home, gestures list and detail, brand illustrations.
4. **Web screens.** Lists/favorites "My space", account settings layout, auth pages, sponsor wizard and pages, legal, errors.
5. **Admin.** Sidebar layout, dashboard, data tables, editors.
6. **Mobile.** Reusables, brand tokens, screens and tabs to the new IA; component gallery updated.
7. **Close.** Screenshots regenerated (390 and 1280, light and dark), e2e specs updated (roles/names kept wherever the copy is unchanged), perf budgets re-measured, `docs` and `DECISIONS` updated, phase review.
Each step: `check:ci`, types, tests, build (perf budgets), e2e shards with CI-matching settings, deploy to staging; owner review of the staging site at steps 3, 4, 5, 6.

## 8. Risks
- **Bundle size.** The shared closure is already ~434 kB gzip against 503 to 525 kB budgets; shadcn components are small but `command`, `carousel`, `chart` and the font are not free. Budgets are re-measured per step; heavy blocks (`chart`, `command`) load lazily.
- **Test churn.** Visual snapshots all change; role/name locators survive only where the copy and structure survive. Budget a day per step for e2e repair.
- **Two Tailwind majors.** Web (4) and mobile (3) keep sharing one token file; Reusables targets NativeWind 4, so no migration is needed now (NativeWind 5 stays deferred).
- **React pin.** Newest shadcn/Radix code must work on React 19.2.3.
- **CSP.** The font is self-hosted so no CSP change; the theme script hash changes only if `SYSTEM_THEME_SCRIPT` changes (it will not).

## 9. Out of scope
Copy rewrites (spec 2), new features (specs 2 and 3), NativeWind 5, a new logo.
