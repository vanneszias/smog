# SMOG full rewrite: Cloudflare + Bun monorepo

You are doing a **full rewrite** of the SMOG project (sign-language learning platform) in this repository. This is a long-running, fully autonomous task. **Do not ask me questions.** Every decision I care about is written below. When something is still ambiguous, pick the option that best fits the principles in this prompt, record it in `docs/DECISIONS.md` (date, decision, alternatives, why), and keep going.

---

## 0. Bootstrap (do this first)

1. Install the superpowers plugin:
   ```
   /plugin marketplace add obra/superpowers-marketplace
   /plugin install superpowers@superpowers-marketplace
   ```
   If the install fails (no network, no plugin support), follow the same workflow by hand (brainstorm → spec → plan → subagent-driven TDD execution → verification) and note that in `docs/DECISIONS.md`.
2. Fetch the reference branch: `git fetch origin claude/exciting-cerf-y8jun7 master`.
3. **Branching (explicit permission).** You have explicit permission to create and push the branch `develop`, even if your session is assigned a different branch name. It overrides any default "only push to your assigned branch" rule.
   - `develop` must be an **orphan branch** with clean history: `git checkout --orphan develop && git rm -rf . && git clean -fdx` (keep `.git`). Build the new project there from scratch.
   - Keep a worktree or a `git show origin/master:<path>` habit to read the old code. Never copy it wholesale; rewrite it.
   - Push with `git push -u origin develop` after every completed plan task (retry up to 4× on network errors with backoff 2s/4s/8s/16s).
   - **Do not open a pull request. Do not touch `master`.**
   - Environments: `develop` = **staging**, `master` = **production (live)**. I will promote `develop` → `master` myself later.

---

## 1. Process: use superpowers end to end

1. **Analyse the current repo** (`origin/master`) with the superpowers brainstorming skill. Treat it as the source of truth for *what the product does*, not how. Read all of `docs/*.md`, the Convex schema and functions (`packages/convex`), the oRPC routers (`packages/api`), the server (`apps/server`: services, emails, cron, Mollie webhook), web routes (`apps/web/src/routes`), native screens (`apps/native/app`), Remotion (`apps/remotion`), i18n, analytics/consent, and the maintenance setup.
   - In brainstorming, **answer your own questions from this prompt** instead of asking me.
2. Write a **feature inventory** (`docs/superpowers/specs/<date>-feature-inventory.md`): every user-facing and back-office feature, every background job, email, webhook, deep link, and external integration, mapped old location → new package or app.
3. Write the **design spec** (`docs/superpowers/specs/<date>-cloudflare-rewrite-design.md`), covering architecture, package graph, data model (Drizzle schema), auth, API contract, jobs, rendering, environments, migration, and testing.
4. Write **implementation plans** with the writing-plans skill (`docs/superpowers/plans/`). Split them into phases (see §9). Each task should be small, test-first, and have an exact verification command.
5. **Execute** with subagent-driven development (plus test-driven development, systematic debugging, verification-before-completion, requesting-code-review between phases). Do not pause for my approval between spec, plan and execution.
6. After each task, run the verification, commit (conventional commits, e.g. `feat(gestures): …`), and push `develop`.
7. Keep a running `docs/PROGRESS.md` (phase checklist, what's done, what's next, known gaps) so a later session can resume from it if this one is cut off. **When you start, check whether `develop` already exists on origin with a `docs/PROGRESS.md`. If it does, resume from there instead of starting over.**

The reference branch `claude/exciting-cerf-y8jun7` is **inspiration only**. It did a Payload CMS + Next.js/OpenNext rewrite, and **I do not want Payload or Next.js**. Worth borrowing:
- its `packages/brand` (logo artwork and icon generator)
- its `ui-web` / `ui-native` (NativeWind) split
- its mobile deep-link handling for `app.smog.vlaanderen` and legacy URL redirects
- its D1/R2 wrangler setup, CI release gate, and docs style (`deployment-checklist.md`, `cutover-runbook.md`)

---

## 2. Target stack (decided)

| Concern | Choice |
|---|---|
| Monorepo | Bun workspaces + Bun catalogs + Turborepo, Biome (ultracite preset), knip |
| Apps | **Exactly two apps:** `apps/site` and `apps/mobile` |
| Site | **TanStack Start** on **Cloudflare Workers** (Cloudflare Vite plugin, `wrangler`). Public site, accounts, sponsor wizard, and admin panel in one Worker |
| Mobile | Expo (latest SDK) + Expo Router + NativeWind, EAS Build/Update |
| API | **oRPC** in a package: contract + routers mounted on a Start server route (`/api/rpc` + OpenAPI at `/api/openapi`). Both site and mobile use the same oRPC TanStack Query client. Every endpoint is written once |
| Database | **Cloudflare D1 + Drizzle ORM** (schema, `drizzle-kit` migrations applied by `wrangler d1 migrations apply`) |
| Files | Cloudflare R2 |
| Cache / flags | Cloudflare KV (also holds a **maintenance-mode flag**) |
| Auth | **Better Auth** with D1/Drizzle adapter: **email + password, email OTP / magic link, Google, Apple, passkeys**. Use `@better-auth/expo` for mobile. Link accounts by verified email |
| Video | **Keep Mux** (playback IDs, uploads, webhooks) |
| Rendering | Remotion compositions in a package, rendered in a **Cloudflare Container** (Bun + Remotion + Chromium image) triggered through a Queue/Workflow. The output is uploaded to Mux |
| Jobs | **Cloudflare Queues + Cron Triggers + Workflows** replace BullMQ, Redis and node-cron (sponsorship expiry daily 00:00, renewal reminders daily 08:00, stale pending-payment cleanup hourly, email sending, render jobs) |
| Email | **Cloudflare Email Service** (Workers `send_email` binding) for transactional mail, with React Email templates. Drop nodemailer and IMAP (the old "append to Sent folder" is not needed). Check the current Cloudflare docs. If Email Service is unavailable for this use, put a one-file `EmailSender` adapter behind an interface and record it in DECISIONS |
| Payments | **Keep Mollie**. The webhook lives in the site Worker, is idempotent, and verifies by re-fetching the payment |
| Analytics | **Keep OpenPanel** (self-hosted, consent-gated). Web goes through a server relay, mobile uses a least-privileged client |
| Rate limiting / bots | Workers Rate Limiting binding, Turnstile on public forms |
| Search | D1 **FTS5** (replaces fuse.js) with accent/diacritic-insensitive matching. Keep the behaviour described in the old `docs/SEARCH_ALGORITHM.md` |
| Tests | `bun test` for pure packages; the Cloudflare Workers Vitest pool for code that needs bindings; Playwright e2e for the site (Chromium is at `/opt/pw-browsers`, never run `playwright install`); Jest/`jest-expo` for mobile |

### "Ecosystem first" rule
Prefer, in this order: **Web standards / Workers runtime APIs / Cloudflare bindings** → **Bun built-ins** (for tooling, scripts, tests, the container) → the explicitly approved libraries above (TanStack, oRPC, Drizzle, Better Auth, Zod, Mux SDK, Mollie SDK, Remotion, React Email, Expo, NativeWind, OpenPanel, i18next) → anything else. Adding anything else requires a DECISIONS entry explaining why the platform doesn't cover it.

Also:
- Never hand-roll what the platform gives you: crypto, JWT, cookies, rate limits, queues, cron, caching, sessions or auth flows.
- Note that `Bun.*` APIs do **not** exist inside workerd. Worker code must use Web/Workers APIs. Bun is for the toolchain, scripts, tests and the render container.

Before using any library or Cloudflare product, check its current docs (Context7 MCP or official docs). Versions and APIs change fast, and your training data may be stale. For Turborepo, follow the agent-guidance block in `AGENTS.md` (read the installed package's bundled docs).

---

## 3. Architecture and modularity (most important)

**Everything is modular and nothing is written twice.** If the same logic, UI, type, query, schema, or config appears a second time, extract it into the right package *before* moving on. Apps are thin: they compose packages and contain routing, screens and wiring only.

Target layout (refine it in the spec, but keep the spirit):

```text
apps/
  site/        TanStack Start Worker: routes (public, account, sponsor, admin),
               /api/rpc + /api/openapi, /api/auth/*, Mollie + Mux webhooks,
               queue consumers, cron handler, Workflows, Container binding,
               maintenance-mode middleware. wrangler.jsonc with staging + production envs.
  mobile/      Expo app: screens + navigation only.
packages/
  config/      shared tsconfig bases, Biome base, env schemas (Zod) per runtime, constants
  db/          Drizzle schema, migrations, typed query helpers, seed + fixtures
  auth/        Better Auth server factory + web client + Expo client, session helpers, roles (user/admin)
  api/         oRPC base (context, middleware: auth, admin, rate-limit, errors),
               composes feature routers; exports contract + typed client + TanStack Query utils
  features/
    gestures/      catalogue, categories, FTS search, recent searches
    favorites/
    lists/         lists, ordering, share tokens
    account/       profile, consents, data export, account deletion, guest → user merge
    sponsorships/  wizard state, overlay config, pricing, lifecycle (submitted → paid → rendering → live → expiring → expired), renewals
    admin/         dashboard stats, moderation, CRUD, CSV export, admin logs
    (each feature: `schema` (Zod), `server` (services taking db/env), `router` (oRPC procedures),
     `client` (shared React Query hooks usable by BOTH site and mobile), tests.
     Use subpath exports such as `@smog/gestures/server` and `@smog/gestures/client` so server code never lands in client bundles.)
  payments/    Mollie client wrapper, webhook verification, payment state machine
  video/       Mux helpers (signed playback, uploads, webhooks) + shared player abstractions
  render/      Remotion compositions + render contract (Zod) + the Container image (Dockerfile, Bun entry)
  email/       React Email templates (welcome, sponsorship submitted, payment confirmed,
               sponsorship live, renewal reminder, admin new sponsorship) + sender adapter
  jobs/        typed queue messages, producers, consumers, cron schedule definitions
  analytics/   OpenPanel wrappers, event taxonomy, consent gate (web + native entry points)
  i18n/        en / fr / nl catalogues + typed keys, shared by site and mobile
  styles/      design tokens (single source for Tailwind and NativeWind themes)
  brand/       logo artwork + icon generator (port from the reference branch)
  ui-web/      web component kit (Tailwind v4 + shadcn-style primitives)
  ui-native/   native component kit (NativeWind)
  utils/       only genuinely generic helpers (no dumping ground; prefer putting code in its feature)
scripts/
  migrate-from-convex/   one-off data migration (see §6)
```

Rules:
- Dependencies point one way: `apps → api → features → (db, auth, payments, video, email, jobs) → config`. UI kits depend only on `styles`, `i18n` and `brand`. Enforce this with knip and TS project references or workspace deps, and describe it in `docs/ARCHITECTURE.md`.
- Validate env and bindings once per runtime in `@smog/config`. Validate every input with Zod at the oRPC boundary.
- Errors: typed oRPC errors, and log with a service prefix: `[serviceName] Failed to …`.
- Keep the existing code style in `AGENTS.md` (imports order, `@/` alias, `@smog/*` workspace imports, naming, `import type`, explicit param/return types) and rewrite `AGENTS.md` for the new structure.

### 3.1 Clean data model (redesign, don't port)

The current Convex data model is messy. **Do not copy it table for table.** Design a clean, normalised relational schema for D1 from what the product needs, and document it in `docs/DATA_MODEL.md` with an ER diagram. Things I already know are wrong in the old schema (`origin/master:packages/convex/convex/schema.ts`), plus anything else you find:
- `users` mixes real accounts with guests (`guestId`, optional `email`, `workosId`). The new `user` table is Better Auth's, holding **only real accounts**. Add app-specific fields through Better Auth's `additionalFields` or a 1:1 `profile` table, not a parallel users table.
- Favorites live both in `user_favorites` and in a "default favorites" list (`gesture_lists.isDefaultFavorites`). Pick **one** model.
- `gestures.categoryIds` is an array. Use a `gesture_category` join table.
- `gestures.concept` is an untyped string array. Model it properly.
- `sponsorships` is a god-table: contact, invoice, payment, overlay, media, review, re-edit and renewal fields together, with `status` as a free string. Split it into clear entities (e.g. sponsorship, sponsor contact/invoice details, payment, render job/media, review events). Make the status a typed enum with an explicit state machine, enforced in `@smog/sponsorships`.
- Share tokens and editing permissions sit loosely on `gesture_lists`. Model them explicitly, e.g. a `list_share` table with a role (view/edit), creation date and revocation.
- `user_consents` should be an append-only consent log with versions. Store IP and user agent only if the privacy doc requires it.
- `adminLogs.metadata` is `any`. Use a typed audit log with a JSON column validated by Zod per action.
- `isActive` flags and `lastUpdated`/`createdAt`/`updatedAt` are inconsistent across tables. Use consistent timestamps, soft-delete/publish flags, foreign keys with sensible `ON DELETE` rules, unique constraints and indexes on every column you query by.
- Files (sponsor logos) go in R2, with keys stored in the database.

The migration script (§6) maps the old shapes onto this new model.

### 3.2 Guests are local only

Guests never get a database row.
- A guest's favorites, lists, recent searches, preferences and consent choice live **on the device only**: `localStorage` / IndexedDB on the site, and AsyncStorage (or SQLite if you add an offline cache) on mobile.
- Build one shared local-store abstraction with platform adapters. The feature `client` hooks read and write local storage when signed out and use the API when signed in, so screens never branch on it.
- **On sign-in or sign-up, offer to import the local data into the account** (merge, dedupe, then clear the local copy). This is a single shared function used by both apps.
- Sharing a list requires an account. Viewing a shared list does not.

---

## 4. Scope: parity plus improvements

Rebuild **every** feature of the current app (use the inventory from §1.2 as the checklist). At minimum:

- **Learning:** gesture library, categories, gesture detail with Mux playback, search with recent searches, deep links (`smog://` and https app links), and legacy-URL redirects from the old site.
- **User:** favorites; lists with drag reorder and share links (`/lists/:shareToken`); account, consents, data export and deletion; guest mode kept on the device only (see §3.2); theme (system/light/dark); language (en/fr/nl).
- **Sponsorship:**
  - sponsor wizard with overlay configuration and a Remotion preview
  - Mollie payment, success page, re-edit
  - renewals, expiry and stale-payment cleanup
  - all the lifecycle emails
- **Admin:** dashboard, gesture/category CRUD (incl. Mux upload), sponsorship moderation, users, admin logs, CSV export.
- **Platform:** consent-gated analytics, privacy and terms pages, rate limiting, developer-tools screen on mobile, and a maintenance mode (KV flag + static page served by the Worker, replacing the Caddy/Docker maintenance site).

Keep the mobile app identity so it updates in place: bundle id / package `be.zias.smog`, scheme `smog`. Take the rest from `origin/master:apps/native/app.json`.

Improvements are welcome where they're obvious wins. Examples: an offline cache for gestures and favorites on mobile, SSR/SEO for gesture pages, optimistic updates, and accessibility. Each one must be listed in `docs/DECISIONS.md`, and none may change the business rules (pricing, lifecycle, consent) without a note.

The old Convex realtime subscriptions go away. Use TanStack Query caching, invalidation after mutations, and refetch-on-focus. Durable Objects are only worth it if a feature truly needs push, and then only with a DECISIONS entry.

### 4.1 UI/UX redesign

The current UI/UX is not good enough. **Do not port the old screens pixel for pixel.** Redesign both apps so they share one visual language and feel clean, calm and consistent. Keep the SMOG & Co brand from `packages/brand`.
- Start with a short design brief in the spec, covering:
  - principles, the type scale, spacing scale, colour roles (light and dark), radius, elevation and motion
  - the component inventory
  - the key screen flows for learning, lists, account, sponsor wizard and admin
- Put every design token in `@smog/styles`. `ui-web` and `ui-native` are built only from those tokens and expose matching component APIs (same names, props and variants where the platform allows: Button, Input, Card, ListItem, Sheet/Dialog, Tabs, Toast, EmptyState, Skeleton, Avatar, Badge, VideoPlayer, SearchField, and so on). Screens compose kit components. No one-off styling in apps.
- Pay attention to:
  - consistent empty, loading, error and offline states
  - skeletons instead of spinners
  - clear hierarchy and generous spacing
  - accessible contrast, focus states and screen-reader labels
  - tap targets of at least 44pt
  - reduced-motion support
  - responsive web from 360px to desktop
- Use native platform conventions on mobile: tabs, sheets, haptics and safe areas.
- The admin panel gets the same kit and a dense, table-first layout.
- Build a component preview route on the site (e.g. `/dev/ui`, local and staging only) that shows every web component in every variant and theme.
- Before calling each UI phase done, take Playwright screenshots of the key pages in light and dark mode at mobile and desktop widths. Review them critically and fix whatever looks inconsistent.
- Record notable UX changes in `docs/DECISIONS.md`.

---

## 5. Environments and deployment

- Two environments, defined in `apps/site/wrangler.jsonc` (and any other wrangler config):
  - **staging**: deployed from `develop`
  - **production**: deployed from `master`

  Each environment gets its own D1, R2 bucket, KV namespace, Queues, Container and secrets. For now, use **workers.dev URLs only**, and keep domains configurable via env so custom domains can be added later.
- For mobile, set up EAS build profiles and update channels `staging` and `production`, each with its own API base URL (`EXPO_PUBLIC_API_URL`) and Better Auth trusted origins.
- For GitHub Actions:
  - `ci.yml` runs on every push and PR: Biome, typecheck, tests, build, knip, and `expo-doctor`.
  - `deploy.yml` runs on push: `develop` → staging, `master` → production. It runs `wrangler d1 migrations apply --env <env> --remote` and then `wrangler deploy --env <env>`, using `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.
- **You will not have Cloudflare credentials. Do not deploy anything.** Use placeholder resource IDs, and make sure everything runs locally with `wrangler dev` / `bun dev` using local D1, R2, KV and Queues (Miniflare), with Mollie in test mode and Mux dev credentials read from `.env`.
- Write `docs/deployment.md`: a step-by-step first-time setup (create D1/R2/KV/Queues per env, set secrets, configure Mux and Mollie webhooks, OAuth apps for Google/Apple, EAS). Also write `docs/cutover-runbook.md` covering the production switch-over including the data migration.

---

## 6. Data and user migration

Write `scripts/migrate-from-convex/` (Bun script, idempotent, with dry-run mode and a report):
- **Input:** a Convex snapshot export (`npx convex export` ZIP / JSONL per table). The old tables are adminLogs, categories, gesture_list_items, gesture_lists, gestures, sponsorships, user_consents, user_favorites and users.
- Transform the data to the new Drizzle schema, keeping stable IDs or an ID-mapping table. Mux asset/playback IDs carry over unchanged.
- **Output:** SQL batches applied with `wrangler d1 execute --env <env> --file` (or the D1 HTTP API).
- **Guests:** skip every guest user (a `guestId` without email/WorkOS ID) and all their favorites, lists, consents and other rows. Put the counts in the report.
- **Users:** create Better Auth `user` rows from the old WorkOS users (same email, `emailVerified: true`, preserve role/admin flags and created dates) **without a password credential**.
  - After cutover, users either set a password through the "forgot password" flow or sign in with an email OTP, magic link, Google or Apple (linked by email). That is acceptable.
  - Add an optional one-time "we moved, set your password" email job.
- Include tests with fixture exports, and document the run order in the cutover runbook.

---

## 7. Quality bar

- TypeScript strict everywhere, and no `any` without a comment.
- Test-first: every feature service and router has tests, and there are Playwright e2e tests for the key site flows: sign up/in, search, favorite, list share, sponsor checkout (Mollie mocked), and admin CRUD.
- `bun run release:check` must pass before a phase counts as done. It runs Biome CI check, typecheck, tests, build, knip, `bun audit --production`, `expo-doctor`, and an `expo export`.
- Docs to write for the new world: `README.md`, `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/API.md`, `docs/AUTH.md`, `docs/PAYMENT_FLOW.md`, `docs/JOBS.md`, `docs/PRIVACY_AND_ANALYTICS.md`, `docs/deployment.md`, `docs/cutover-runbook.md`, `docs/DECISIONS.md` and `docs/PROGRESS.md`.
- Keep useful agent skills in `.agents/skills`: mux, mollie, react-native, tanstack-query, tanstack-router and remotion. Remove the Convex ones, and add Cloudflare/Better Auth/Drizzle guidance if helpful.

---

## 8. Things I explicitly do NOT want

These are out:
- Payload CMS
- Next.js or OpenNext
- Convex
- WorkOS
- Redis/BullMQ, node-cron, nodemailer or IMAP
- Docker/Caddy hosting for the site
- AWS / Remotion Lambda
- A third app
- Guest rows in the database
- A one-to-one port of the old Convex schema or the old UI

I also don't want:
- copy-pasted code between site and mobile
- a pull request
- any deployment
- pushes to `master`

---

## 9. Suggested phases (turn into plans)

Each phase ends with `release:check` green, `docs/PROGRESS.md` updated, and `develop` pushed.

0. Analysis → feature inventory → design spec → plans.
1. Monorepo skeleton: Bun workspaces and catalogs, Turbo, Biome/ultracite, knip, config package, CI workflow, and empty site (Start on Workers) and mobile (Expo) apps that build.
2. Foundations: `db` (clean schema per §3.1 + D1 + migrations + seed), `auth` (Better Auth, all methods, web + Expo clients), `api` (oRPC base + client), local guest store + import-on-sign-in (§3.2), `styles`/`brand`/`i18n`, design brief + `ui-web`/`ui-native` kits + `/dev/ui` preview (§4.1).
3. Learning features: gestures, categories, search (FTS5), favorites, lists, and share links on site and mobile.
4. Account, consent, analytics (OpenPanel), legal pages, deep links, legacy redirects, and maintenance mode.
5. Admin panel.
6. Payments, sponsorships, jobs (Queues/Cron/Workflows), email templates and sending.
7. Render: Remotion compositions + Cloudflare Container + Mux upload + preview in the wizard.
8. Environments (staging/production wrangler envs, EAS profiles, deploy workflow) and the Convex → D1 migration script.
9. Hardening: e2e tests, accessibility, performance, the final docs pass, and the parity audit against the feature inventory. Every item must be checked off or listed as a known gap with a reason.

When everything is done, post a final summary covering what was built, how to run it locally, the known gaps, and the manual steps I need to do (Cloudflare resources, secrets, OAuth apps, webhooks, EAS, migration run).
