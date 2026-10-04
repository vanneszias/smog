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
| `sponsorships.paymentStatus` | `RL_API` | `{ payment: uuid \| tr_… }` | `{ status, kind, totalCents, displayName, items: { gestureName, gestureSlug, includesLogo }[], renewedUntil?, endsAt? }`, no PII |
| `sponsorships.reedit.get` | `RL_API` | `{ token }` | `{ displayName, expiresAt, gesture: { name, slug }, hasLogo }` (`hasLogo`: a logo was paid for, `payment_item.includes_logo`). `TOKEN_INVALID` for an unknown or used link, a renewal link, or a sponsorship no longer in `changes_requested`; `TOKEN_EXPIRED { expiresAt }` |
| `sponsorships.reedit.submit` | Turnstile, `RL_SPONSOR` | `{ token, displayName, logoKey? }` | `{ submitted: true }`. One D1 batch: the token used, `changes_requested → rendering` (`resubmitted { displayNameChanged, logoChanged }`) with the new name and logo (a claimed copy of the upload, task 4's `claimLogo`; the upload is then deleted), the next `render_job` and `render_started`; then `render.requested`. `INVALID_STATE noLogo` (a logo for a sponsorship that paid for none), `logoExpired` (the upload is gone: unreferenced uploads are purged after 24 h, so upload again), `logoInvalid` (over 2 MiB, wrong type or signature, or a key another sponsorship already uses, which is left untouched), `stale`; the token errors as `get` (a second submit is `TOKEN_INVALID`) |
| `sponsorships.renewal.get` | `RL_API` | `{ token }` | `{ gesture: { name, slug }, displayName, endsAt, hasLogo, amountCents }` (one more year: 5000, or 6000 with a logo). Token errors as above; `INVALID_STATE notRenewable` once the sponsorship is no longer `live`/`expiring` |
| `sponsorships.renewal.checkout` | Turnstile, `RL_SPONSOR` | `{ token, checkoutId }` | `{ paymentId, checkoutUrl }`. A `renewal` payment (one item, `includes_logo` when a logo was paid for) and its Mollie checkout. The same `checkoutId` answers its open payment again (`alreadySettled` once it is not open); another id while one renewal payment is open answers that one. The token is used only when the payment settles paid, so a failed payment is retried with the same link and a new `checkoutId`. `INVALID_STATE paymentsUnavailable` (no Mollie key, nothing read or written), `notRenewable`, `paymentProvider` (Mollie failed: the payment is `failed`) |

- `checkout`, in order: no `MOLLIE_API_KEY` → `INVALID_STATE paymentsUnavailable` (nothing written; `availability.checkoutEnabled` is false then). A repeat of a `checkoutId` answers the same `{ paymentId, checkoutUrl }` while the payment is `open` (concurrent repeats included), `INVALID_STATE alreadySettled` after. `expectedTotalCents` other than `priceSponsorship`'s → `PAYMENT_MISMATCH`. Unknown or unpublished gestures → `GESTURE_UNAVAILABLE { gestureIds }`. A repeat with other gestures or another total is `INVALID_STATE alreadySettled`. The logo must exist in `MEDIA`, be ≤ 2 MiB, have one of the three types and start with that type's magic bytes, else `INVALID_STATE logoInvalid` and the object is deleted; a key a sponsorship already uses is `INVALID_STATE logoInvalid` and is never claimed or deleted; when the upload is gone because a concurrent repeat of the same `checkoutId` committed first, that payment's answer is returned; a valid logo is copied to a fresh `logos/<uuid>` (the key stored), and the upload is deleted once the batch committed. Then one D1 batch writes the payment (`id` = `checkoutId`, `initial`, `open`), the sponsor, the invoice request, the sponsorships (`awaiting_payment`), the items and the `created` events; the partial unique index decides availability (`GESTURE_UNAVAILABLE` with the ids read again). Then `POST /v2/payments` (`Idempotency-Key` = our id); a Mollie failure cancels what the batch took and answers `INVALID_STATE paymentProvider`, unless a concurrent repeat already stored a Mollie payment for it (`mollie_id` set): then nothing is cancelled and that checkout is the answer.
- `uploadLogo`: with `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID` and `MEDIA_BUCKET` an R2 presigned `PUT` on `https://<account>.r2.cloudflarestorage.com/<bucket>/logos/<uuid>` (300 s, `Content-Type` and the declared size as `Content-Length` signed); otherwise the signed fallback below. The browser PUTs exactly the declared file with exactly `headers`.
- `paymentStatus`: by our id or Mollie's; `NOT_FOUND` otherwise. An `open` payment is re-fetched from Mollie and settled (the webhook's `settlePayment`) at most once per 5 s per payment (KV `sponsorships:status-refetch:<id>`); a Mollie failure answers the stored status. Its outputs are enqueued (logged on failure: the webhook re-derives them). `renewedUntil` is the sponsorship's new end for a paid renewal; `endsAt` is its current, unchanged end for a renewal that did not go through (`failed`, `canceled`, `expired`), which the page names.

### `POST /api/webhooks/mollie` and the legacy `POST /webhooks/mollie`

- Mollie's webhook (phase 6 ruling 2). No signature, no cookie, no origin check: the body (`id=tr_…` form, or `{ "id": … }` JSON, at most 4 KiB) is only a pointer, and the payment is re-fetched with our key. Exempt from maintenance (`/api/webhooks/*`; the alias is in `EXEMPT_PATHS`).
- `400` for a missing or malformed id (`^tr_[A-Za-z0-9]{4,64}$`), `413` over 4 KiB, `200 UNKNOWN` for an id Mollie answers 404 for: these count against `RL_API` per IP (`429` past it); a verified id never does. `200 NOT_OURS` for a payment that is neither ours by `mollie_id` nor by `metadata.paymentId`. A Mollie payment whose `metadata.paymentId` names ours while ours stores another `mollie_id` settles as `duplicate`: nothing is applied, it is logged as an error and, once paid, every admin gets `admin_refund_needed` (reason `double`). `503` without `MOLLIE_API_KEY`, for a Mollie failure, or when an enqueue fails after the settle (Mollie retries; the retry re-derives the outputs). `500` when settling fails. `200 OK` otherwise. A 2xx has an empty body and the outcome in `x-smog-webhook`; errors answer `{ code }`. An `already` outcome skips `payment.settled` while the payment's fan-out marker (KV `mollie:fanout:<paymentId>`, 5 minutes) is set: the webhook writes it after its own `already` enqueue, and `sponsorships.paymentStatus` after the fan-out of a payment it settled, so the webhook that follows the return page does not fan out twice. The admin emails of the result are always enqueued (keyed), so a chargeback is never dropped.
- After `settlePayment` it enqueues every event (`payment.settled`) and email (`admin_refund_needed`, chargebacks) of the result, whatever the outcome; logs are `[payments]`. The alias is the same handler and logs `[mollie] legacy webhook path used`; PROGRESS carries its removal 30 days after cutover.

### `PUT /api/logos/upload/$key` and `GET /api/logos/$key`

- `$key` is the uuid of `logos/<uuid>`.
- `PUT …?exp=<ms>&sig=<base64url>`: the signed fallback upload (no R2 tokens: dev, tests, e2e, a staging without them). `429` past `RL_SPONSOR` per IP; `409` when the key was already uploaded (one upload per URL); `403` for a foreign origin (`isForeignRequest`), a forged signature (it covers the key, the `Content-Type` and `exp`; the HMAC key is HKDF of `BETTER_AUTH_SECRET`, `info: smog-logo-upload`) or an expired one; `415` for another type or bytes that are not that type; `413` over 2 MiB (by `Content-Length` and by counting the stream). Stores the object with its type and `customMetadata.uploadedAt`; answers `{ key }`.
- `GET`: an admin session only (`401`/`403`), `404` for an unknown key; the image with `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin` and a sandboxing CSP (a stored type other than the three is served as an `application/octet-stream` attachment).

### The `EVENTS_QUEUE` consumer

- `payment.settled { paymentId }`: only for a `paid` or `refund_needed` payment (its emails only within 6 days of `paid_at`) and its items past payment (`rendering` … `expiring`, not flagged `late`/`mismatch`). Each `rendering` item without a `queued`/`running` job gets one render job (`render_started`); `render.requested` goes out for every queued job. An initial payment queues `sponsorship_received:<sponsorshipId>` and `payment_confirmed:<paymentId>:<sponsorshipId>` per sponsorship and `admin_new_sponsorship:<paymentId>:<adminId>` per admin; a renewal queues `payment_confirmed` with the new end.
- `render.requested { renderJobId }`: a `queued` job is started by `worker/render.ts` (`renderStarter`, by `RENDER_MODE`): `fake` completes it with the gesture's own video; `container`/`local` create its `RenderSponsorshipVideo` Workflow instance (`RENDER_WORKFLOW.create({ id: renderJobId, params: { renderJobId } })`; an instance that already exists counts as started, any other error retries the message; without the binding the job fails at once with `workflowUnavailable` and the admin emails). Any other job is acked.
- An invalid message is acked; a failure retries after `min(30 × 2^(attempts − 1), 3600)` s, and the DLQ takes it after 10 attempts.

### The `EMAIL_QUEUE` consumer

- `apps/site/src/worker/email-queue.ts` over `processEmailMessage` (`@smog/jobs`), one message of the batch (at most 10) at a time: an invalid message, an auth email past its validity and a send the Email Service refuses for good (the recipient or the payload) are acked and logged; a message whose `idempotencyKey` has a KV `email:sent:<key>` marker is acked unsent; otherwise it is rendered (React Email, the message's locale) and sent with the env's sender (dev: the KV mailbox at `/dev/mail`; staging and production: the `EMAIL` binding, From and Reply-To from `wrangler.jsonc`), then the marker is written for 7 days. Any other failure (a render failure included) retries after `min(30 × 2^(attempts − 1), 3600)` s; after `max_retries` (5) the platform moves it to `smog-<env>-email-dlq`, which has no consumer (checked by hand).
- Producers: `QueueEmailOutbox` (`@smog/jobs`) for auth emails, the welcome email and every sponsorship email, always after the D1 commit (phase 6 ruling 8). The keys: `welcome:<userId>`, `sponsorship_received:<sponsorshipId>`, `payment_confirmed:<paymentId>:<sponsorshipId>`, `admin_new_sponsorship:<paymentId>:<adminId>`, `sponsorship_live:<sponsorshipId>:<startsAt>`, `renewal_reminder:<sponsorshipId>:<endsAt>`, `admin_render_failed:<renderJobId>:<adminId>`, `admin_refund_needed:<paymentId>:<adminId>` (`admin_refund_needed:<paymentId>:<mollieId>:<adminId>` for another Mollie payment of ours), `admin_chargeback:<paymentId>:<cents>:<adminId>`; auth emails have none. The sponsor and admin emails of a payment go out only within 6 days of when we first applied it (its first `payment_paid`/`revived`/`renewed`/`marked_paid_manually` event, else `paid_at`); `admin_refund_needed` within 6 days of the payment's first `refund_needed` flag and not once Mollie's refund covers the amount; `admin_chargeback` within 6 days of when that amount was recorded (`charged_back_at`), never for a reversal. An email whose envelope fails its schema (an address `z.email()` refuses) is dropped and logged (`[jobs] Dropped an invalid <template> message`), and the rest of the fan-out still goes out.

### Cron Triggers (`scheduled`)

`apps/site/src/worker/scheduled.ts` matches `controller.cron` against `CRON` (`@smog/jobs`), runs the sweep from `@smog/sponsorships/server` and logs `[cron] <name> <counts>`; an unknown schedule is logged and ignored, and a failing sweep is logged and rethrown (every sweep is idempotent and the next run continues). UTC, the same four in every env (`release-config-check` compares them with `wrangler.jsonc`):

| Name | Schedule | Work |
|---|---|---|
| `stale` | `0 * * * *` | `runStaleSweep`: each `open` payment older than 24 h is re-fetched from Mollie and settled (a `paid` one is never cancelled), else cancelled at Mollie when cancelable and settled `canceled`; one with a Mollie id that cannot be settled now (no key, Mollie answers 404, open and not cancelable) is kept open, and only one without a Mollie id is cancelled locally; then the reconciliation re-sends `payment.settled` for paid payments still waiting for a render job, applied by us (first settling event, else `paid_at`) between 5 minutes and 7 days ago (J-03) |
| `expiry` | `0 0 * * *` | `runExpirySweep`: `live`/`expiring` past `ends_at` become `expired`, and a sponsored Mux asset that is not the gesture's own is deleted (failures logged, J-01) |
| `reminders` | `0 8 * * *` | `runReminderSweep`: `live` ending within 30 days without a reminder becomes `expiring`, gets a renewal token valid until `ends_at` and the `renewal_reminder` email (J-02) |
| `retention` | `15 3 * * *` | `runRetentionPurge`: the daily purge (J-04; see `docs/DATA_MODEL.md`, "Retention") |

Locally: `bun run cron <stale|expiry|reminders|retention>` calls the dev server's scheduled endpoint; `bun run retention --env <env> --dry-run` counts what the purge would delete.

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
| `admin.dashboard` | none | `{ gestures: { total, published, unpublished }, categories: { total, published }, users: { total, admins, banned, last30Days }, sponsorships: { inReview, awaitingPayment, rendering, renderFailed, live, expiring, refundNeeded }, recentAudit: AuditEntry[≤5] }` | read |

One D1 batch. `banned` counts bans that have not expired; `last30Days` counts
accounts created in the last 30 days. The sponsorship counts are by status;
`refundNeeded` counts payments that need the admin: `refund_needed` with no
refund recorded yet (`refunded_cents = 0`), or a chargeback while one of the
payment's sponsorships still holds its gesture (a blocking status).

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
- Once per event id (`mux:event:<id>`, 24 h): `video.upload.asset_created`, `video.upload.errored`, `video.upload.cancelled`, `video.asset.ready` and `video.asset.errored` for `gesture-upload:` passthroughs update `mux:upload:<uploadId>`; a settled asset never goes back to preparing. Every other event is a `200`, ignored without touching KV. Exempt from maintenance (`/api/webhooks/*`).
- Render jobs (phase 7, W-02; `@smog/video` `handleMuxWebhook`'s `onRenderEvent` / `isCurrentUpload` hooks, wired by `renderWebhookHooks` in `worker/render.ts` when the env has `RENDER_WORKFLOW`): `video.asset.ready`, `video.asset.errored`, `video.upload.errored` and `video.upload.cancelled` with a `render-job:<renderJobId>` passthrough become a `RenderMuxEvent` `{ renderJobId, type: "asset.ready" | "asset.errored" | "upload.errored" | "upload.cancelled", uploadId, assetId?, playbackId?, error? }`, once per event id (the marker is written only after the hook succeeded). Codes: `OK` (forwarded), `GONE` (no instance left, `200`), `SUPERSEDED` (an `asset.ready` or `asset.errored` that `isCurrentUpload(renderJobId, uploadId, assetId)` says will never be committed: its asset is deleted and nothing is forwarded, `200`), `DUPLICATE`, `IGNORED` (no render pipeline, logged), and `503 UNAVAILABLE` when a hook, the KV write or the delete fails, so Mux retries. `video.upload.asset_created` and `video.asset.master.ready` are not routed.

  - Forwarding: `RENDER_WORKFLOW.get(renderJobId).sendEvent({ type, payload: RenderMuxEvent })`, `type` = `mux-asset-<uploadId>` (an upload id that is not 1–80 letters and digits is replaced by the first 32 hex digits of its SHA-256; Cloudflare allows at most 100 characters of `[a-zA-Z0-9_-]`). An unknown instance (`instance.not_found`) or one that is `complete`/`errored`/`terminated` is `GONE`.
  - `isCurrentUpload` reads one `render_job` row with its sponsorship: current when `mux_upload_id = uploadId` and the job is `queued`/`running`/`succeeded`, or when the asset is the job's `mux_asset_id` or the sponsorship's `video_asset_id`. An unknown job is current too (another env's asset is never deleted; forwarding it is `GONE`).
  - Without `RENDER_WORKFLOW` (`RENDER_MODE=fake`) every render event is `200 IGNORED`.

### The render Workflow `RenderSponsorshipVideo` (phase 7)

- One instance per `render_job`, its id the job id, params `{ renderJobId }`; created by the `render.requested` consumer in `container`/`local` mode. Its logic is `runRenderJob` (`@smog/sponsorships/server`); step names and configs (`RENDER_STEP_CONFIG`) are fixed: `start`, `source-lookup`, `source-wait-<n>`/`source-poll-<n>` (n ≤ 30), `source-resolve`, `logo` (with a logo), `render`, `ready-<uploadId>` (the event `mux-asset-<uploadId>`, 1 h), then `ready-wait-<n>`/`ready-poll-<n>` (n ≤ 15), `commit`; on a failure `fail`.
- Output: `{ outcome: "completed" }` (the sponsorship is `in_review` with the new video), `{ outcome: "noop" }` (the job was final or unknown, or could not be committed: its new asset is deleted), or `{ outcome: "failed", code }` (the job is `failed` with `code: detail` as its error, the sponsorship `render_failed`, one `admin_render_failed:<renderJobId>:<adminId>` email per admin). Codes: `invalidInput`, `sourceUnreadable`, `logoUnreadable`, `busy`, `renderFailed`, `uploadFailed` (the renderer's), `jobNotRunning`, `logoMissing`, `muxAssetErrored`, `muxAssetTimeout`, `muxUnavailable`, `rendererUnavailable`, `sourceUnavailable`, `unexpected`.

### The render server: `POST /render` (phase 7, `@smog/render/contract`)

- Reached only through the `RENDERER` Durable Object (`getContainer(env.RENDERER, renderJobId)`, port 8080) in `container` mode, or `RENDER_LOCAL_URL` (default `http://127.0.0.1:3002`) in `local` mode (`rendererFor`, `worker/renderer.ts`). No public route, no API key.
- Request (`renderRequestSchema`, JSON): `{ v: 1, renderJobId (uuid), input: RenderInput v1, sourceUrl (http(s): the Mux master or a static rendition), logoDataUrl (a base64 PNG/JPEG/WebP data URL of at most 2 MiB, or null), uploadUrl (the Mux direct upload the MP4 is PUT to) }`.
- Answer (`renderResultSchema`), whatever the status: `200 { ok: true, frames, width, height, bytes, ms }`, or `{ ok: false, code, message }` with `422` for `invalidInput`, `sourceUnreadable`, `logoUnreadable` (final: the Workflow does not retry), `503 busy`, `500 renderFailed`, `502 uploadFailed` (retried). An answer that is not a `RenderResult`, a network fault or the step's 20-minute timeout is retried too (2 retries, 1 min then 2 min apart). The message never holds a URL.

### Users

| Procedure | Input | Output | Audit |
|---|---|---|---|
| `admin.users.list` | `{ q?, role?: "user" \| "admin", banned?: boolean, cursor?, limit? (1..100, = 50) }` | `{ items: AdminUser[], nextCursor: string \| null }` | read |
| `admin.users.get` | `{ id }` | `AdminUser & { methods: string[], sessions, favorites, lists, sponsorships: { id, status, displayName, gesture: { id, name, slug }, createdAt }[≤100] }` | read |
| `admin.users.setRole` | `{ userId, role }` | `{ user: AdminUser }` | `user.role_change` `{ from, to }` |
| `admin.users.ban` | `{ userId, reason (1..200, trimmed), expiresInDays? (1..365) }` | `{ user: AdminUser }` | `user.ban` `{ reason, expiresAt }` |
| `admin.users.unban` | `{ userId }` | `{ user: AdminUser }` | `user.unban` `{}` |
| `admin.users.delete` | `{ userId, confirmEmail }` | `{ id }` | `user.delete` `{ hadSessions }` |

- `AdminUser` is `{ id, name, email, emailVerified, role, banned, banReason, banExpires, createdAt }` (epoch ms). `banned` means a ban in force now (an expired ban reads `false`, with `banReason`/`banExpires` `null`); the `banned` filter means the same.
- `list` reads D1 newest first with a `(created_at, id)` keyset. `q` is a literal substring of the email or the name (`instr`, so `%` and `_` are plain characters and a long email works; D1 refuses `LIKE` patterns over 50 bytes), case-insensitive for ASCII; a name is also matched as typed (`Émile`), not case-folded beyond ASCII.
- `methods` are the account providers (`credential`, `google`, `apple`) plus `passkey`; `sessions` counts unexpired sessions; `favorites` and `lists` (owned) are counts. `sponsorships` are those whose sponsor email equals the account's (case-insensitive), only while the account's email is verified (the account export's rule), newest first.
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

### Sponsorships

| Procedure | Input | Output | Audit |
|---|---|---|---|
| `admin.sponsorships.list` | `{ status?: Status[] (1..10, distinct), q? (1..200), paymentId?, refundNeeded?: boolean, from?, to? (epoch ms, inclusive, on `created_at`), cursor?, limit? (1..100, = 50) }` | `{ items: AdminSponsorshipRow[], nextCursor, counts: Record<Status, number> }` | read |
| `admin.sponsorships.get` | `{ id }` | `AdminSponsorshipDetail` | read |
| `admin.sponsorships.approve` | `{ id }` | `{ id, status: "live" }` | `sponsorship.approve` `{ startsAt, endsAt }` |
| `admin.sponsorships.reject` | `{ id, reason (1..500, trimmed) }` | `{ id, status: "rejected" }` | `sponsorship.reject` `{ reason }` |
| `admin.sponsorships.requestChanges` | `{ id }` | `{ url, expiresAt }` | `sponsorship.request_changes` `{ expiresAt }` |
| `admin.sponsorships.regenerateToken` | `{ id, purpose: "reedit" \| "renewal" }` | `{ url, expiresAt }` | `sponsorship.regenerate_token` `{ purpose, expiresAt }` |
| `admin.sponsorships.markPaid` | `{ paymentId, note? (1..200) }` | `{ paymentId, result: "marked_paid" \| "settled" \| "refund_needed", sponsorshipIds }` | `sponsorship.mark_paid` `{ paymentId, source: "manual" \| "mollie", note?, changed?: false }`, one per sponsorship |
| `admin.sponsorships.cancel` | `{ paymentId }` | `{ paymentId, result: "canceled", sponsorshipIds }` | `sponsorship.cancel` `{ paymentId, refused?: "paid" }`, one per sponsorship |
| `admin.sponsorships.forceExpire` | `{ id, confirmName }` | `{ id, status: "expired" }` | `sponsorship.force_expire` `{ from, deletesAsset }` |
| `admin.sponsorships.recordRefund` | `{ paymentId }` | `{ paymentId, amountCents, refundedCents }` | `payment.refund` `{ amountCents, refundedCents }` (target the payment) |
| `admin.sponsorships.retryRender` | `{ id }` | `{ renderJobId, attempt }` | `sponsorship.retry_render` `{ renderJobId, attempt }` |

- `AdminSponsorshipRow` is `{ id, status, gesture: { id, name, slug }, displayName, sponsor: { name, email, company }, hasLogo, invoiceRequested, amountCents, paymentStatus, playbackId, refundNeeded, createdAt, updatedAt, startsAt, endsAt }` (epoch ms). `amountCents`, `paymentStatus` and `hasLogo` come from the checkout's (`initial`) payment item; `refundNeeded` is the dashboard's rule for any payment of the sponsorship; `playbackId` is the sponsored video once it exists, else the gesture's own (the review card's thumbnail, phase 6 task 7).
- `list` reads D1 newest first with a `(created_at, id)` keyset over `sponsorship_created_id_idx` (migration 0010). `q` is a literal substring (`instr`) of the gesture name, the display name or the sponsor email, case-insensitive for ASCII. `counts` are per status under every filter except `status` (the tabs). A foreign cursor is `VALIDATION`.
- `AdminSponsorshipDetail` holds the sponsorship, the gesture with its original `playbackId`, `video: { playbackId, fakeRender }` (`fakeRender` when the video is the gesture's own: the phase 6 fake render), the sponsor and the invoice request (or `null`), `logoUrl` (`/api/logos/<uuid>`), the payments (`id, mollieId, kind, status, amountCents, refundedCents, refundedAt, refunded, chargedBackCents, chargedBackAt, paidAt, createdAt, mollieDashboardUrl, items: { sponsorshipId, gesture, amountCents, includesLogo, status }[]`), the event trail (`actor` `null` for the system or a deleted account), the render jobs (`attempt`, `status`, `error` (the URL-free summary, at most 300 characters), the dates) and the tokens (`id, purpose, createdAt, expiresAt, usedAt`; never a hash).
- Every action runs the guarded batch of `@smog/sponsorships` (injected by `@smog/api` as `AdminDeps.sponsorships`) with its audit entries in the **same** D1 batch: the change, its `sponsorship_event` and the entries land together or not at all. A lost race (a guard in the batch) and a status that does not allow the action are `INVALID_STATE stale`; the other refusals are `INVALID_STATE` `noVideo`, `gestureTaken`, `notRenewable`, `paid`, `notRefunded`, `paymentsUnavailable`, `paymentProvider` (Mollie failed); `NOT_FOUND` for an unknown sponsorship or payment. Emails (`sponsorship_live` on approve) and `payment.settled` are enqueued after the commit on the rpc env's queues (`enqueueOutputs`): a failed enqueue is retried, then logged and swallowed, except that `markPaid` fails the call when `payment.settled` cannot be enqueued (the change is committed; the stale sweep re-sends it).
- `requestChanges` and `regenerateToken` revoke the open links of that purpose; the URL holds the raw token, shown once, and is never stored, logged or audited (only its expiry is).
- `reject`, `forceExpire` and `cancel` (for each sponsorship it cancels) revoke every open re-edit and renewal link of that sponsorship in the same batch, so an emailed link answers `TOKEN_INVALID` ("link no longer usable"). Cancelling a renewal payment leaves its renewal link open for another try.
- `markPaid` and `cancel` act on the whole payment (every sponsorship in it), only while it is `open`. Both ask Mollie first (when a key and a Mollie id exist). For `markPaid`, a payment Mollie reports `paid` is settled as the webhook does, with the entries (`source: "mollie"`) in the settlement's batch; `result` is `settled`, or `refund_needed` when the settlement flagged it. Otherwise it is marked paid by hand (`marked_paid_manually`, every item to `rendering`, `payment.settled`; an item it did not move is audited `changed: false`), and only after that commit cancelled at Mollie while `isCancelable` (best effort, logged). `cancel` commits, then cancels at Mollie the same way; a payment Mollie reports `paid` is settled with `refused: "paid"` entries and answered `INVALID_STATE paid`.
- `forceExpire` needs `confirmName` equal to the gesture name (case-insensitive, else `VALIDATION`); after the batch it deletes the sponsored Mux asset through `@smog/video` `deleteAsset` (as the expiry sweep; Mux's 404 is done) unless it is the gesture's own (a failure is logged and swallowed).
- `retryRender` (A-27, phase 7) only from `render_failed`: one batch holds the transition guard, `render_failed → rendering` with its `render_retried` event (the admin as actor), the next `render_job` (a new id, which is its Workflow instance id; `attempt` = the last + 1), its `render_started` and the audit entry. After the commit `render.requested` is enqueued; a failed enqueue is logged and the call still succeeds: the hourly render watchdog re-sends `render.requested` for a job `queued` over 10 minutes. Any other status, or a second retry that lost the race, is `INVALID_STATE stale`. With `RENDER_MODE=fake` the job completes at once and the sponsorship moves to `in_review`.
- `recordRefund` re-fetches the payment from Mollie and stores `amountRefunded`; nothing refunded is `INVALID_STATE notRefunded`.

### Export

| Procedure | Input | Output | Audit |
|---|---|---|---|
| `admin.export.sponsorshipsCsv` | `{ status?: Status[], from?, to? }` | `{ csv, filename, rows }` | `export.sponsorships_csv` `{ filters, rows }` (`system`) |

- The 18 columns in the old order (A-09): ID, Status, Sponsor name (`display_name`), Sponsor email, Contact name, Company, Invoice name, VAT number, Invoice email, Invoice requested, Has logo, Payment amount (€) (the checkout's item amount, `"50.00"`), Mollie payment ID, Start date, End date, Duration (years), Gesture ID, Created at (ISO 8601).
- The CSV starts with a UTF-8 BOM. Every field is quoted with `"` doubled; rows end in CRLF. A cell that starts with a tab, CR or LF, or whose first character after leading whitespace is `=`, `+`, `-`, `@` (full-width forms folded by NFKC, and U+2212) gets a leading `'` (formula injection).
- Oldest first, read in keyset pages of 500 with no 10,000 row cap; over 50,000 rows is `INVALID_STATE tooMany` (narrow the date range). `filename` is `sponsorships-YYYY-MM-DD.csv` (the Brussels date).

## The render server (`@smog/render`, the `SmogRenderer` Container)

Bun, `packages/render/src/server/*` (phase 7 ruling 7). In the Container it listens on `0.0.0.0:8080` and is reached only through the `RENDERER` Durable Object binding (no public route, no key); `bun -F @smog/render serve` (`RENDER_MODE=local`) listens on `127.0.0.1:3002`. Its env is `renderServerEnvSchema` (`@smog/config/env/render`). The Worker and the server validate the same schemas (`@smog/render/contract`).

| Route | Body | Answer |
|---|---|---|
| `GET /health` | none | `200 { ok: true, version, browser }` (`version` is `remotion <x.y.z>`, `browser` how Chrome Headless Shell was found) |
| `POST /render` | `RenderRequest` `{ v: 1, renderJobId, input, sourceUrl, logoDataUrl, uploadUrl }`, at most 4 MiB | `RenderResult`: `200 { ok: true, frames, width, height, bytes, ms }` or `{ ok: false, code, message }` with `RENDER_ERROR_STATUS[code]` |
| `GET /assets/<renderJobId>/logo` | none | the running job's decoded logo, to loopback peers only (the render's own browser); `404` otherwise |

- Refusals before any work, all `422 invalidInput`: a body over 4 MiB, not JSON or not the schema (a logo `data:` URL over 2 MiB of bytes included), a `sourceUrl` or `uploadUrl` that is not `https:`, or an `uploadUrl` whose host is not `*.mux.com` (both allowed in dev with `RENDER_ALLOW_HTTP=1`). A logo whose bytes are not the PNG, JPEG or WebP it claims is `422 logoUnreadable`.
- One render slot, keyed by `renderJobId`. The body, the URLs and the logo are checked first. A request for the job already rendering takes the slot at once, cancels that attempt (its answer is `500 renderFailed` "superseded …", its temp files are deleted) and starts again with its own upload URL; a request for another job is `503 busy`, logged as an anomaly. An attempt is also aborted (`500 renderFailed`) when its caller disconnects and after 19 minutes. After `SIGTERM` every new request is `503 busy`, and the running render gets up to 14 minutes before it is aborted.
- The upload is retried once after a network fault or a 5xx; a 4xx is final.
- Then: the logo is written to the job's temp directory and served at `/assets/<id>/logo`; `readSourceMetadata(sourceUrl)` (a source that cannot be fetched is `500 renderFailed`, retryable; one that cannot be read is `422 sourceUnreadable`); the props are validated with `sponsoredVideoPropsSchema`; `renderMedia` (H.264, JPEG frames, `concurrency: 1`); the file is `PUT` to `uploadUrl` with `Content-Type: video/mp4` and its `Content-Length` (a refusal or a network fault is `502 uploadFailed`). The temp files are deleted whatever happens. Any other failure is `500 renderFailed`.
- Messages and logs never hold a URL: every answer and every console line, Remotion's own included, is scrubbed (`scrubUrls`), and an error's `cause` is never logged or answered.
