# Phase 5: Admin panel implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A web-only admin panel under `/admin` on the site. It covers the dashboard, the audit log viewer, gesture and category management (with Mux upload or pick, publish, keywords, the table editor and the QR dialog), users and roles, maintenance mode with the bypass cookie, and email previews. Every admin write is audited, and a demoted admin loses access on the next request.

**Architecture:**
- A new feature package `@smog/admin` (`packages/features/admin`) has `./schema`, `./contract`, `./server` and `./client`.
  - Its contract and router are split into one slice file per area (`dashboard`, `audit`, `gestures`, `categories`, `mux`, `users`, `maintenance`, `emails`). Parallel tasks therefore edit disjoint files.
  - `@smog/api` mounts it as `appContract.admin` / `appRouter.admin`.
  - Cross-feature server logic is injected through `@smog/api`, the `findSummaries` pattern: `createAdminRouter({ bumpCatalogVersion })` gets it from `@smog/gestures/server`.
  - The FTS row definition already lives in `@smog/db` (`rebuildGestureFtsSql`), so admin builds its reindex statements from `@smog/db` directly.
- A new package `@smog/video` holds the Mux helpers: direct uploads, the upload and asset lookups, the asset list, webhook verification, URL helpers and a `./testing` fake. Phase 7 extends it for master access and the render upload.
- Site:
  - `apps/site/src/routes/admin.tsx` is the gated layout with the left rail. Its children are `admin/{index,audit,gestures/index,gestures/new,gestures/$id,categories,users,settings,emails}.tsx`.
  - Composition components go in `apps/site/src/components/admin/*`.
  - `POST /api/webhooks/mux` is added.
- No mobile work (spec §9, §16: the admin is web).

**Tech stack:**
- As phase 4, plus `@mux/mux-node` (newest; runs on fetch + Web Crypto). If it does not bundle or run on workerd, `@smog/video` falls back to a thin `fetch` client plus Web Crypto HMAC (DECISIONS entry).
- No new UI dependency: the kit's `DataTable`, `Sheet`, `Dialog`, `AlertDialog`, `Tabs`, `SegmentedControl`, `Pagination`, and `qrcode.react` (already a site dependency).
- The upload is one XHR `PUT` with progress, as in the old `MuxVideoUpload`. No UpChunk: gesture clips are short.

**Spec:** §4.1, §4.2, §5.1–§5.3, §6 (admin plugin, `admin:grant`), §7 (`admin.*` endpoint inventory, `requireAdmin`), §7.1 (catalog snapshot), §8.2 (Mux asset lifecycle, admin uploads), §9 (`/admin/*` routes, maintenance), §16 (flow 5, the admin layout). Inventory rows A-01–A-03, A-16–A-26, A-28, U-12, L-14 (the admin half), P-11 (the toggle), W-02 (the admin part), W-07, and bug list items 11, 16, 18, 27, 30 and 33 (the admin parts). Tick their `Done` boxes when shipped.

**Mandatory carries from `docs/PROGRESS.md`:**
- Admin gesture and category writes set `sort_name`, reindex FTS in the same D1 batch, and call `bumpCatalogVersion`. The gesture name is at most 120 characters. (Task 2)
- The admin screens read categories and gestures from D1 (`admin.categories.list`, `admin.gestures.*`), never through the cached `gestures.categories` or the catalog snapshot. (Tasks 2, 4)
- The admin gestures tab gets the QR dialog, the admin half of L-14 / A-28. (Task 4)
- The maintenance admin toggle and the bypass-cookie UI, on top of phase 4 task 6's KV flag and `POST /api/maintenance/bypass`. (Task 6)
- R-11 (`/sponsors?gestureId=<old id>`) is **not** in this phase; see "Moved to phase 6".

## Rulings made for this plan

These are recorded here and go into `docs/DECISIONS.md` with the task that implements them.

1. **Sponsorship admin moves to phase 6.**
   - The sponsorship tables exist (migration 0000), but the state machine (`transition`), `sponsorship_event` writes, tokens, emails and jobs belong to `@smog/sponsorships` and `@smog/jobs` in phase 6. An admin UI before them would write states with no rules.
   - Phase 6 owns:
     - the moderation queue and approve / request changes / reject (A-04–A-07)
     - the sponsorships list and detail (A-08, A-15, A-29)
     - mark paid, cancel and force expire (A-10–A-12)
     - admin notification recipients (A-14)
     - the CSV export (A-09, `admin.export.sponsorshipsCsv`)
     - the dashboard's sponsorship stats
     - the rail's "Sponsorships" entry
     - the sponsorship email previews (their templates and samples)
     - the retention cron (J-04, already a phase 6 carry)
   - A-27 (render job view and retry) moves to phase 7 with the render pipeline. A-13 stays dropped.
2. **R-11 moves to phase 6.** Today `/sponsors?gestureId=<convexId>` 301s to `/sponsor?gestureId=<convexId>` with the query kept (phase 4 task 4). Only the phase 6 wizard knows its preselect parameter. It must resolve a gesture id, slug or `legacy_id` there, or the redirect must map it then.
3. **No admin upload goes to R2 in phase 5.** The only admin upload is gesture video, which goes straight to Mux through a direct-upload URL; the file never passes through the Worker.
   - R2 presigned URLs arrive with the sponsor logo in phase 6. Current Cloudflare docs, for the phase 6 plan:
     - Presigned URLs use the S3 API endpoint with an R2 API token (access key id + secret), for example with `aws4fetch`.
     - Expiry is 1 s to 7 days. Methods are GET/HEAD/PUT/DELETE; there is no POST form upload.
     - The signed `Content-Type` is enforced; a mismatch returns 403.
     - The bucket needs CORS rules for browser use, and presigned URLs do not work on custom domains.
4. **Mux direct uploads (checked against current Mux docs).**
   - Uploads are created with `POST /video/v1/uploads`:
     - `cors_origin` is the `SITE_URL` origin, not the old `"*"`.
     - `new_asset_settings: { playback_policies: ["public"], static_renditions: [{ resolution: "highest" }], passthrough }`. `playback_policies` is the current field; the spec's `playback_policy` is the old form.
     - `test: true` in dev.
     - `timeout` 3600 s (the default; allowed range 60–604800).
   - Upload statuses are `waiting | asset_created | errored | cancelled | timed_out`, and the asset id is set once the upload is `asset_created`.
   - Webhooks carry `Mux-Signature: t=<ts>,v1=<hex>`, where the signature is HMAC-SHA256 of `<ts>.<raw body>` with the signing secret. They are verified with a 5-minute tolerance.
   - `admin.mux.createUpload` has no audit row: it changes no stored state. The gesture create or update that uses the asset is audited. It is listed as exempt in the audit coverage test.
5. **Audit writes.**
   - D1 changes put the `audit_log` insert in the **same batch** as the change, so a change never lands unaudited and nothing is audited that did not happen.
   - External-state changes (Better Auth `auth.api` user operations, the KV maintenance flag) happen first; the audit insert follows. If that insert fails, it is logged (`[admin] Failed to write the audit entry …`) and rethrown, so the admin sees an error.
   - `audit_log.data` is validated per action by `@smog/admin/schema` `AUDIT_DATA_SCHEMAS`. Phase 5 defines the actions it writes plus `legacy`. Phase 6 adds the sponsorship, payment and export ones. The writer only accepts actions that have a schema.
6. **Better Auth's admin HTTP endpoints are disabled.**
   - Every `/admin/*` path of the admin plugin (set-role, ban, unban, remove, impersonate, stop-impersonating, create/update/list/get user, sessions, set-user-password, has-permission) goes into `disabledPaths`. Otherwise an admin could change roles over `/api/auth/admin/*` with no audit.
   - User writes go through oRPC and `auth.api.*`, which `disabledPaths` does not affect (phase 4 DECISIONS).
   - **Impersonation is not offered** (the old system had none, and it widens the session surface). `user.impersonate` stays an unused enum value.
7. **User safety rules.** An admin cannot change their own role, ban or delete themselves (`INVALID_STATE`). The last admin cannot be demoted. An admin must be demoted before they can be banned or deleted. The `user.delete` audit data holds no email or name (the account is gone; data minimisation), only the target id and `{ hadSessions }`.
8. **Catalogue rules.**
   - Gesture:
     - The name is 1..120 characters after trimming (contract only; a DB CHECK would mean a gesture table rebuild).
     - The description is at most 2000 characters.
     - Keywords: at most 30, each 1..60 characters, trimmed and de-duplicated with `normalizeText` equality, order kept.
     - Categories: 1..20.
   - Category names are 1..60 characters.
   - Slugs are set at create and never change on rename, so printed QR codes and shared links stay valid. Gesture slugs get `-2`, `-3`, … on collision.
   - A duplicate gesture name is a warning (`admin.gestures.checkName`), not an error.
   - A duplicate category name (`normalizeText`-equal) is `CONFLICT`.
   - `update` takes `expectedUpdatedAt` and answers `CONFLICT` when the row changed since it was read, so buffered table edits never overwrite another admin's save.
   - A gesture can be deleted only when unpublished and with no sponsorship (the FK is RESTRICT; otherwise `CONFLICT`).
   - A category can be deleted only when no gesture uses it (otherwise `CONFLICT`; unpublish instead).
   - `bumpCatalogVersion` runs after the D1 batch. A KV failure is logged and swallowed: D1 is already written, and only the typo tier and the public categories snapshot stay stale until the next bump.
9. **Maintenance.**
   - The KV value schema and key move from `apps/site` to `@smog/admin/schema` (`maintenanceSettingSchema`, `MAINTENANCE_KV_KEY`), so the admin service and the site middleware share one definition.
   - Disabling maintenance bumps `bypassVersion`, so every bypass cookie dies with the window.
   - Enabling from the UI first requests the acting admin's bypass cookie, so they are not locked out.
   - `POST /api/maintenance/bypass` must be exempt from the 503, for other admins who are already signed in; add the exemption if phase 4 task 6 did not.
10. **Gate responses.** A guest opening `/admin/*` is redirected to `/sign-in?redirect=<path>`. A signed-in non-admin gets the 404 page, so the admin surface is not disclosed. Every admin procedure is `requireAdmin` (`FORBIDDEN`), and it reads the role from D1 on each request, so a demotion applies at once.

## Global constraints

- Everything in the phase 1–4 global constraints still applies. That includes:
  - newest versions and the catalog
  - no `Bun.*` in workerd
  - tokens-only styling
  - i18n-only copy in nl/en/fr (the old admin was English hard-coded; bug 27)
  - the code style and the commit trailer
  - append-only migrations
  - `isForeignRequest` on every cookie-authenticated non-oRPC endpoint
  - `SMOG_OFFLINE=1 bun run release:check` green before reporting
- `@smog/admin` may import other features' `./schema` and `./contract`, never their `./server` or `./client`. Logic from another feature's server is injected by `@smog/api`. Add `@smog/video` to `@smog/site` dependencies (the boundaries graph already allows it for features and the site).
- Every admin procedure uses `requireAdmin`. Every admin **mutation** writes an audit entry (ruling 5). The coverage test (Task 1) fails when a mutation procedure is neither mapped to an audit action nor listed as exempt with a reason.
- Admin reads come from D1, never from the catalog snapshot or `gestures.categories`. After an admin write, the admin client invalidates its `admin` queries and the public `gestures` query keys.
- Admin lists are paginated (keyset, at most 100 per page) and URL-synced (filters, sort, page). Every data view has Skeleton, EmptyState and ErrorState (spec §16). The admin layout is dense and fluid-width, and uses the tokens only (no admin palette, A-02).
- Uploads never pass through the Worker body: the browser PUTs the file to the Mux direct-upload URL.
- External services are faked at the adapter boundary. `@smog/video/testing` provides a Mux fake (an in-memory implementation plus a local HTTP fake for e2e, selected with `MUX_API_URL`).
- The e2e uses Playwright with Chromium at `/opt/pw-browsers`. **Never run `playwright install`.**
- Parallel tasks each touch only their own blocks in shared files:
  - the i18n catalogues: `admin.<area>.*`; Task 1 creates the empty area blocks
  - `routeTree.gen.ts`: regenerate on merge; never hand-merge it
- Docs per task: DECISIONS entries for the rulings the task implements and any deviation, `docs/API.md` for new procedures, and the inventory `Done` ticks.

## Review focus

1. Authorization:
   - Every `admin.*` procedure answers `UNAUTHORIZED` to guests and `FORBIDDEN` to users (enumerated from the contract).
   - A demoted admin's next call is `FORBIDDEN`, and their next `/admin` navigation is a 404.
   - `/api/auth/admin/*` over HTTP answers 404.
2. Audit completeness and atomicity:
   - Every mutation writes exactly one entry per target, with Zod-valid `data`.
   - A failed D1 batch leaves neither the change nor the entry.
   - A deleted actor leaves `actor_id` NULL, and the entries stay.
3. Catalogue integrity after admin writes:
   - `sort_name` equals `gestureSortName(name)`.
   - The FTS row matches `rebuildGestureFtsSql` (renaming or unpublishing a category reindexes all its gestures).
   - The catalog version changed, and the public search finds a renamed gesture by its new name at once.
   - Slugs are unique and stable on rename.
   - A stale `expectedUpdatedAt` is `CONFLICT`.
4. Mux:
   - The upload URL comes from the server and the file goes browser → Mux.
   - The webhook rejects a bad, missing or expired signature, and never trusts an unsigned body.
   - No Mux secret reaches the client bundle.
5. Maintenance:
   - The toggle and the bypass never lock the acting admin out.
   - Disabling invalidates old bypass cookies.
   - The exempt paths still pass.

---

### Task 1: `@smog/admin` foundation, audit log and the admin shell

**Files:**
- `packages/features/admin/{package.json,tsconfig*.json,turbo.json,vitest.config.ts,test/wrangler.jsonc}`. Copy the shape of `packages/features/account`.
- `src/schema/{index,audit,dashboard}.ts`, `src/contract/{index,dashboard,audit,gestures,categories,mux,users,maintenance,emails}.ts`, `src/server/{index,router,audit-writer,dashboard,audit}.ts` and `src/server/{gestures,categories,mux,users,maintenance,emails}.ts`. The area files are empty slices that later tasks fill.
- `src/client/{index,use-admin-dashboard,use-admin-audit}.ts`, `test/{coverage,auth,audit,dashboard}.test.ts`, `test/helpers.ts`.
- Modify `packages/api/src/{contract,router}.ts`. Add `packages/features/admin` to knip if needed.
- Site:
  - `apps/site/src/routes/admin.tsx` (layout + gate)
  - `admin/index.tsx` (dashboard) and `admin/audit.tsx`
  - placeholder route files `admin/{gestures/index,categories,users,settings,emails}.tsx`: an EmptyState "coming in this phase", which later tasks replace
  - `src/components/admin/{admin-rail,admin-page,audit-table,audit-data}.tsx`
  - `src/server/admin-gate.functions.ts`
  - the user menu's "Admin" link (admins only)
  - i18n `admin.*` blocks
  - `e2e/admin-shell.spec.ts`

**Interfaces:**
- Schema:
  - `AUDIT_DATA_SCHEMAS: Partial<Record<AuditAction, ZodType>>`.
    - Phase 5 defines `legacy` (`{ legacy: unknown }`) now. Tasks 2, 5 and 6 add their actions in `src/schema/audit.ts`, in their own blocks.
    - `WritableAuditAction` is the actions that have a schema.
  - `auditEntrySchema { id, action, targetType, targetId, data, actor: { id, name } | null, createdAt }`.
- `auditStatement(db, { actorId, action, targetType, targetId, data })` returns a Drizzle insert for a D1 batch. It Zod-validates `data` and throws before any write when invalid. `writeAudit(db, entry)` is the standalone form, used after external-state changes (ruling 5).
- Each contract slice exports its procedures plus `ADMIN_AUDIT_MAP` metadata: `{ mutations: Record<procedure, AuditAction | { exempt: string }>, reads: procedure[] }`. `test/coverage.test.ts` walks every slice and fails on a procedure that is in neither list, and on a mapped mutation whose test never asserted its entry (use the `expectAudit` helper registry).
- `createAdminRouter(deps: AdminDeps)`, with `AdminDeps = { bumpCatalogVersion(kv): Promise<string> }`. `@smog/api` passes it from `@smog/gestures/server`. Every procedure is built from one `adminProcedure = implementRpc(adminContract)…use(requireAdmin)`.
- `admin.dashboard() → { gestures: { total, published, unpublished }, categories: { total, published }, users: { total, admins, banned, last30Days }, recentAudit: AuditEntry[5] }`. It is at most 2 D1 reads (one batch of counts + the recent audit). Phase 6 adds the sponsorship stats.
- `admin.audit.list({ action?, targetType?, targetId?, actorId?, from?, to?, cursor?, limit ≤ 100 = 50 }) → { items, nextCursor }`, newest first, keyset `(created_at, id)`. It uses the existing indexes (`created_at`, `(action, created_at)`, `(target_type, target_id)`, `actor_id`). `data` is parsed with its schema when one exists and returned raw otherwise.
- The gate: `getAdminGate()` server function. It redirects a guest to `/sign-in?redirect=`, calls `notFound()` for a non-admin, and returns `{ user }` for an admin (ruling 10). It runs in `beforeLoad` on every admin navigation.
- The layout: a left rail with Dashboard, Gestures, Categories, Users, Audit log, Emails, Settings (Sponsorships joins in phase 6). Its `head()` sets `noindex`. The main area is fluid. On mobile widths the rail is a Sheet.

**Behaviour:**
- `/admin/audit` is a DataTable with the filters in the URL: action Select, target type, actor, date range. A row opens a side Sheet with the pretty-printed data, the target link (gesture editor, user) and the actor. A deleted actor shows `admin.audit.deletedActor`.
- The dashboard shows stat cards, the recent audit list, and quick links (new gesture, categories).

- [ ] TDD:
  - auth: every admin procedure (enumerated) is guest → `UNAUTHORIZED`, user → `FORBIDDEN`, admin → ok.
  - demotion: set `role = 'user'` in D1 → the next call is `FORBIDDEN` with the same cookie.
  - audit: invalid `data` throws and writes nothing; a batch with a failing statement leaves no entry; the list filters and keyset; deleting the actor keeps the rows with a null actor.
  - dashboard counts on a seeded db.
  - the coverage test.
  - e2e: guest `/admin` → sign-in; a user → 404; the seeded admin sees the dashboard and the audit page.
- [ ] Screenshots (light/dark × 390/1280) of the dashboard and audit page, reviewed. `bun -F @smog/admin test && bun -F @smog/api test`, then `SMOG_OFFLINE=1 bun run release:check`. Commit `feat(admin): admin package, audit log and admin shell`.

### Task 2: Catalogue admin API (gestures and categories)

**Files:**
- `packages/features/admin/src/{schema/catalog.ts,contract/gestures.ts,contract/categories.ts,server/gestures.ts,server/categories.ts,server/catalog-writes.ts,client/use-admin-gestures.ts,client/use-admin-categories.ts}` and `test/{gestures,categories}.test.ts`
- The audit schemas for `gesture.*` and `category.*` in `src/schema/audit.ts`
- `packages/db/src/fts.ts`: add `rebuildGesturesFtsSql(gestureIds)` and `rebuildCategoryGesturesFtsSql(categoryId)`, the set forms of the one row definition, with tests
- `packages/db/migrations/0005_admin_gesture_order.sql`: a full `(sort_name, id)` index for the admin list, which includes unpublished rows (`db:generate`; renumber if 0005 is taken at merge)

**Interfaces:**
- Gestures:
  - `admin.gestures.list({ q?, status?: "all"|"published"|"unpublished" = "all", category?: string[] (ids), cursor?, limit ≤ 100 = 50 }) → { items: AdminGestureRow[], nextCursor, counts: { total, published, unpublished } }`.
    - The order is `sort_name, id`.
    - `q` matches `sort_name` or keywords (a `normalizeText` substring).
    - `AdminGestureRow { id, slug, name, playbackId, muxAssetId, publishedAt, updatedAt, categories: {id, name, slug, published}[], keywords: string[] }`.
  - `admin.gestures.get({ id }) → AdminGestureDetail` (the row + `description`, `createdAt`), or `NOT_FOUND`.
  - `admin.gestures.checkName({ name, excludeId? }) → { duplicates: { id, name, slug }[] }`.
  - `admin.gestures.create({ name, description?, keywords?, categoryIds, playbackId, muxAssetId?, published = true }) → AdminGestureDetail`.
  - `admin.gestures.update({ id, expectedUpdatedAt, name?, description?, keywords?, categoryIds?, playbackId?, muxAssetId? })`. An empty patch is `VALIDATION`; a stale `expectedUpdatedAt` is `CONFLICT`.
  - `admin.gestures.saveMany({ items: { id, expectedUpdatedAt, patch }[] ≤ 50 })`: the table editor's single save, one batch, all or nothing. Any stale row is `CONFLICT` with `{ ids }` data, and nothing is written.
  - `admin.gestures.setPublished({ id, published })` (`gesture.publish` / `gesture.unpublish`).
  - `admin.gestures.bulkUpdate({ ids ≤ 100, published?, addCategoryIds?, removeCategoryIds? }) → { updated }`. It writes one `gesture.bulk_update` entry with the ids and the patch. A gesture left without a category is `INVALID_STATE`.
  - `admin.gestures.delete({ id, confirmName })` (ruling 8, `gesture.delete` with `{ name, slug }`).
- Categories:
  - `admin.categories.list() → { id, slug, name, sortOrder, publishedAt, gestureCount, publishedGestureCount }[]`, read from D1 and bounded at 100.
  - `admin.categories.create({ name, published = true })`, `update({ id, expectedUpdatedAt, name })`, `setPublished({ id, published })`, `reorder({ ids })` (the exact set, else `INVALID_STATE`; sets `sort_order` 0..n-1; `category.reorder`), `delete({ id })` (`CONFLICT` when in use).
- Writes (`catalog-writes.ts`):
  - Every write is one `db.batch([...changes, ...ftsStatements, auditStatement])`. `sort_name = gestureSortName(name)` on every insert and rename. Slugs come from `slugify` in `@smog/utils`, with a suffix retry on a unique-index conflict.
  - A category rename, publish or unpublish reindexes all its gestures with `rebuildCategoryGesturesFtsSql` in the same batch. A category delete reads its gesture ids first and reindexes them with `rebuildGesturesFtsSql` after the delete (unpublished names are not indexed; DECISIONS 2026-09-29).
  - After the batch comes `deps.bumpCatalogVersion(kv)`, where a failure is logged and swallowed (ruling 8).
- Client:
  - `useAdminGestures(filters)` (paged), `useAdminGesture(id)`, `useAdminGestureMutations()`, `useAdminCategories()`, `useAdminCategoryMutations()`.
  - They invalidate the `admin` and public `gestures` keys on success, and surface `CONFLICT` as a typed state (`staleIds`).

- [ ] TDD (Vitest workers, seeded D1):
  - create sets slug, `sort_name`, the FTS row (search the new name through `searchGestures`) and one audit row, and changes the catalog version
  - slug collisions get suffixes
  - rename keeps the slug and reindexes
  - keyword de-duplication (`Café`/`cafe`)
  - `expectedUpdatedAt` conflict
  - `saveMany` is all or nothing
  - bulk update, with the no-category guard
  - delete refused while published or sponsored
  - category rename/unpublish reindexes all its gestures (their FTS `categories` column changes)
  - category delete refused when in use
  - reorder exact-set validation
  - a KV failure on the bump still returns success and logs
  - the name limit of 120
  - the list reads unpublished rows, and a query-plan test shows the admin list seeks the 0005 index
- [ ] Commit `feat(admin): gesture and category management API`.

### Task 3: `@smog/video` and the Mux admin integration

**Files:**
- `packages/video/{package.json,tsconfig*.json,src/{index,client,uploads,assets,webhooks,urls}.ts,src/testing/{index,fake-mux,fake-server}.ts}`, tests. Move `muxStreamUrl` / `muxThumbnailUrl` here only if nothing else imports them from `@smog/utils` (otherwise leave them).
- `packages/config/src/env/worker.ts`: optional `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_WEBHOOK_SECRET`, and the var `MUX_API_URL` (default `https://api.mux.com`, for the fake). Update `.dev.vars.example` and `wrangler.jsonc` comments.
- `packages/features/admin/src/{contract/mux.ts,server/mux.ts,client/use-mux-upload.ts,client/use-mux-assets.ts}`, `test/mux.test.ts`.
- Site: `apps/site/src/routes/api/webhooks/mux.ts`, `apps/site/src/components/admin/video/{video-field,mux-upload,mux-picker}.tsx`, tests.

**Interfaces:**
- `@smog/video`:
  - `createMux(env)`, which returns `null` when the token is unset.
  - `createDirectUpload(mux, { corsOrigin, passthrough, test })`, with the settings from ruling 4.
  - `getUpload(mux, id)`, `getAsset(mux, id)`.
  - `listAssets(mux, { page, limit ≤ 24 })` returns only assets with a public playback id: `{ id, playbackId, status, duration, aspectRatio, createdAt }`, plus `hasMore`.
  - `verifyMuxWebhook(rawBody, headers, secret, now)` returns the parsed event or throws `MuxSignatureError`. It uses Web Crypto HMAC with a constant-time compare and a 300 s tolerance.
  - `./testing`: an in-memory Mux fake (the same interface) and a Bun HTTP fake server for e2e.
- Admin:
  - `admin.mux.status() → { configured: boolean }`.
  - `admin.mux.createUpload() → { uploadId, url }`, with `passthrough = "gesture-upload:<uuid>"` (exempt from the audit, ruling 4).
  - `admin.mux.uploadStatus({ uploadId }) → { upload: UploadStatus, asset?: { id, status: "preparing"|"ready"|"errored", playbackId? }, error? }`. It reads KV `mux:upload:<id>` (written by the webhook) first, then falls back to the Mux API.
  - `admin.mux.assets({ page, limit })`, with `usedBy: { id, name }[]` joined from D1 on `mux_asset_id` / `playback_id`.
  - `NOT_FOUND` for an unknown upload. When Mux is not configured, `INVALID_STATE` (the UI then offers the pasted playback id only).
- Webhook `POST /api/webhooks/mux`:
  - It reads the raw body (capped at 1 MiB) and verifies it (400 on failure, logged without the body).
  - It handles `video.upload.asset_created`, `video.upload.errored|cancelled`, `video.asset.ready` and `video.asset.errored` for `gesture-upload:` passthroughs, writing KV `mux:upload:<uploadId>` (TTL 24 h). The upload id comes from the event or from the asset's `upload_id`.
  - Other events get 200 and are ignored; phase 7 adds the render passthroughs.
  - It is not rate-limited and not cookie-authenticated (no `isForeignRequest`). It is exempt from maintenance (phase 4).
- UI:
  - `VideoField { value: { playbackId, muxAssetId? } | null; onChange }` has tabs Upload / Choose existing / Playback id.
  - `MuxUpload`: drag-and-drop or browse, `accept="video/*"`, the XHR PUT with a ProgressBar, then polling `uploadStatus` every 2 s (stopping on a terminal state, and after 10 min with a retry), then the ready player and "Upload another".
  - `MuxPicker`: a paged grid of thumbnails with the status and usage badge.
  - Check the upload URL host against the CSP `connect-src` (phase 4 task 6). If it is not `*.mux.com`, add it for the admin pages and record it.

- [ ] TDD:
  - the webhook signature: valid; tampered body; wrong secret; old timestamp; missing header
  - the upload request body matches ruling 4 (fake records it)
  - status: KV first, API fallback
  - assets hide non-public ones and join `usedBy`
  - not configured → `INVALID_STATE`
  - the site route: 400 on a bad signature, 200 and a KV write on `video.asset.ready`
  - component tests for the upload state machine (a fake XHR)
  - a bundle check that no `MUX_TOKEN` string or `@mux/mux-node` reaches `dist/client`
- [ ] Commit `feat(video,admin): Mux direct uploads, asset picker and webhook`.

### Task 4: Catalogue admin screens (gestures, editor, table editor, categories, QR)

Depends on Tasks 2 and 3.

**Files:**
- `apps/site/src/routes/admin/{gestures/index,gestures/new,gestures/$id,categories}.tsx`. These replace the Task 1 placeholders.
- `apps/site/src/components/admin/catalog/{gesture-table,gesture-table-editor,changes-dialog,gesture-editor,keyword-input,category-picker,category-list,bulk-bar}.tsx`
- Extract the QR dialog from `apps/site/src/components/learning/gesture-actions.tsx` into `apps/site/src/components/gesture-qr-dialog.tsx` (shared; `qrFileName` moves with it), used by both.
- Tests and `e2e/admin-catalog.spec.ts`.

**Behaviour:**
- `/admin/gestures`:
  - A DataTable with thumbnail, name, categories (2 chips + "+N"), keyword count, a published Switch, updated, and a row menu (Edit, QR code, Publish/Unpublish).
  - Filters in the URL: search, status, category. Pagination.
  - Stats: total, published, hidden.
  - Row selection → the bulk bar (publish, unpublish, add or remove a category) → `bulkUpdate`.
  - "Edit table" mode (A-20):
    - Cells edit inline (name, description, playback id; categories through the picker with published and hidden ones marked; keywords through the keyword input).
    - Edits are buffered with "Discard (N)" and "Save changes".
    - The confirm dialog shows old vs new per field, then one `saveMany`.
    - On `CONFLICT` the stale rows are highlighted with "Reload these rows"; the others stay buffered.
- `/admin/gestures/new` and `/admin/gestures/$id`: the editor (A-16, A-17):
  - `VideoField`
  - the name (with a live duplicate warning via `checkName`, debounced) and its character counter (120)
  - description
  - keywords (Enter/Add, trimmed, de-duplicated, click to remove)
  - categories (≥ 1)
  - the published switch (default on for new)
  - Save uses `expectedUpdatedAt`. On `CONFLICT` a dialog offers "Reload (lose my edits)" or "Keep editing".
  - The editor shows the slug (read-only) and "View on site" (published only), and a QR button (the shared dialog, `${SITE_URL}/gestures/<slug>`).
  - Delete sits in a danger zone: unpublished only, and the AlertDialog asks for the name to be typed.
- `/admin/categories` (A-22):
  - A list ordered by `sort_order` with published and hidden sections and gesture counts.
  - Create, rename and publish toggle.
  - Reorder with dnd-kit (pointer and keyboard; move up/down in the row menu) → `reorder`.
  - Delete is offered only when the category is unused; otherwise the menu explains "Unpublish instead".
- All reads go through the `@smog/admin/client` hooks (D1), never `useCategories()`.

- [ ] Tests:
  - component tests: buffered edits and the diff, the conflict path, keyword input rules, the duplicate warning
  - e2e with the Mux fake:
    - create a category; create a gesture with a pasted playback id in it → it shows in the admin list at once and the public `/gestures?q=<name>` finds it
    - rename it → the public search finds the new name and the slug is unchanged
    - unpublish → the public page 404s and the admin still lists it
    - table-edit two rows → one save → both updated
    - the QR dialog downloads `smog-<slug>-qr.png`
    - the upload flow through the fake server
- [ ] Screenshots (light/dark × 390/1280) of the list, the table editor, the editor and categories, reviewed. Commit `feat(site): admin catalogue screens`.

### Task 5: Users and roles

**Files:**
- `packages/features/admin/src/{schema/users.ts,contract/users.ts,server/users.ts,client/use-admin-users.ts}`, `test/users.test.ts`, and the audit schemas for `user.*`.
- `packages/auth/src/server.ts`: `disabledPaths` gets every admin-plugin path (ruling 6).
- `packages/auth/test/admin-paths.test.ts`: enumerate the configured router's `/admin/*` endpoints and assert each is 404 over HTTP and still callable through `auth.api`, like `captcha.test.ts`.
- Site: `apps/site/src/routes/admin/users.tsx`, `src/components/admin/users/{user-table,user-panel}.tsx`, `e2e/admin-users.spec.ts`.

**Interfaces:**
- `admin.users.list({ q?, role?, banned?, cursor?, limit ≤ 100 = 50 }) → { items: { id, name, email, emailVerified, role, banned, banReason, banExpires, createdAt }[], nextCursor }`.
  - It reads D1 directly, newest first, with a real keyset (fixes bug 16).
  - `q` matches the email or the name (case-insensitive `LIKE` with escaped wildcards).
- `admin.users.get({ id }) → user + { methods (provider names), sessions: number, favorites: number, lists: number }`. Phase 6 adds sponsorships by email.
- `admin.users.setRole({ userId, role })` uses `auth.api.setRole` with the request headers. It writes `user.role_change` `{ from, to }`.
- `admin.users.ban({ userId, reason 1..200, expiresInDays? 1..365 })` uses `auth.api.banUser` (which revokes the sessions) and writes `user.ban`. `unban({ userId })` writes `user.unban`.
- `admin.users.delete({ userId, confirmEmail })` uses `auth.api.removeUser` and writes `user.delete` (ruling 7). The cascade follows the data model, and audit rows by that user keep a null actor.
- Guards (ruling 7) run before any change: self, last admin, and an admin target for ban/delete → `INVALID_STATE` with a `reason` code the UI translates.
- Audit follows the external-state order (ruling 5).

**Behaviour:**
- `/admin/users` is a DataTable with filters in the URL (search, role, banned). A row opens a side panel with the details and the actions: promote/demote, ban (reason + optional expiry), unban, delete (type the email). Each action has an AlertDialog.
- The acting admin's own row has its actions disabled, with an explanation.
- `admin:grant` stays the bootstrap path (spec §6).

- [ ] TDD:
  - each action writes its audit entry and has its effect
  - a banned user's session is refused at once
  - a demoted admin's next admin call is `FORBIDDEN`
  - the guard cases
  - the list keyset and search (with `%` in the query)
  - `/api/auth/admin/set-role` over HTTP → 404
  - an audit-write failure after `setRole` is logged and rethrown
  - e2e: the seeded admin promotes a second account → it can open `/admin` → it is demoted → its next `/admin` navigation is a 404 and its next admin call is `FORBIDDEN`
- [ ] Screenshots of `/admin/users` and the panel, reviewed. Commit `feat(admin): user and role management`.

### Task 6: Maintenance settings, bypass cookie and email previews

Depends on phase 4 task 6 being merged.

**Files:**
- `packages/features/admin/src/{schema/maintenance.ts,contract/maintenance.ts,server/maintenance.ts,contract/emails.ts,server/emails.ts,client/use-maintenance.ts,client/use-email-preview.ts}`, `test/{maintenance,emails}.test.ts`, and the audit schemas for `maintenance.*`.
- `apps/site/src/worker/maintenance.ts` (phase 4): import `maintenanceSettingSchema` / `MAINTENANCE_KV_KEY` from `@smog/admin/schema`, and exempt `POST /api/maintenance/bypass` if it is not already (ruling 9).
- `packages/email/src/samples.ts` (the `./samples` export): `EMAIL_SAMPLES`, one typed sample prop set per `EmailTemplateId`, with a test that every template has one (so phase 6's templates must add theirs).
- Site: `apps/site/src/routes/admin/{settings,emails}.tsx`, `src/components/admin/{maintenance-card,bypass-card,email-preview}.tsx`, `e2e/admin-settings.spec.ts`.

**Interfaces:**
- `admin.maintenance.get() → { enabled, message?, until?, bypassVersion }` reads KV directly with no cache, so the admin sees their own write.
- `admin.maintenance.set({ enabled, message? ≤ 280, until? (future, ≤ 7 days) })`:
  - It validates, then does a KV put (disabling bumps `bypassVersion`), then the audit entry (`maintenance.enable` / `maintenance.disable` with `{ message, until }`; `target_type` `setting`, `target_id` = the key).
  - Setting the state it already has is a no-op without an audit row.
- `getMaintenanceBypassStatus()` is a site server function. It verifies the request's `smog_mx` cookie with the phase 4 verifier and returns `{ active: boolean, expiresAt? }` (the cookie is HttpOnly).
- `admin.emails.list() → { id, subject: Record<Locale, string> }[]` and `admin.emails.preview({ template, locale }) → { subject, html, text }` both use `renderEmail` with `EMAIL_SAMPLES`. They are reads (no audit).

**Behaviour:**
- `/admin/settings`:
  - The maintenance card shows the state, the message, `until`, and a note that other isolates follow within about a minute (the 30 s isolate cache plus KV propagation).
  - "Enable" first calls `POST /api/maintenance/bypass` (fetch, same-origin), then `set({ enabled: true })`, and shows the bypass card's new state.
  - "Disable" explains that every bypass cookie is revoked.
  - The bypass card has "Bypass for this browser (12 h)" and shows the expiry.
- `/admin/emails` (A-25, W-07):
  - A template list and a locale SegmentedControl (nl/en/fr).
  - Desktop (780 px) / Mobile (390 px) width toggle, and the subject line.
  - An `<iframe sandbox="" srcdoc>` with no scripts, plus a Text tab.
  - Phase 6 templates appear automatically once they are registered with samples.

- [ ] TDD:
  - `set` writes KV plus audit; disabling bumps `bypassVersion`, so an old cookie → 503
  - the no-op set; `until` validation
  - an audit failure after the KV put is logged and rethrown
  - emails: every template renders in 3 locales from its sample; an unknown template → `VALIDATION`
  - e2e:
    - enable from the UI → the admin keeps browsing `/admin` and a fresh context gets 503 on `/`
    - `/api/health` passes
    - disable → the fresh context gets 200 and the old cookie no longer bypasses when re-enabled
    - the email preview iframe renders the OTP template
- [ ] Screenshots of both pages, reviewed. Commit `feat(admin): maintenance toggle, bypass cookie and email previews`.

### Task 7: Admin hardening, accessibility, docs and parity check

Depends on Tasks 1–6.

**Files:** `apps/site/e2e/{admin-a11y,admin-screenshots}.spec.ts`, and fixes found in any admin file. `docs/{API.md,DECISIONS.md,PROGRESS.md}` and the inventory ticks.

**Behaviour:**
- axe (`@axe-core/playwright`) on every admin page in light and dark: no serious or critical violations.
- Keyboard-only runs of the table editor, the category reorder, dialogs and sheets (focus return).
- Screenshots of every admin page (light/dark × 390/1280), reviewed and fixed.
- A parity walk through inventory rows A-01–A-03, A-16–A-26, A-28, U-12 and L-14 against the running site. Each row is ticked or noted as moved (phase 6/7 per ruling 1).
- The CSP (phase 4) shows no console violations on the admin pages, including the Mux upload and the email iframe.
- PROGRESS:
  - log the phase 5 tasks
  - add the phase 6 carries: the sponsorship admin list from ruling 1, R-11, the email samples for new templates, the audit schemas for the sponsorship/payment/export actions, the rail entry and the dashboard stats
  - add the phase 7 carries: A-27, and the Mux webhook passthroughs for render
- [ ] The full site e2e and `SMOG_OFFLINE=1 bun run release:check` pass. Commit `test(site): admin accessibility, screenshots and parity`.

---

## Parallelism

| Wave | Tasks | Why they can run together |
|---|---|---|
| A | 1 | Everything depends on the package, the slice files, the shell and the route placeholders. |
| B | 2, 3, 5, 6 | Disjoint slice files: 2 is catalog + `packages/db/src/fts.ts` + migration 0005; 3 is `packages/video` + `mux` slices + the webhook route + `components/admin/video`; 5 is `users` slices + `packages/auth` + `admin/users.tsx`; 6 is `maintenance`/`emails` slices + `packages/email/samples` + `worker/maintenance.ts` + `admin/{settings,emails}.tsx`. The shared files are only `src/schema/audit.ts` (a separate block per task), the i18n `admin.<area>` blocks, `routeTree.gen.ts` (regenerate) and `packages/config/src/env/worker.ts` (Task 3 only). Task 6 waits for phase 4 task 6 to merge. |
| C | 4 | Needs the catalog API (2) and `VideoField` (3). |
| D | 7 | Needs all of them. |

## Moved to phase 6 (and 7)

- Phase 6:
  - A-04–A-12 (moderation queue, approve, reject, request changes/re-edit link, sponsorship list and CSV export, mark paid, cancel, force expire), A-14, A-15, A-29
  - `admin.sponsorships.*` and `admin.export.sponsorshipsCsv`, with their audit schemas (`sponsorship.*`, `payment.refund`, `export.sponsorships_csv`)
  - the "Sponsorships" rail entry, the dashboard's sponsorship stats, the user panel's sponsorships
  - samples for the new email templates
  - R-11
  - the audit retention cron (J-04)
  - the R2 presigned logo upload (ruling 3 notes)
- Phase 7: A-27 (render jobs, retry render), and the `/api/webhooks/mux` render passthroughs (Workflow events).
