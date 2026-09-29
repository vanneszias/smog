# Decisions

Each entry: date · decision · alternatives · why. Newest entries go at the bottom of their section. Business-rule changes are marked **[rule change]**; UX changes **[ux]**; improvements **[improvement]**; dependency additions outside the approved list **[dep]**.

## Process

- **2026-09-29 · Superpowers followed by hand.** The plugin install was not possible in this environment (no `/plugin` command, the org catalog has no match). The skills were cloned from `github.com/obra/superpowers` into the session scratchpad and followed manually: brainstorming → spec → plans → subagent-driven TDD execution → verification → review. Alternative: skip the workflow. Why: the user asked for that workflow.
- **2026-09-29 · Review cadence.** Tasks are sized as cohesive slices (a package or a feature). Each task gets an implementer subagent plus a task reviewer subagent, and a whole-phase review runs between phases. Alternative: one reviewer per micro-step. Why: roughly 100 micro-tasks × 2 reviews would cost more than it catches; phase reviews keep the quality gate.
- **2026-09-29 · Brainstorming questions answered from the prompt.** Every open question was resolved from the user's brief; where the brief was silent the choice below was made.

## Toolchain and versions

- **2026-09-29 · Newest stable version of every package** (user request). A deviation is only allowed for a concrete incompatibility and is listed here.
- **2026-09-29 · TypeScript 7.x** (native `tsc`), per the user's request. TS 7 drops the classic JS compiler API. If a tool needs that API, that tool alone gets a scoped `typescript6` alias (`npm:typescript@6`); none is known yet.
- **2026-09-29 · Keep knip 6** for unused files, exports and dependencies (it uses oxc and does not depend on TypeScript, so it is compatible with TS 7). Dependency direction is enforced by a small Bun script, `scripts/check-boundaries.ts`, against the graph in `@smog/config`. Alternatives: drop knip (loses unused export/file/dependency detection), or dependency-cruiser (covers direction only and parses with the TS API when present). Why: no other tool covers workspace-wide unused code; the script needs no new dependency.
- **2026-09-29 · Vitest 4.x for the Workers pool.** `@cloudflare/vitest-pool-workers@0.22` requires `vitest ^4.1`; Vitest 5 is used nowhere else (pure packages use `bun test`). Revisit when the pool supports 5.
- **2026-09-29 · NativeWind: pick at phase 1.** 4.2.x (Tailwind 3 on native) is stable; 5.0 (Tailwind 4) is only an RC. Phase 1 verifies which one runs on Expo SDK 57 and records the result here.
- **2026-09-29 · Bun stays at 1.3.11 for now (deviation).** `bun upgrade` to 1.4.2 failed in this environment (the GitHub release download is blocked by the egress proxy, HTTP 403), so `packageManager` pins the installed `bun@1.3.11`. Alternative: pin 1.4.2 without being able to run it (CI would then test a version nobody ran locally). Revisit: bump `packageManager` to the newest 1.x once the toolchain can be upgraded.
- **2026-09-29 · TypeScript 7 `tsc -b` works with shared bases.** Library bases are `composite` and emit declarations only, into `${configDir}/node_modules/.cache/tsc` (TS 7 supports `${configDir}`), so nothing lands next to sources or in `dist/`. `worker.json` adds `${configDir}/worker-configuration.d.ts` (the `wrangler types` output) to `files` instead of depending on `@cloudflare/workers-types`. Alternatives: `--noEmit` per package (breaks project references) or a per-package `outDir` (repeated in every package).
- **2026-09-29 · Root Bun scripts are checked by root Turborepo tasks.** `//#test:scripts` (`bun test scripts`) and `//#check-types:scripts` (`tsc -p scripts`) run beside the package tasks in `bun run test` / `bun run check-types`. They are uncached because root tasks do not hash other workspaces' files (the scripts import `@smog/config`). Package `check-types`/`test` depend on a `transit` node, as the installed Turborepo docs recommend, so they run in parallel but still miss the cache when a dependency changes.
- **2026-09-29 · Workers tests use `@cloudflare/vitest-plugin` (the renamed pool).** `@cloudflare/vitest-pool-workers` stopped at 0.22.0 (2026-08-18) and pins wrangler 4.124; Cloudflare's current docs and releases use `@cloudflare/vitest-plugin` 1.x (same `cloudflareTest()` API, `import { exports } from "cloudflare:workers"` instead of the deprecated `SELF`), which pins the same wrangler as `@cloudflare/vite-plugin` 1.62 requires (4.143). It still needs Vitest ^4.1, so the Vitest 4.x exception stands. Alternative: the old package name (stale, a second wrangler/miniflare copy).
- **2026-09-29 · Site generated files are committed.** `apps/site/worker-configuration.d.ts` (`bun -F @smog/site cf-typegen` = `wrangler types`, all envs, so each binding is optional on `Env` because the top level has none) and `src/routeTree.gen.ts` (TanStack Router) are checked in, so `tsc -b` works on a fresh clone and `check-types` stays plain `tsc -b`. Regenerate after changing `wrangler.jsonc`; CI can run `wrangler types --check`. Alternative: generate in `check-types` (every typecheck spawns wrangler; editors show errors until the first run).

## Architecture

- **2026-09-29 · `@smog/rpc` split from `@smog/api`.** Features need the oRPC base (context, middleware, errors) and `api` composes the features; putting both in one package would create a cycle. `rpc` = base, `api` = composition + client. Alternative: features define their own base (duplicated) or live inside `api` (not modular).
- **2026-09-29 · `@smog/local-store` package** for the on-device guest store with web/native adapters (the brief asked for "one shared local-store abstraction"). Features' `./client` hooks use it when signed out.
- **2026-09-29 · Contract-first oRPC** (`@orpc/contract`), so the mobile bundle only ships contracts and schemas, never server code.
- **2026-09-29 · Jobs package owns message types, producers and schedules; handlers are wired in the site Worker.** This avoids a jobs ↔ features cycle.
- **2026-09-29 · No locale prefix in site URLs.** The language comes from a cookie, then `Accept-Language`, then `nl`. Why: old URLs (`/gestures/…`, `/lists/<token>`) and app links stay valid, and gesture content (the sign videos) is language-neutral. Alternative: `/{nl,en,fr}/…` as in the reference branch (better hreflang, but breaks every old link and deep link).
- **2026-09-29 · Gesture URLs use slugs** (`/gestures/<slug>`); old Convex ids resolve through `gesture.legacy_id` (301 on web, transparent lookup in the app).
- **2026-09-29 · Boundaries graph encodes subpaths.** In `@smog/config/boundaries`, a plain entry (`@smog/db`) allows the package and all subpaths, a subpath entry (`@smog/render/contract`) allows the dependency but only that subpath in imports, and `@smog/feature:*` (optionally `/schema`, `/client`) stands for every package in `FEATURE_PACKAGES`. Every package from spec §4.1 is listed now, before it exists, and a workspace missing from the graph is a violation. `scripts/check-boundaries.ts` checks declared `@smog/*` dependencies and every `@smog/*` import in a workspace's source files (forbidden subpaths and undeclared imports). `@smog/config` may be a devDependency of any package (for the tsconfig bases, spec §4.1 leaves it out of `ui-web`/`ui-native`); as a runtime dependency or import it is still checked. Alternative: Turborepo's experimental `boundaries` (tags only, no subpath rules).
- **2026-09-29 · Site Cloudflare env is chosen at build time with `CLOUDFLARE_ENV`.** With the Cloudflare Vite plugin, `vite build` flattens one wrangler env into `dist/server/wrangler.json` and `wrangler deploy` uses that redirected config, so `--env` alone does not select bindings (with a top-level build it was silently ignored: "No bindings found"). `vite.config.ts` defaults `CLOUDFLARE_ENV` to `dev` (local dev, test builds, `vite preview`); deploy builds set `CLOUDFLARE_ENV=staging|production`. Wrangler then refuses `--env X` for a build made for another env. `deploy:dry` is therefore `CLOUDFLARE_ENV=staging vite build && wrangler deploy --dry-run --env staging` (the brief had only the deploy half). `apps/site/turbo.json` hashes `CLOUDFLARE_ENV` for `build` (and caches `.wrangler/deploy/**`, the redirect file), so a dev build is never replayed for staging. Alternatives: build the top-level config by default (a deploy with any `--env` then ships without bindings), or `.env.<mode>` files (need `.gitignore` exceptions, same effect).
- **2026-09-29 · `parseWorkerVars` takes `object`.** The generated `Env` is an interface without an index signature, so `Record<string, unknown>` rejected `env` from `cloudflare:workers`; zod validates the shape anyway.

## Data model

- **2026-09-29 · Favorites are one `favorite` table.** The old "default favorites list" and legacy `user_favorites` are merged into it by the migration. Lists are only user collections. Alternative: favorites as a special list (the old approach, which caused the duplication).
- **2026-09-29 · Sponsored video is not written into `gesture.playback_id`.** Public queries join the live sponsorship's video, so expiry no longer has to "restore" anything.
- **2026-09-29 · Sponsorship statuses redesigned [rule change: names/states].**
  - New statuses: `awaiting_payment → rendering → in_review → live → expiring → expired`, plus `render_failed`, `changes_requested`, `rejected`, `cancelled`. `expiring` is set when the renewal reminder goes out.
  - Business rules kept: payment is required first, every sponsorship needs admin approval before going live, it lasts 1 year from approval, there is one reminder 30 days before the end, and unpaid checkouts are cancelled after 24 h.
- **2026-09-29 · Consent log stores no IP address or user agent.** The privacy policy does not require them (data minimisation). The old schema had optional fields for them.
- **2026-09-29 · Tokens stored hashed** (sponsorship re-edit/renewal). List share tokens are stored in plain text because the owner must be able to copy the link again. They are 256-bit random capabilities and can be revoked.

## Sponsorship flow

- **2026-09-29 · [improvement][ux] Live Remotion Player preview in the wizard; the final render happens once, after payment.** Before, a full server render ran per gesture before payment: it took up to 2 min, created orphan Mux assets for abandoned checkouts, and could 400 on names over 35 chars. The admin still reviews the real rendered video before approval.
- **2026-09-29 · [rule change] One display-name field (≤ 35 chars) shown in the video.** The old UI had the sponsor name (≤ 40, UI said 40, enforced 35) and a separate overlay text (≤ 100 on re-edit), but the renderer only accepted 35. The contact name is a separate field.
- **2026-09-29 · [rule change] Max 10 gestures per checkout** (`MAX_GESTURES_PER_SPONSORSHIP = 10` from the old config; the old API allowed 20, the UI enforced none).
- **2026-09-29 · [rule change] Admin "new sponsorship" email is sent after payment**, not at creation. Unpaid attempts no longer notify admins.
- **2026-09-29 · [improvement][rule change] Renewal flow.** The reminder email links to `/sponsor/renew?token=…`. Paying renews for another year at the same price (€50 per gesture, +€10 if the sponsorship has a logo); `ends_at += 365 days`, with no re-render and no re-approval. The old system had no renewal (the link went to the homepage).
- **2026-09-29 · Late paid webhook for a cancelled sponsorship:** revive it if the gesture is still free, otherwise mark the payment `refund_needed` and email admins; always return 200. The old system returned 500 forever.
- **2026-09-29 · Stale-payment cancellation measures from payment creation** (the old code used `updatedAt`, which reset the clock) and also cancels the Mollie payment when it can.
- **2026-09-29 · Overlay layout stays fixed** (the brand-approved layout: logo 22 % box at y 76 %, green text at y 87 %, "Met de warme steun van:"). "Overlay configuration" in the wizard means the display name and optional logo with a live preview. Why: sponsors should not be able to break the brand layout.

## Auth

- **2026-09-29 · Better Auth plugins:** emailOTP, magicLink, passkey, admin (roles/bans/user list), expo, captcha (Turnstile). The user management UI uses the admin plugin's server API through oRPC.
- **2026-09-29 · Passkeys on mobile: web first.** WebAuthn is not available in React Native; a native passkey module is evaluated in phase 4 and recorded here.

## Analytics

- **2026-09-29 · [rule change: less data] Signed-in users are identified by user id only**; email and name are no longer sent to OpenPanel.

## i18n

- **2026-09-29 · Unified language fallback `nl`** on both apps (the old web used nl, native used en). The detected device or browser language is used when it is en/fr/nl.
