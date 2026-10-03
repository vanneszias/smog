# API

The oRPC procedures of `appContract` (`@smog/api`), served at `/api/rpc`.
Every procedure declares the
shared error map (`@smog/rpc/contract` `ERRORS`); the codes each one adds are
listed with it. The contracts (`packages/features/*/src/contract.ts` and
`packages/api/src/contract.ts`) are the source of truth: their doc comments
hold the full rules, and this page is the index. The OpenAPI reference is
served at `/api/openapi`.

## `system.*` (`@smog/api`)

| Procedure | Auth | Input | Output |
|---|---|---|---|
| `system.health` | public | none | `{ ok: true, environment }` |
| `system.whoami` | public | none | `{ user: { id, email, name, image, role } \| null }` |
| `system.authConfig` | public | none | `{ google, apple, turnstileSiteKey }` (which sign-in methods and captcha to show; no secrets) |

## `gestures.*` (`@smog/gestures`)

Public reads. Unpublished gestures and categories never appear; the reads
come from the catalog snapshot (spec §7.1), which every admin write bumps.

| Procedure | Input | Output |
|---|---|---|
| `gestures.categories` | none | published categories (`sort_order`, then name; ≤ 100) |
| `gestures.list` | `{ category?: slug[] (≤ 20, any of), cursor?, limit? (1..100, = 50) }` | `{ items: GestureSummary[], nextCursor }` (name order, keyset) |
| `gestures.search` | `{ q (≤ 100), category?, limit? (1..50, = 20) }` | `{ items: SearchResult[], total }` (FTS5 candidates ≤ 200, the TS ranking, then the typo tier; an empty `q` is the browse list) |
| `gestures.bySlug` | `{ slug }` | the gesture, also by its legacy id (`canonicalSlug` then differs); `NOT_FOUND` otherwise |
| `gestures.byIds` | `{ ids (≤ 100) }` | `GestureSummary[]` in the order asked; unknown ids are skipped |
| `gestures.related` | `{ slug, limit? (1..20, = 5) }` | gestures sharing a category, most shared first |
| `gestures.sitemap` | none | every published gesture's sitemap entry |

## `favorites.*` (`@smog/favorites`)

Every procedure needs a session (`UNAUTHORIZED`); guests keep theirs on the
device (`@smog/local-store`).

| Procedure | Input | Output |
|---|---|---|
| `favorites.ids` | none | favorite gesture ids, newest first |
| `favorites.list` | `{ cursor?, limit? }` | a keyset page of favorite gestures, newest first |
| `favorites.add` | `{ gestureId }` | `{ favorite: true }`, idempotent; `NOT_FOUND` for an unknown or unpublished gesture |
| `favorites.remove` | `{ gestureId }` | `{ favorite: false }`, idempotent, whatever the gesture's state |
| `favorites.toggle` | `{ gestureId }` | `{ favorite }`: adds when missing, removes when present |

## `lists.*` (`@smog/lists`)

Owner procedures need a session; `lists.shared.get` is public;
`lists.shared.addItem/removeItem` need a session and an edit link.

| Procedure | Input | Output |
|---|---|---|
| `lists.mine` | none | the owner's lists, most recently changed first |
| `lists.get` | `{ id }` | the list with its published gestures in order; `NOT_FOUND` otherwise |
| `lists.containing` | `{ gestureId }` | the ids of the owner's lists holding it |
| `lists.create` | `{ name, description? }` | the list; `INVALID_STATE` at `LISTS_MAX` |
| `lists.update` | `{ id, name?, description? }` | the list (an empty or `null` description clears it) |
| `lists.delete` | `{ id }` | nothing; items and share links go with it |
| `lists.addItem` / `lists.removeItem` | `{ id, gestureId }` | `{ added }` / `{ removed }`; a no-op when already so |
| `lists.reorder` | `{ id, gestureIds }` | nothing; exactly the current gestures, else `INVALID_STATE` |
| `lists.share.get` | `{ id }` | the active view and edit links (`null` where none) |
| `lists.share.create` | `{ id, role }` | the role's active link, created when none |
| `lists.share.revoke` | `{ id, role }` | nothing; the link 404s at once |
| `lists.shared.get` | `{ token }` | public: the list behind an active link |
| `lists.shared.addItem` / `lists.shared.removeItem` | `{ token, gestureId }` | edit link and a session (`FORBIDDEN` for a view link) |

## `account.*` (`@smog/account`)

Every procedure needs a session (`UNAUTHORIZED`).

| Procedure | Input | Output |
|---|---|---|
| `account.me` | none | the profile and the sign-in methods |
| `account.updateProfile` | `{ name?, locale? }` | the new profile |
| `account.consent.get` | none | the current analytics decision |
| `account.consent.set` | `{ analytics, source? (= "web") }` | appends to the consent log; the new state |
| `account.export` | none | everything stored about the user, as versioned JSON (holds live share links) |
| `account.importGuestData` | the guest's favorites, lists and consent | counts of what was merged and skipped; all or nothing, idempotent |
| `account.delete` | `{ confirm, password? }` | `{ deleted: true }`; adds `INVALID_PASSWORD`, `PASSWORD_REQUIRED`, `SESSION_NOT_FRESH`, and `INVALID_STATE` for the last admin whose ban is not in force |

## `sponsorships.*` (`@smog/sponsorships`)

Public: sponsoring needs no account. Every procedure declares its guards
(`SPONSORSHIP_PROCEDURE_GUARDS`, phase 6 ruling 5), on top of the
transport's `RL_API`: Turnstile (`x-turnstile-token`, `TURNSTILE_FAILED`)
and `RL_SPONSOR` (`RATE_LIMITED`) on the mutations that take money or change
a sponsorship, `RL_SPONSOR` alone on `uploadLogo`. The typed error data:
`GESTURE_UNAVAILABLE { gestureIds }`, `INVALID_STATE { reason }`
(`sponsorship.errors.<reason>`), `TOKEN_EXPIRED { expiresAt }`. Amounts are
integer cents, dates epoch milliseconds.

| Procedure | Guards | Input | Output |
|---|---|---|---|
| `sponsorships.availability` | `RL_API` | `{ gestureIds (1..100) }` | `{ checkoutEnabled, items: { gestureId, state: available \| pending \| sponsored \| unavailable, sponsorName?, endsAt? }[] }` (one D1 read; the name and end only for `live`/`expiring`) |
| `sponsorships.quote` | `RL_API` | `{ gestureIds (1..10, distinct), logo }` | `{ items: { gestureId, amountCents, includesLogo }[], totalCents, currency: "EUR", unavailable }` (`priceSponsorship`) |
| `sponsorships.checkout` | Turnstile, `RL_SPONSOR` | `checkoutInputSchema` | `{ paymentId, checkoutUrl }` |
| `sponsorships.uploadLogo` | `RL_SPONSOR` | `{ contentType: image/png \| image/jpeg \| image/webp, size ≤ 2 MiB }` | `{ key: "logos/<uuid>", uploadUrl, headers: { "content-type" }, expiresAt }` |
| `sponsorships.paymentStatus` | `RL_API` | `{ payment: uuid \| tr_… }` | `{ status, kind, totalCents, displayName, items: { gestureName, gestureSlug, includesLogo }[], renewedUntil? }`, no PII |
| `sponsorships.reedit.get` | `RL_API` | `{ token }` | `{ displayName, expiresAt, gesture: { name, slug }, hasLogo }`. `TOKEN_INVALID` for an unknown or used link, a renewal link, or a sponsorship no longer in `changes_requested`; `TOKEN_EXPIRED { expiresAt }` |
| `sponsorships.reedit.submit` | Turnstile, `RL_SPONSOR` | `{ token, displayName, logoKey? }` | `{ submitted: true }`. One D1 batch: the token used, `changes_requested → rendering` (`resubmitted { displayNameChanged, logoChanged }`) with the new name and logo, the next `render_job` and `render_started`; then `render.requested`. `INVALID_STATE noLogo` (a logo for a sponsorship without one), `logoInvalid` (missing, over 2 MiB, wrong type or signature), `stale`; the token errors as `get` (a second submit is `TOKEN_INVALID`) |
| `sponsorships.renewal.get` | `RL_API` | `{ token }` | `{ gesture: { name, slug }, displayName, endsAt, hasLogo, amountCents }` (one more year: 5000, or 6000 with a logo). Token errors as above; `INVALID_STATE notRenewable` once the sponsorship is no longer `live`/`expiring` |
| `sponsorships.renewal.checkout` | Turnstile, `RL_SPONSOR` | `{ token, checkoutId }` | `{ paymentId, checkoutUrl }`. A `renewal` payment (one item, `includes_logo` from `logo_key`) and its Mollie checkout. The same `checkoutId` answers its open payment again (`alreadySettled` once it is not open); another id while one renewal payment is open answers that one. The token is used only when the payment settles paid, so a failed payment is retried with the same link and a new `checkoutId`. `INVALID_STATE paymentsUnavailable` (no Mollie key, nothing read or written), `notRenewable`, `paymentProvider` (Mollie failed: the payment is `failed`) |

- `checkout`, in order: no `MOLLIE_API_KEY` → `INVALID_STATE paymentsUnavailable` (nothing written; `availability.checkoutEnabled` is false then). A repeat of a `checkoutId` answers the same `{ paymentId, checkoutUrl }` while the payment is `open` (concurrent repeats included), `INVALID_STATE alreadySettled` after. `expectedTotalCents` other than `priceSponsorship`'s → `PAYMENT_MISMATCH`. Unknown or unpublished gestures → `GESTURE_UNAVAILABLE { gestureIds }`. A repeat with other gestures or another total is `INVALID_STATE alreadySettled`. The logo must exist in `MEDIA`, be ≤ 2 MiB, have one of the three types and start with that type's magic bytes, else `INVALID_STATE logoInvalid` and the object is deleted; a valid logo is copied to a fresh `logos/<uuid>` (the key stored), and the upload is deleted once the batch committed. Then one D1 batch writes the payment (`id` = `checkoutId`, `initial`, `open`), the sponsor, the invoice request, the sponsorships (`awaiting_payment`), the items and the `created` events; the partial unique index decides availability (`GESTURE_UNAVAILABLE` with the ids read again). Then `POST /v2/payments` (`Idempotency-Key` = our id); a Mollie failure cancels what the batch took and answers `INVALID_STATE paymentProvider`.
- `uploadLogo`: with `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID` and `MEDIA_BUCKET` an R2 presigned `PUT` on `https://<account>.r2.cloudflarestorage.com/<bucket>/logos/<uuid>` (300 s, `Content-Type` and the declared size as `Content-Length` signed); otherwise the signed fallback below. The browser PUTs exactly the declared file with exactly `headers`.
- `paymentStatus`: by our id or Mollie's; `NOT_FOUND` otherwise. An `open` payment is re-fetched from Mollie and settled (the webhook's `settlePayment`) at most once per 5 s per payment (KV `sponsorships:status-refetch:<id>`); a Mollie failure answers the stored status. Its outputs are enqueued (logged on failure: the webhook re-derives them). `renewedUntil` is the sponsorship's end for a paid renewal.

### `POST /api/webhooks/mollie` and the legacy `POST /webhooks/mollie`

- Mollie's webhook (phase 6 ruling 2). No signature, no cookie, no origin check: the body (`id=tr_…` form, or `{ "id": … }` JSON, at most 4 KiB) is only a pointer, and the payment is re-fetched with our key. Exempt from maintenance (`/api/webhooks/*`; the alias is in `EXEMPT_PATHS`).
- `400` for a missing or malformed id (`^tr_[A-Za-z0-9]{4,64}$`), `413` over 4 KiB, `200 UNKNOWN` for an id Mollie answers 404 for: these count against `RL_API` per IP (`429` past it); a verified id never does. `200 NOT_OURS` for a payment that is neither ours by `mollie_id` nor by `metadata.paymentId`. `503` without `MOLLIE_API_KEY`, for a Mollie failure, or when an enqueue fails after the settle (Mollie retries; the retry re-derives the outputs). `500` when settling fails. `200 OK` otherwise. A 2xx has an empty body and the outcome in `x-smog-webhook`; errors answer `{ code }`. An `already` outcome re-enqueues at most once a minute per payment.
- After `settlePayment` it enqueues every event (`payment.settled`) and email (`admin_refund_needed`, chargebacks) of the result, whatever the outcome; logs are `[payments]`. The alias is the same handler and logs `[mollie] legacy webhook path used`; PROGRESS carries its removal 30 days after cutover.

### `PUT /api/logos/upload/$key` and `GET /api/logos/$key`

- `$key` is the uuid of `logos/<uuid>`.
- `PUT …?exp=<ms>&sig=<base64url>`: the signed fallback upload (no R2 tokens: dev, tests, e2e, a staging without them). `429` past `RL_SPONSOR` per IP; `409` when the key was already uploaded (one upload per URL); `403` for a foreign origin (`isForeignRequest`), a forged signature (it covers the key, the `Content-Type` and `exp`; the HMAC key is HKDF of `BETTER_AUTH_SECRET`, `info: smog-logo-upload`) or an expired one; `415` for another type or bytes that are not that type; `413` over 2 MiB (by `Content-Length` and by counting the stream). Stores the object with its type and `customMetadata.uploadedAt`; answers `{ key }`.
- `GET`: an admin session only (`401`/`403`), `404` for an unknown key; the image with `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin` and a sandboxing CSP (a stored type other than the three is served as an `application/octet-stream` attachment).

### The `EVENTS_QUEUE` consumer

- `payment.settled { paymentId }`: only for a `paid` or `refund_needed` payment (its emails only within 6 days of `paid_at`) and its items past payment (`rendering` … `expiring`, not flagged `late`/`mismatch`). Each `rendering` item without a `queued`/`running` job gets one render job (`render_started`); `render.requested` goes out for every queued job. An initial payment queues `sponsorship_received:<sponsorshipId>` and `payment_confirmed:<paymentId>:<sponsorshipId>` per sponsorship and `admin_new_sponsorship:<paymentId>:<adminId>` per admin; a renewal queues `payment_confirmed` with the new end.
- `render.requested { renderJobId }`: a `queued` job is started by `worker/render.ts` (`renderStarterFor(RENDER_MODE)`: `fake` completes it with the gesture's own video; `container`/`local` log and leave it queued until phase 7); any other job is acked.
- An invalid message is acked; a failure retries after `min(30 × 2^(attempts − 1), 3600)` s, and the DLQ takes it after 10 attempts.

## `admin.*` (`@smog/admin`)

Every admin procedure needs the admin role: `UNAUTHORIZED` for a guest,
`FORBIDDEN` for a signed-in user. The role is read from D1 on every request,
so a demotion applies to the next call. Each procedure has a kind in its
slice's `ADMIN_PROCEDURES`: a read cannot write D1 or KV, a mutation writes
one audit entry per target with its mapped action (`audit_log`, in the same
D1 batch as the change, or right after an external change), and an exempt
mutation says why it writes none. `adminProcedure` enforces the kind on every
call (a broken rule is `INTERNAL_SERVER_ERROR`, logged). One section per
area; each task fills its own.

### Dashboard

| Procedure | Input | Output | Audit |
|---|---|---|---|
| `admin.dashboard` | none | `{ gestures: { total, published, unpublished }, categories: { total, published }, users: { total, admins, banned, last30Days }, recentAudit: AuditEntry[≤5] }` | read |

One D1 batch. `banned` counts bans that have not expired; `last30Days` counts
accounts created in the last 30 days. Phase 6 adds the sponsorship stats.

### Audit log

| Procedure | Input | Output | Audit |
|---|---|---|---|
| `admin.audit.list` | `{ action?, targetType?, targetId?, actorId?, from?, to?, cursor?, limit? }` | `{ items: AuditEntry[], nextCursor: string \| null }` | read |
| `admin.audit.actors` | none | `{ actors: { id, name }[] (≤ 100, by name), truncated }` | read |

- `AuditEntry` is `{ id, action, targetType, targetId, data, actor: { id, name } | null, createdAt }`. `createdAt` is epoch milliseconds; `actor` is `null` once the account is deleted (the entries stay). `data` is parsed with its action's schema (`AUDIT_DATA_SCHEMAS`) when it has one, else returned as stored.
- `list` is newest first, a keyset page (`created_at, id`) at a time. `limit` is 1..100 (default 50). `from`/`to` are inclusive epoch milliseconds (`from` ≤ `to`, else `BAD_REQUEST`). A `targetId` needs its `targetType` (else `BAD_REQUEST`). A cursor the list did not issue is `VALIDATION` (`fieldErrors.cursor`). Every filter seeks an index ending in `created_at` (migration 0005), so a page costs its limit, not the matching rows.
- `actors` lists every admin and every account with audit entries, for the actor filter; `truncated` is `true` past 100.

### Gestures

| Procedure | Input | Output | Audit |
|---|---|---|---|
| `admin.gestures.list` | `{ q?, status?: "all" \| "published" \| "unpublished" (= "all"), category?: string[] (ids), cursor?, limit? (1..100, = 50) }` | `{ items: AdminGestureRow[], nextCursor: string \| null, counts: { total, published, unpublished } }` | read |
| `admin.gestures.get` | `{ id }` | `AdminGestureDetail` | read |
| `admin.gestures.checkName` | `{ name, excludeId? }` | `{ duplicates: { id, name, slug }[] }` | read |
| `admin.gestures.create` | `{ name, description?, keywords?, categoryIds, playbackId, muxAssetId?, published? (= true) }` | `AdminGestureDetail` | `gesture.create` |
| `admin.gestures.update` | `{ id, expectedUpdatedAt, name?, description?, keywords?, categoryIds?, playbackId?, muxAssetId? (null clears) }` | `AdminGestureDetail` | `gesture.update` |
| `admin.gestures.saveMany` | `{ items: { id, expectedUpdatedAt, patch }[] (1..50) }` | `{ items: AdminGestureRow[] }` | `gesture.update` per row |
| `admin.gestures.setPublished` | `{ id, published }` | `AdminGestureDetail` | `gesture.publish` / `gesture.unpublish` |
| `admin.gestures.bulkUpdate` | `{ ids (1..100), published?, addCategoryIds?, removeCategoryIds? }` | `{ updated }` | one `gesture.bulk_update` (`target_id` NULL) |
| `admin.gestures.delete` | `{ id, confirmName }` | `{ id }` | `gesture.delete` |

- `AdminGestureRow` is `{ id, slug, name, description, playbackId, muxAssetId, publishedAt, updatedAt, categories: { id, name, slug, published }[], keywords: string[] }` (epoch milliseconds; every category, published or not, in category order; `description` since phase 5 task 4, for the table editor). `AdminGestureDetail` adds `createdAt`. Reads come from D1, never the catalog snapshot.
- `list` is `sort_name, id` order, a keyset page at a time (index `gesture_sort_name_idx`, migration 0006). `q` matches a `normalizeText` substring of the name or of a keyword; `counts` apply `q` and `category` but not `status`. A foreign cursor is `VALIDATION`.
- Limits (ruling 8): the name 1..120 characters after trimming, the description ≤ 2000, ≤ 30 keywords of 1..60 characters (de-duplicated by `normalizeText`), 1..20 categories. Unknown categories are `VALIDATION`; an unknown gesture is `NOT_FOUND`. The slug is set at create (`-2`, `-3`, … on a collision) and never changes.
- Every write is one D1 batch (the change, the gesture's `gesture_fts` rows and the audit entry), then bumps `catalog:version`; a KV failure is logged, and the call still succeeds.
- `CONFLICT` carries `{ reason, ids? }`: `stale` (the ids changed since `expectedUpdatedAt`; nothing was written, `saveMany` is all or nothing), `published` / `sponsored` (`delete`: unpublish first; a sponsored gesture is never deleted).
- `VALIDATION`: an empty `update` patch, a `bulkUpdate` with nothing to change or a category both added and removed, a `delete` whose `confirmName` differs from the name. `INVALID_STATE`: `setPublished` to the current state, a `bulkUpdate` that would leave a gesture without a category.

### Categories

| Procedure | Input | Output | Audit |
|---|---|---|---|
| `admin.categories.list` | none | `AdminCategory[]` (≤ 100) | read |
| `admin.categories.create` | `{ name, published? (= true) }` | `AdminCategory` | `category.create` |
| `admin.categories.update` | `{ id, expectedUpdatedAt, name }` | `AdminCategory` | `category.update` |
| `admin.categories.setPublished` | `{ id, published }` | `AdminCategory` | `category.publish` / `category.unpublish` |
| `admin.categories.reorder` | `{ ids }` (every category, in the new order) | `AdminCategory[]` | one `category.reorder` (`target_id` NULL) |
| `admin.categories.delete` | `{ id }` | `{ id }` | `category.delete` |

- `AdminCategory` is `{ id, slug, name, sortOrder, publishedAt, updatedAt, gestureCount, publishedGestureCount }`, by `sort_order` then name, read from D1 (never `gestures.categories`).
- Names are 1..60 characters; a `normalizeText`-equal name is `CONFLICT` `duplicateName`. The slug stays on rename. `create` appends to the order, and refuses a 101st category (`INVALID_STATE`).
- A rename, publish or unpublish rebuilds the `gesture_fts` rows of every gesture in the category in the same batch. Every write bumps `catalog:version`.
- `update` is `CONFLICT` `stale` when the category changed since `expectedUpdatedAt`. `delete` is `CONFLICT` `inUse` while any gesture has the category (unpublish it instead). `reorder` is `INVALID_STATE` unless `ids` is exactly the current set; it sets `sort_order` 0..n-1. `setPublished` to the current state is `INVALID_STATE`.

### Mux

| Procedure | Input | Output | Audit |
|---|---|---|---|
| `admin.mux.status` | none | `{ configured: boolean }` | read |
| `admin.mux.createUpload` | none | `{ uploadId, url }` | exempt (stores nothing; ruling 4) |
| `admin.mux.uploadStatus` | `{ uploadId }` | `{ upload: "waiting" \| "asset_created" \| "errored" \| "cancelled" \| "timed_out", asset?: { id, status: "preparing" \| "ready" \| "errored", playbackId? }, error? }` | read |
| `admin.mux.assets` | `{ page? (≥ 1, = 1), limit? (1..24, = 12) }` | `{ items: { id, playbackId, status, duration, aspectRatio, createdAt, usedBy: { id, name }[] }[], hasMore, page }` | read |

- Without `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` every procedure but `status` is `INVALID_STATE`; the UI then offers only a pasted playback id. A Mux 429 is `RATE_LIMITED`.
- `createUpload` asks Mux for a direct upload: `cors_origin` the `SITE_URL` origin, `new_asset_settings: { playback_policies: ["public"], static_renditions: [{ resolution: "highest" }], passthrough: "gesture-upload:<uuid>" }`, `timeout` 3600, `test: true` in dev. The browser PUTs the file to `url` (a `*.mux.com` host, which the CSP `connect-src` allows); no video byte passes through the Worker.
- `uploadStatus` answers from the webhook's KV record (`mux:upload:<id>`, 24 h) when it is final, and from the Mux API otherwise (the KV record when Mux is unreachable). An upload Mux does not know, or that is not a `gesture-upload:`, is `NOT_FOUND`.
- `assets` lists only assets with a public playback id, newest first; `hasMore` is true when Mux filled the page. `usedBy` are the gestures whose `mux_asset_id` or `playback_id` matches.

### `POST /api/webhooks/mux`

- Mux's webhook. Not cookie-authenticated, so no origin check: the `Mux-Signature` header (`t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`, signed with `MUX_WEBHOOK_SECRET`) is verified with Web Crypto (constant time) and a 300 s window both ways.
- `400` for a missing, malformed, wrong or expired signature (logged without the body), `413` above 1 MiB, `429` when such rejected deliveries from one IP pass `RL_API` (a verified delivery is never limited), `503` without `MUX_WEBHOOK_SECRET`, `200` otherwise.
- Once per event id (`mux:event:<id>`, 24 h): `video.upload.asset_created`, `video.upload.errored`, `video.upload.cancelled`, `video.asset.ready` and `video.asset.errored` for `gesture-upload:` passthroughs update `mux:upload:<uploadId>`; a settled asset never goes back to preparing. Every other event is a `200`, ignored without touching KV (phase 7 adds the render passthroughs). Exempt from maintenance (`/api/webhooks/*`).

### Users

| Procedure | Input | Output | Audit |
|---|---|---|---|
| `admin.users.list` | `{ q?, role?: "user" \| "admin", banned?: boolean, cursor?, limit? (1..100, = 50) }` | `{ items: AdminUser[], nextCursor: string \| null }` | read |
| `admin.users.get` | `{ id }` | `AdminUser & { methods: string[], sessions, favorites, lists }` | read |
| `admin.users.setRole` | `{ userId, role }` | `{ user: AdminUser }` | `user.role_change` `{ from, to }` |
| `admin.users.ban` | `{ userId, reason (1..200, trimmed), expiresInDays? (1..365) }` | `{ user: AdminUser }` | `user.ban` `{ reason, expiresAt }` |
| `admin.users.unban` | `{ userId }` | `{ user: AdminUser }` | `user.unban` `{}` |
| `admin.users.delete` | `{ userId, confirmEmail }` | `{ id }` | `user.delete` `{ hadSessions }` |

- `AdminUser` is `{ id, name, email, emailVerified, role, banned, banReason, banExpires, createdAt }` (epoch ms). `banned` means a ban in force now (an expired ban reads `false`, with `banReason`/`banExpires` `null`); the `banned` filter means the same.
- `list` reads D1 newest first with a `(created_at, id)` keyset. `q` is a literal substring of the email or the name (`instr`, so `%` and `_` are plain characters and a long email works; D1 refuses `LIKE` patterns over 50 bytes), case-insensitive for ASCII; a name is also matched as typed (`Émile`), not case-folded beyond ASCII.
- `methods` are the account providers (`credential`, `google`, `apple`) plus `passkey`; `sessions` counts unexpired sessions; `favorites` and `lists` (owned) are counts. Phase 6 adds sponsorships by email.
- The writes call Better Auth's `auth.api` (`setRole`, `banUser`, `unbanUser`, `removeUser`) with the request's headers, then write the audit entry (the change first; a failed entry is logged and rethrown, so the call fails after the change). Better Auth's `/api/auth/admin/*` HTTP endpoints are all 404 (`ADMIN_DISABLED_PATHS`).
- A ban revokes every session of the account at once. A delete cascades the account's data; audit entries it wrote keep a `null` actor, and its `user.ban` entries lose their free-text reason (`reasonRemoved: true`) in the same batch as the `user.delete` entry. The audit data holds no email or name.
- Guards, before any change: `INVALID_STATE` with `data.reason`: `self` (own role, ban or delete), `unchanged` (the role it has), `lastAdmin` (demoting the last admin whose ban is not in force; also enforced atomically by migration 0007's trigger), `targetBanned` (promoting an account whose ban is in force), `adminTarget` (ban or delete an admin: demote first), `alreadyBanned`, `notBanned`. A Better Auth refusal is typed: `FORBIDDEN` (the actor lost the role), `NOT_FOUND`, `BAD_REQUEST`. `NOT_FOUND` for an unknown account; `VALIDATION` when `confirmEmail` differs from the email (case-insensitive).
- `bun run admin:grant` stays the way to make the first admin (spec §6); it also lifts a ban.
- `account.delete` is `INVALID_STATE` for the last admin whose ban is not in force.

### Maintenance

| Procedure | Input | Output | Audit |
|---|---|---|---|
| `admin.maintenance.get` | none | `MaintenanceSetting` | read |
| `admin.maintenance.set` | `{ enabled, message? (1..280, trimmed), until? (ISO 8601, future, at most 7 days ahead) }` | `MaintenanceSetting` | `maintenance.enable` or `maintenance.disable` `{ message, until }` |

- `MaintenanceSetting` is the KV value `maintenance`: `{ bypassVersion, enabled, message?, until? }` (`@smog/config/maintenance`, re-exported by `@smog/admin/schema`, shared with the site's gate and `bun run maintenance`). Nothing stored reads as `{ bypassVersion: 0, enabled: false }`.
- `get` reads KV past the isolate cache with `cacheTtl: 30` (KV is eventually consistent: the value may be up to 30 s old at that location, and a change made elsewhere needs up to about a minute more). `set` writes KV first, then the audit entry (`target_type` `setting`, `target_id` `maintenance`); a failed entry is logged, the previous KV value is put back (best effort, logged when it fails), and the error rethrown. Turning on keeps `bypassVersion`; turning off writes a new one, which revokes every bypass cookie. Asking for the stored state changes nothing and writes no entry. `message` and `until` only go with `enabled: true` (`VALIDATION`).
- Visitors follow within about 2 minutes (the gate's 30 s isolate cache, KV's 30 s edge cache and up to a minute of KV propagation).
- `POST /api/maintenance/bypass` (site, same-origin, `RL_AUTH`, admin session) sets the 12 h HttpOnly `smog_mx` cookie and answers `{ expiresAt, bypassVersion }` (the version it signed); it is open during a window. The settings page calls it before `set({ enabled: true })`, compares `bypassVersion` with the one `set` answered, asks again once on a mismatch and warns if it still differs. The site server function `getMaintenanceBypassStatus()` answers `{ active, expiresAt? }` for the request's own cookie, to an admin session only (anyone else: `{ active: false }`).

### Emails

| Procedure | Input | Output | Audit |
|---|---|---|---|
| `admin.emails.list` | none | `{ id, subject: Record<"nl" \| "en" \| "fr", string> }[]` | read |
| `admin.emails.preview` | `{ template, locale: "nl" \| "en" \| "fr" }` | `{ subject, html, text }` | read |

- Every template registered in `@smog/email` with its sample (`EMAIL_SAMPLES` in `@smog/email/samples`), rendered with `renderEmail`. Nothing is sent. An unknown `template` or `locale` is `VALIDATION`.
