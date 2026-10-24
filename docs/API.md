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
| `system.whoami` | public | none | `{ user: { id, email, name, image, role, roles } \| null }` (`roles`: translator, teacher, admin held) |
| `system.authConfig` | public | none | `{ google, apple, turnstileSiteKey }` (which sign-in methods and captcha to show; no secrets) |
| `system.i18n` | public | `{ locale?: string \| null }` | `{ languages: [{ code, name, intlTag, isDefault }], locale, overlay: { <locale>: { <key>: <text> } }, version }` (the enabled languages and the `ui_string` rows of the resolved language and the default one, never the shipped base; the mobile app caches the answer, the site hands the same data to the browser through its root loader) |

## `gestures.*` (`@smog/gestures`)

Public reads. Unpublished gestures and categories never appear; the reads
come from the catalog snapshot (spec §7.1), which every admin write bumps.

**In the viewer's language (phase 10b task 5).** Every read except the
sitemap answers in the request's language (`context.locale`: the `locale`
cookie, then `Accept-Language`, only an enabled language; the mobile app
sends `Accept-Language` from its stored choice). A translated gesture shows
its own name, description, keywords and category names; one without a
`gesture_translation` row shows the default language's text and
`fallbackUsed: true` (also on a category without a translated name). A
translated gesture whose description is blank shows the default
description; one with no keyword in the language shows none. The order
stays the default language's `sort_name` (the catalogue keyset), the slug is
one per gesture (from the default name). The snapshot (typo tier and the
categories) is kept per language, all under the one `catalog:version`.
`gestures.search` searches the language's full-text rows plus the default
row of every gesture that has no translation into it, so an untranslated
gesture is still found by its Dutch name (shown in Dutch, flagged
`fallbackUsed`); the ranking sorts ties with `Intl.Collator(locale)` and the
typo tier runs on the language's projection. Favorites and lists embed the
same summaries in the request's language.

| Procedure | Input | Output |
|---|---|---|
| `gestures.categories` | none | published categories (`sort_order`, then the default name; ≤ 100), each `{ name, slug, gestureCount, fallbackUsed }` |
| `gestures.list` | `{ category?: slug[] (≤ 20, any of), cursor?, limit? (1..100, = 50) }` | `{ items: GestureSummary[], nextCursor }` (name order, keyset) |
| `gestures.search` | `{ q (≤ 100), category?, limit? (1..50, = 20) }` | `{ items: SearchResult[], total }` (FTS5 candidates ≤ 200, the TS ranking, then the typo tier; an empty `q` is the browse list) |
| `gestures.bySlug` | `{ slug }` | the gesture, also by its legacy id (`canonicalSlug` then differs); `NOT_FOUND` otherwise. `sponsor` is `null` or `{ name, until, logoPath, endCard }` for the running (`live`, `expiring`) sponsorship: `endCard` is true when its video is the gesture's own (the player draws the sponsor end card over the last seconds, phase 10b task 8), false for an older rendered video that carries the name; `logoPath` is `/api/sponsor-logos/<uuid>` or `null` |
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
| `account.me` | none | the profile (with `roles`) and the sign-in methods |
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
| `sponsorships.reedit.submit` | Turnstile, `RL_SPONSOR` | `{ token, displayName, logoKey? }` | `{ submitted: true }`. One D1 batch: the token used, `changes_requested → in_review` (`resubmitted { displayNameChanged, logoChanged }`) with the new name and logo (a claimed copy of the upload, task 4's `claimLogo`; the upload is then deleted). Nothing is rendered (phase 10b tasks 8 and 9): the end card shows the new name and logo. `INVALID_STATE noLogo` (a logo for a sponsorship that paid for none), `logoExpired` (the upload is gone: unreferenced uploads are purged after 24 h, so upload again), `logoInvalid` (over 2 MiB, wrong type or signature, or a key another sponsorship already uses, which is left untouched), `stale`; the token errors as `get` (a second submit is `TOKEN_INVALID`) |
| `sponsorships.renewal.get` | `RL_API` | `{ token }` | `{ gesture: { name, slug }, displayName, endsAt, hasLogo, amountCents }` (one more year: 5000, or 6000 with a logo). Token errors as above; `INVALID_STATE notRenewable` once the sponsorship is no longer `live`/`expiring` |
| `sponsorships.renewal.checkout` | Turnstile, `RL_SPONSOR` | `{ token, checkoutId }` | `{ paymentId, checkoutUrl }`. A `renewal` payment (one item, `includes_logo` when a logo was paid for) and its Mollie checkout. The same `checkoutId` answers its open payment again (`alreadySettled` once it is not open); another id while one renewal payment is open answers that one. The token is used only when the payment settles paid, so a failed payment is retried with the same link and a new `checkoutId`. `INVALID_STATE paymentsUnavailable` (no Mollie key, nothing read or written), `notRenewable`, `paymentProvider` (Mollie failed: the payment is `failed`) |

- `checkout`, in order: no `MOLLIE_API_KEY` → `INVALID_STATE paymentsUnavailable` (nothing written; `availability.checkoutEnabled` is false then). A repeat of a `checkoutId` answers the same `{ paymentId, checkoutUrl }` while the payment is `open` (concurrent repeats included), `INVALID_STATE alreadySettled` after. `expectedTotalCents` other than `priceSponsorship`'s → `PAYMENT_MISMATCH`. Unknown or unpublished gestures → `GESTURE_UNAVAILABLE { gestureIds }`. A repeat with other gestures or another total is `INVALID_STATE alreadySettled`. The logo must exist in `MEDIA`, be ≤ 2 MiB, have one of the three types and start with that type's magic bytes, else `INVALID_STATE logoInvalid` and the object is deleted; a key a sponsorship already uses is `INVALID_STATE logoInvalid` and is never claimed or deleted; when the upload is gone because a concurrent repeat of the same `checkoutId` committed first, that payment's answer is returned; a valid logo is copied to a fresh `logos/<uuid>` (the key stored), and the upload is deleted once the batch committed. Then one D1 batch writes the payment (`id` = `checkoutId`, `initial`, `open`), the sponsor, the invoice request, the sponsorships (`awaiting_payment`), the items and the `created` events; the partial unique index decides availability (`GESTURE_UNAVAILABLE` with the ids read again). Then `POST /v2/payments` (`Idempotency-Key` = our id); a Mollie failure cancels what the batch took and answers `INVALID_STATE paymentProvider`, unless a concurrent repeat already stored a Mollie payment for it (`mollie_id` set): then nothing is cancelled and that checkout is the answer.
- `uploadLogo`: with `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID` and `MEDIA_BUCKET` an R2 presigned `PUT` on `https://<account>.r2.cloudflarestorage.com/<bucket>/logos/<uuid>` (300 s, `Content-Type` and the declared size as `Content-Length` signed); otherwise the signed fallback below. The browser PUTs exactly the declared file with exactly `headers`.
- `paymentStatus`: by our id or Mollie's; `NOT_FOUND` otherwise. An `open` payment is re-fetched from Mollie and settled (the webhook's `settlePayment`) at most once per 5 s per payment (KV `sponsorships:status-refetch:<id>`); a Mollie failure answers the stored status. Its outputs are enqueued (logged on failure: the webhook re-derives them). `renewedUntil` is the sponsorship's new end for a paid renewal; `endsAt` is its current, unchanged end for a renewal that did not go through (`failed`, `canceled`, `expired`), which the page names.

### `POST /api/webhooks/mollie` and the legacy `POST /webhooks/mollie`

- Mollie's webhook (phase 6 ruling 2). No signature, no cookie, no origin check: the body (`id=tr_…` form, or `{ "id": … }` JSON, at most 4 KiB) is only a pointer, and the payment is re-fetched with our key. Exempt from maintenance (`/api/webhooks/*`; the alias is in `EXEMPT_PATHS`).
- `400` for a missing or malformed id (`^tr_[A-Za-z0-9]{4,64}$`), `413` over 4 KiB, `200 UNKNOWN` for an id Mollie answers 404 for: these count against `RL_API` per IP (`429` past it); a verified id never does. `200 NOT_OURS` for a payment that is neither ours by `mollie_id` nor by `metadata.paymentId`. A Mollie payment whose `metadata.paymentId` names ours while ours stores another `mollie_id` settles as `duplicate`: nothing is applied, it is logged as an error and, once paid, every admin gets `admin_refund_needed` (reason `double`). `503` without `MOLLIE_API_KEY`, for a Mollie failure, or when an enqueue fails after the settle (Mollie retries; the retry re-derives the outputs). `500` when settling fails. `200 OK` otherwise. A 2xx has an empty body and the outcome in `x-smog-webhook`; errors answer `{ code }`. An `already` outcome skips `payment.settled` while the payment's fan-out marker (KV `mollie:fanout:<paymentId>`, 5 minutes) is set: the webhook writes it after its own `already` enqueue, and `sponsorships.paymentStatus` after the fan-out of a payment it settled, so the webhook that follows the return page does not fan out twice. The admin emails of the result are always enqueued (keyed), so a chargeback is never dropped.
- After `settlePayment` it enqueues every event (`payment.settled`) and email (`admin_refund_needed`, chargebacks) of the result, whatever the outcome; logs are `[payments]`. The alias is the same handler and logs `[mollie] legacy webhook path used`; PROGRESS carries its removal 30 days after cutover.

### `PUT /api/logos/upload/$key`, `GET /api/logos/$key`, `GET /api/sponsor-logos/$key` and `POST /api/sponsor/reedit-logo`

- `$key` is the uuid of `logos/<uuid>`.
- `PUT …?exp=<ms>&sig=<base64url>`: the signed fallback upload (no R2 tokens: dev, tests, e2e, a staging without them). `429` past `RL_SPONSOR` per IP; `409` when the key was already uploaded (one upload per URL); `403` for a foreign origin (`isForeignRequest`), a forged signature (it covers the key, the `Content-Type` and `exp`; the HMAC key is HKDF of `BETTER_AUTH_SECRET`, `info: smog-logo-upload`) or an expired one; `415` for another type or bytes that are not that type; `413` over 2 MiB (by `Content-Length` and by counting the stream). Stores the object with its type and `customMetadata.uploadedAt`; answers `{ key }`.
- `GET`: an admin session only (`401`/`403`), `404` for an unknown key; the image with `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin` and a sandboxing CSP (a stored type other than the three is served as an `application/octet-stream` attachment).
- `GET /api/sponsor-logos/<uuid>` (phase 10b task 8): public, the logo of a **running** sponsorship (`live` or `expiring`) for the end card over the gesture video; the path is `sponsorLogoPath(logoKey)` from `@smog/utils`, and `gestures.bySlug` returns it as `sponsor.logoPath`. `429` past `RL_API` per IP (`<ip>:sponsor-logo`). A malformed id, a logo no running sponsorship references (pending, rejected, expired, unknown) and a missing or non-image object are all the same `404 { code: NOT_FOUND }` (`no-store`). `200`: the image with `Cache-Control: public, max-age=3600`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin` and the sandboxing CSP.
- `POST /api/sponsor/reedit-logo` `{ token }` (JSON; phase 7 task 9): the logo an open re-edit link keeps, for the re-edit page's preview (`readReeditLogo` in `@smog/sponsorships/server`). The raw token is in the body, never a URL; it is the only input, so a link reaches only its own sponsorship's logo. `403` for a foreign origin (`isForeignRequest`), `429` past `RL_API` per IP. A missing, malformed, unknown, used, expired or renewal token, a sponsorship that is no longer `changes_requested`, no paid logo, a missing object, bytes that are not PNG, JPEG or WebP and a body over 1 KiB (read capped, phase 7 fix wave) are all the same `404 { code: NOT_FOUND }` (`Cache-Control: no-store`). `200`: the bytes with the type sniffed from them, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin` and the sandboxing CSP.

### The `EVENTS_QUEUE` consumer

- `payment.settled { paymentId }`: only for a `paid` or `refund_needed` payment (its emails only within 6 days of `paid_at`) and its items past payment (`in_review` … `expiring`, not flagged `late`/`mismatch`; an old `rendering` row counts too). No render job is created any more (phase 10b task 9). An initial payment queues `sponsorship_received:<sponsorshipId>` and `payment_confirmed:<paymentId>:<sponsorshipId>` per sponsorship and `admin_new_sponsorship:<paymentId>:<adminId>` per admin; a renewal queues `payment_confirmed` with the new end.
- `render.requested { renderJobId }`: **legacy** (phase 10b task 9). Nothing produces it any more; one queued or dead-lettered before the render pipeline was retired still parses, and the consumer acks it with a log line and does nothing (a replay of such a dead letter acks too).
- An invalid message is acked; a failure retries after `min(30 × 2^(attempts − 1), 3600)` s, and the DLQ takes it after 10 attempts.

### The `EMAIL_QUEUE` consumer

- `apps/site/src/worker/email-queue.ts` over `processEmailMessage` (`@smog/jobs`), one message of the batch (at most 10) at a time: an invalid message, an auth email past its validity and a send the Email Service refuses for good (the recipient or the payload) are acked and logged; a message whose `idempotencyKey` has a KV `email:sent:<key>` marker is acked unsent; otherwise it is rendered (React Email, the message's locale) and sent with the env's sender (dev: the KV mailbox at `/dev/mail`; staging and production: the `EMAIL` binding, From and Reply-To from `wrangler.jsonc`), then the marker is written for 7 days. Any other failure (a render failure included) retries after `min(30 × 2^(attempts − 1), 3600)` s; after `max_retries` (5) the platform moves it to `smog-<env>-email-dlq`, which has its own consumer (see "The two DLQ consumers" below).
- Producers: `QueueEmailOutbox` (`@smog/jobs`) for auth emails, the welcome email and every sponsorship email, always after the D1 commit (phase 6 ruling 8). The keys: `welcome:<userId>`, `sponsorship_received:<sponsorshipId>`, `payment_confirmed:<paymentId>:<sponsorshipId>`, `admin_new_sponsorship:<paymentId>:<adminId>`, `sponsorship_live:<sponsorshipId>:<startsAt>`, `renewal_reminder:<sponsorshipId>:<endsAt>`, `admin_refund_needed:<paymentId>:<adminId>` (`admin_refund_needed:<paymentId>:<mollieId>:<adminId>` for another Mollie payment of ours), `admin_chargeback:<paymentId>:<cents>:<adminId>`; auth emails have none. The sponsor and admin emails of a payment go out only within 6 days of when we first applied it (its first `payment_paid`/`revived`/`renewed`/`marked_paid_manually` event, else `paid_at`); `admin_refund_needed` within 6 days of the payment's first `refund_needed` flag and not once Mollie's refund covers the amount; `admin_chargeback` within 6 days of when that amount was recorded (`charged_back_at`), never for a reversal. An email whose envelope fails its schema (an address `z.email()` refuses) is dropped and logged (`[jobs] Dropped an invalid <template> message`), and the rest of the fan-out still goes out.

### The two DLQ consumers (phase 9)

- `apps/site/src/worker/dlq-queue.ts` consumes `smog-<env>-email-dlq` and `smog-<env>-sponsorship-events-dlq` (an ordinary queue takes one push consumer; `max_batch_size` 10, `max_retries` 20, `retry_delay` 300 s, no DLQ of its own). Each message goes to D1 `dead_letter` (id = the queue message id, `ON CONFLICT DO NOTHING`, so a redelivery stores nothing twice) and is acked. **What is stored** (`toDeadLetter`, `@smog/jobs`): an email whose template carries a token or a code (`@smog/email/body-policy`: the four `auth/*` emails and `transactional/renewal-reminder`), an email without an `idempotencyKey` and an invalid message are stored with **no body** and `replayable = 0` (`error`: `secret_template`, `no_idempotency_key`, `invalid_message`); any other email keeps its body (`to`, `props`, the key); an event keeps its ids.
- **No silent loss while D1 is down**: a failed store is retried with `message.retry({ delaySeconds: 300 })`, 20 times (about 100 minutes). Only when the last delivery fails too does it log `[dlq] lost {"id","queue","type"}` (never a body or an address) and add one to the KV counter `dlq-lost:<yyyy-mm-dd>` (TTL 3 days), which the digest reports.
- The retention cron deletes rows older than 14 days, and `account.delete` removes the rows whose body's `to` is the deleted address.

### Cron Triggers (`scheduled`)

`apps/site/src/worker/scheduled.ts` matches `controller.cron` against `CRON` (`@smog/jobs`), runs the sweep from `@smog/sponsorships/server` and logs `[cron] <name> <counts>`; an unknown schedule is logged and ignored, and a failing sweep is logged and rethrown (every sweep is idempotent and the next run continues). UTC, the same four in every env (`release-config-check` compares them with `wrangler.jsonc`):

| Name | Schedule | Work |
|---|---|---|
| `stale` | `0 * * * *` | `runStaleSweep`: each `open` payment older than 24 h is re-fetched from Mollie and settled (a `paid` one is never cancelled), else cancelled at Mollie when cancelable and settled `canceled`; one with a Mollie id that cannot be settled now (no key, Mollie answers 404, open and not cancelable) is kept open, and only one without a Mollie id is cancelled locally; then `retireRenderStates` moves every sponsorship still in `rendering` or `render_failed` (an old row) to `in_review`, one D1 batch each: a `render_succeeded` trail event with `{ retired: true }` and no actor, and its `queued`/`running` render jobs closed as `failed` (`render pipeline retired`); the counts are `retired` and `retireFailed` (phase 10b task 9; J-03). The render-era reconciliation that re-sent `payment.settled` for paid payments waiting for a render job is gone |
| `expiry` | `0 0 * * *` | `runExpirySweep`: `live`/`expiring` past `ends_at` become `expired`, and a sponsored Mux asset that is not the gesture's own is deleted (failures logged, J-01) |
| `reminders` | `0 8 * * *` | `runReminderSweep`: `live` ending within 30 days without a reminder becomes `expiring`, gets a renewal token valid until `ends_at` and the `renewal_reminder` email (J-02) |
| `retention` | `15 3 * * *` | `runRetentionPurge`: the daily purge (J-04; see `docs/DATA_MODEL.md`, "Retention"; since phase 9 it purges `dead_letter` after 14 days too), then `runDeadLetterDigest` (`@smog/admin/server`): one `admin_dead_letter` email per admin (`admin_dead_letter:<yyyy-mm-dd>:<adminId>`), at most once a day (KV marker `dlq-digest:<date>`, TTL 3 days, written after every send was enqueued), only when open dead letters exist, `dlq-lost:*` counters are non-zero; counts and types only |

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
| `admin.dashboard` | none | `{ gestures: { total, published, unpublished }, categories: { total, published }, users: { total, admins, banned, last30Days }, sponsorships: { inReview, awaitingPayment, live, expiring, refundNeeded }, deadLetters: { email, events, oldestReceivedAt: number \| null }, recentAudit: AuditEntry[≤5] }` | read |

`deadLetters` (phase 9) counts the open dead letters per queue (neither replayed nor discarded) and the oldest one's `received_at`. One D1 batch. `banned` counts bans that have not expired; `last30Days` counts
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
| `admin.gestures.list` | `{ q?, status?: "all" \| "published" \| "unpublished" (= "all"), category?: string[] (ids), needsTranslation?: locale, needsRecut?: boolean (only the gestures whose video still has the name burned in; the counts ignore it), cursor?, limit? (1..100, = 50) }` | `{ items: AdminGestureRow[], nextCursor: string \| null, counts: { total, published, unpublished, needsRecut } }` | read |
| `admin.gestures.get` | `{ id }` | `AdminGestureDetail` | read |
| `admin.gestures.checkName` | `{ name, excludeId? }` | `{ duplicates: { id, name, slug }[] }` | read |
| `admin.gestures.create` | `{ name, description?, keywords?, categoryIds, playbackId, muxAssetId?, published? (= true), textless? (= false: the video has no text in the picture, so the player overlays the name) }` | `AdminGestureDetail` | `gesture.create` |
| `admin.gestures.update` | `{ id, expectedUpdatedAt, name?, description?, keywords?, categoryIds?, playbackId?, muxAssetId? (null clears) }` | `AdminGestureDetail` | `gesture.update` |
| `admin.gestures.saveMany` | `{ items: { id, expectedUpdatedAt, patch }[] (1..50) }` | `{ items: AdminGestureRow[] }` | `gesture.update` per row |
| `admin.gestures.setPublished` | `{ id, published }` | `AdminGestureDetail` | `gesture.publish` / `gesture.unpublish` |
| `admin.gestures.recutDone` | `{ id }` | `AdminGestureDetail` (`needsRecut` false; `updatedAt` unchanged; clearing a cleared flag writes nothing) | `gesture.recut_done` `{ name, slug }` |
| `admin.gestures.bulkUpdate` | `{ ids (1..100), published?, addCategoryIds?, removeCategoryIds? }` | `{ updated }` | one `gesture.bulk_update` (`target_id` NULL) |
| `admin.gestures.delete` | `{ id, confirmName }` | `{ id }` | `gesture.delete` |

- `AdminGestureRow` is `{ id, slug, name, description, playbackId, muxAssetId, publishedAt, updatedAt, categories: { id, name, slug, published }[], keywords: string[] }` (epoch milliseconds; every category, published or not, in category order; `description` since phase 5 task 4, for the table editor). `AdminGestureDetail` adds `createdAt`. Reads come from D1, never the catalog snapshot.
- `list` is `sort_name, id` order, a keyset page at a time (index `gesture_sort_name_idx`, migration 0006). `q` matches a `normalizeText` substring of the name or of a default-language keyword; `needsTranslation: <language>` keeps the gestures that still need a translation there (the definition of `catalogTranslation`, below); `counts` apply `q` and `category` but not `status`. A foreign cursor is `VALIDATION`.
- This editor writes the default language's text only: `update` replaces the default language's keywords and leaves every other language's alone (`gesture_keyword.locale`). The other languages are `catalogTranslation.gestures.save`.
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

### Gesture and category translations (`catalogTranslation.*`, phase 10b task 5)

A translator or an admin (`requireRole("translator")`; `admin` passes, a user or a teacher is `FORBIDDEN`). Outside `admin.*` on purpose (that router is `requireAdmin` as a whole); the writes carry the same audit guard (`adminGuard`): one D1 batch with the stale guard, the translation, this language's keywords, the full-text rows of every language of the gesture and the audit entry, then a new `catalog:version`. Only an enabled language other than the default is writable (`VALIDATION` on `locale` otherwise).

| Procedure | Input | Output | Audit |
|---|---|---|---|
| `catalogTranslation.gestures.list` | `{ locale, status?: "all" \| "needs" (= "all"), q?, cursor?, limit? (1..100, = 50) }` | `{ items: { id, slug, name, published, keywordCount, needsTranslation, translation: { name, description, keywordCount, updatedAt } \| null }[], nextCursor, report }` | read |
| `catalogTranslation.gestures.get` | `{ id }` | `{ id, slug, published, source: { name, description, keywords }, translations: { <locale>: { name, description, keywords, updatedAt } } }` | read |
| `catalogTranslation.gestures.save` | `{ id, locale, name (1..120), description? (≤ 2000), keywords? (≤ 30 x 60), expectedUpdatedAt: number \| null }` | `{ updatedAt }` | `translation.gesture_save` (`{ name, slug, locale, fields, created }`) |
| `catalogTranslation.categories.list` | `{ locale, status? }` | `{ items: { id, slug, name, published, needsTranslation, translation: { name, updatedAt } \| null }[], report }` | read |
| `catalogTranslation.categories.save` | `{ id, locale, name (1..60), expectedUpdatedAt: number \| null }` | `{ updatedAt }` | `translation.category_save` (`{ name, slug, locale, created }`) |
| `catalogTranslation.reports` | none | the report of every enabled non-default language | read |

- **Needs translation** (one definition, `@smog/db` `gestureNeedsTranslationSql`, shared by the list filter, the counts and the admin list's `needsTranslation`): no `gesture_translation` row (the default name is shown), or a blank translated description where the default has one, or no keyword in the language where the default has some. A category needs one without a `category_translation` row. The default language never needs a translation. `report` is `{ locale, gestures: { total, needsTranslation, missingName, missingDescription, missingKeywords }, categories: { total, missing } }` (every gesture, published or not).
- `expectedUpdatedAt` is the translation's own `updatedAt` (`null` when the editor read none): a save by someone else since is `CONFLICT` `{ reason: "stale" }` and nothing is written. A save that changes nothing writes nothing (no entry, no version bump) and returns the stored `updatedAt`.

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
- Render jobs (retired, phase 10b task 9): a `video.asset.*` or `video.upload.*` event whose passthrough starts with `render-job:` (any env, tagged or not) is a late event of a render that no longer exists: `200 IGNORED`, no KV, no asset deleted, nothing forwarded. The `RenderMuxEvent` routing, the Workflow `sendEvent`, `isCurrentUpload` and the `SUPERSEDED` / `GONE` answers are gone; `handleMuxWebhook` takes `{ kv, limit, now?, secret }` only.

### `POST /api/csp-report`

- The CSP's report endpoint (phase 8 ruling 11): the policy ends with `report-uri /api/csp-report; report-to csp` in every env, and documents (HTML and redirects) get `Reporting-Endpoints: csp="<request origin>/api/csp-report"`. Same-origin by design: no Origin check (a reporting agent sends none, or `null`) and no CORS (these content types need a preflight the route never grants). Exempt from maintenance (an exact `EXEMPT_PATHS` entry).
- Accepts `application/csp-report` and `application/reports+json` (only `csp-violation` entries are read). In order: another content type is an empty `415` (the rate limit is not spent); `RL_ANALYTICS` with the key `csp:<ip>` (no new binding): over the limit it answers `204` without reading or logging; the body is read through `readCappedBody` at 16 KiB: `413` over it, `400` for a broken body; everything else is an empty `204` with `no-store`. Nothing is ever echoed.
- It logs one line per body, `[csp] violation { directive, blocked, document, source, line, disposition, count }` (the first violation and a count). URLs are reduced to origin plus path: no userinfo, query or fragment, and a token-shaped segment (after `/lists/`, `/api/auth/reset-password/`, `/api/logos/upload/`, any 32+ hex or 20+ base64url non-slug segment) becomes `:token`, because re-edit and renewal URLs carry raw tokens. The sample, policy, referrer and user agent are never kept. **No relay to OpenPanel** (spec §12: consented events only).
- On staging the reports reach the Worker only once Cloudflare Access bypasses `/api/csp-report` (`docs/deployment.md`, the Access bypass list). After the launch watch the `[csp]` lines (`docs/cutover-runbook.md`, After cutover).

### Users

| Procedure | Input | Output | Audit |
|---|---|---|---|
| `admin.users.list` | `{ q?, role?: "user" \| "translator" \| "teacher" \| "admin" (`user` = no role held), banned?: boolean, cursor?, limit? (1..100, = 50) }` | `{ items: AdminUser[], nextCursor: string \| null }` | read |
| `admin.users.get` | `{ id }` | `AdminUser & { methods: string[], sessions, favorites, lists, sponsorships: { id, status, displayName, gesture: { id, name, slug }, createdAt }[≤100] }` | read |
| `admin.users.grantRole` | `{ userId, role: "translator" \| "teacher" \| "admin" }` | `{ user: AdminUser }` | `user.role_grant` `{ role }` |
| `admin.users.revokeRole` | `{ userId, role }` | `{ user: AdminUser }` | `user.role_revoke` `{ role }` |
| `admin.users.ban` | `{ userId, reason (1..200, trimmed), expiresInDays? (1..365) }` | `{ user: AdminUser }` | `user.ban` `{ reason, expiresAt }` |
| `admin.users.unban` | `{ userId }` | `{ user: AdminUser }` | `user.unban` `{}` |
| `admin.users.delete` | `{ userId, confirmEmail }` | `{ id }` | `user.delete` `{ hadSessions }` |

- `AdminUser` is `{ id, name, email, emailVerified, roles (translator, teacher, admin held, in that order; none = a learner), banned, banReason, banExpires, createdAt }` (epoch ms). `banned` means a ban in force now (an expired ban reads `false`, with `banReason`/`banExpires` `null`); the `banned` filter means the same.
- `list` reads D1 newest first with a `(created_at, id)` keyset. `q` is a literal substring of the email or the name (`instr`, so `%` and `_` are plain characters and a long email works; D1 refuses `LIKE` patterns over 50 bytes), case-insensitive for ASCII; a name is also matched as typed (`Émile`), not case-folded beyond ASCII.
- `methods` are the account providers (`credential`, `google`, `apple`) plus `passkey`; `sessions` counts unexpired sessions; `favorites` and `lists` (owned) are counts. `sponsorships` are those whose sponsor email equals the account's (case-insensitive), only while the account's email is verified (the account export's rule), newest first.
- **Roles are a set** (phase 10b, `user_role`): `grantRole` and `revokeRole` write the row and the audit entry in one D1 batch (both or neither; a role change never lands unaudited), `granted_by` is the acting admin. The `admin` role implies every other one (`hasRole`, `requireRole` in `@smog/rpc`), and the legacy `user.role` follows the `admin` row (migration 0020's triggers). The session carries `user.roles`, read from D1 on every request, so a grant or a revocation applies on the account's next request. A user cannot grant or revoke their own roles.
- The other writes call Better Auth's `auth.api` (`banUser`, `unbanUser`, `removeUser`) with the request's headers, then write the audit entry (the change first; a failed entry is logged and rethrown, so the call fails after the change). Better Auth's `/api/auth/admin/*` HTTP endpoints are all 404 (`ADMIN_DISABLED_PATHS`).
- A ban revokes every session of the account at once. A delete cascades the account's data; audit entries it wrote keep a `null` actor, and its `user.ban` entries lose their free-text reason (`reasonRemoved: true`) in the same batch as the `user.delete` entry. The audit data holds no email or name.
- Guards, before any change: `INVALID_STATE` with `data.reason`: `self` (own roles, ban or delete), `unchanged` (the role is already held, or not held on a revoke), `lastAdmin` (revoking the admin role of the last admin whose ban is not in force; also enforced atomically by migration 0020's `user_role` triggers), `targetBanned` (making an account admin whose ban is in force; translator and teacher are fine), `adminTarget` (ban or delete an admin: demote first), `alreadyBanned`, `notBanned`. A Better Auth refusal is typed: `FORBIDDEN` (the actor lost the role), `NOT_FOUND`, `BAD_REQUEST`. `NOT_FOUND` for an unknown account; `VALIDATION` when `confirmEmail` differs from the email (case-insensitive).
- `bun run admin:grant` stays the way to make the first admin (spec §6); it also lifts a ban, and it mirrors the grant into `user_role` (an explicit `INSERT OR IGNORE`, `granted_by` NULL; it never removes another role). **`--create` (phase 8 ruling 18):** `bun run admin:grant --env <dev|staging|production> --create [--yes] [--dry-run] <email>` first inserts the account when no account has that (trimmed, lower-cased) email: `email_verified = 1`, role `admin`, no credential, name `""`, a new UUID, `welcomed_at` set; with an existing account it is the plain grant. It never writes another role than `admin` and never demotes. The new admin signs in with an email code, also during maintenance (the sign-in-only routes of `/api/auth`, then `POST /api/maintenance/bypass`). On staging and production `--create` needs `--yes` (a typo would make a verified admin of someone else's address); `--dry-run` prints the single-quoted `wrangler d1 execute` line to check. The SQL is `@smog/config/admin-grant`'s.
- `account.delete` is `INVALID_STATE` for the last admin whose ban is not in force.

### Dead letters (phase 9)

| Procedure | Input | Output | Audit |
|---|---|---|---|
| `admin.deadLetters.list` | `{ status?: "open" \| "replayed" \| "discarded" (default `open`), queue?: "email" \| "events", cursor?, limit? (1..100, default 50) }` | `{ items: DeadLetter[], nextCursor: string \| null }` | read |
| `admin.deadLetters.replay` | `{ id }` | `{ replayedAt }` | `dead_letter.replay` `{ queue, type }`, `target_type` `dead_letter` |
| `admin.deadLetters.discard` | `{ id }` | `{ discardedAt }` | `dead_letter.discard` `{ queue, type }` |

- `DeadLetter` is `{ id, queue, type, attempts, receivedAt, status, replayable, replayedAt, discardedAt, error }`: **never a body, an address or a code** (the list selects no `body` column; a test fails if one appears). `error` is a reason code (`secret_template`, `no_idempotency_key`, `invalid_message`). Newest first (`received_at, id` keyset); a cursor the list did not issue is `VALIDATION`.
- `replay` puts the stored message back on its origin queue (`EMAIL_QUEUE` or `EVENTS_QUEUE`) and sets `replayed_at` in one D1 batch with its audit entry. An email goes back with its **original idempotency key**, so the consumer skips one that was in fact sent; a message **without a key is refused** whatever `replayable` says, and so is a secret template or a missing body: `INVALID_STATE { reason: "notReplayable" }`. A message already replayed or discarded is `INVALID_STATE { reason: "alreadyHandled" }` (a lost race too: the claim is guarded, and the loser writes no entry). The queue is written first, so a failed enqueue changes nothing (an error, not an entry); two admins at the same moment may both enqueue, and only one claims the row. `NOT_FOUND` for an unknown id.
- `discard` marks an open message discarded (a non-replayable one too); the same `alreadyHandled` and `NOT_FOUND` rules.

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
| `admin.emails.list` | none | `{ id, subject: Record<language code, string> }[]` (one subject per **enabled language**) | read |
| `admin.emails.preview` | `{ template, locale }` (a well-formed language code) | `{ subject, html, text }` | read |

- Every template registered in `@smog/email` with its sample (`EMAIL_SAMPLES` in `@smog/email/samples`), rendered with `renderEmail` **through the runtime catalogue** (phase 10b task 4): the `ui_string` overlay of the language, so a translator's edit shows here before the next email goes out, and a language added as data has its own subject and preview (the default language's text until it is translated). Nothing is sent. An unknown `template` or a malformed `locale` is `VALIDATION` (`BAD_REQUEST` in process); a well-formed code that is not an enabled language is `VALIDATION` with `fieldErrors.locale: ["unknown"]`.

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

- `AdminSponsorshipRow` is `{ id, status, gesture: { id, name, slug }, displayName, sponsor: { name, email, company }, hasLogo, invoiceRequested, amountCents, paymentStatus, playbackId, refundNeeded, createdAt, updatedAt, startsAt, endsAt }` (epoch ms). `amountCents`, `paymentStatus` and `hasLogo` come from the checkout's (`initial`) payment item; `refundNeeded` is the dashboard's rule for any payment of the sponsorship; `playbackId` is the sponsored video once it exists, else the gesture's own (the review card's thumbnail, phase 6 task 7).
- `list` reads D1 newest first with a `(created_at, id)` keyset over `sponsorship_created_id_idx` (migration 0010). `q` is a literal substring (`instr`) of the gesture name, the display name or the sponsor email, case-insensitive for ASCII. `counts` are per status under every filter except `status` (the tabs). A foreign cursor is `VALIDATION`.
- `AdminSponsorshipDetail` holds the sponsorship, the gesture with its original `playbackId`, `video: { playbackId }` (a rendered video of an old row; `null` for every new one), the sponsor and the invoice request (or `null`), `logoUrl` (`/api/logos/<uuid>`), the payments (`id, mollieId, kind, status, amountCents, refundedCents, refundedAt, refunded, chargedBackCents, chargedBackAt, paidAt, createdAt, mollieDashboardUrl, items: { sponsorshipId, gesture, amountCents, includesLogo, status }[]`), the event trail (`actor` `null` for the system or a deleted account), the render jobs of an old row (history only: `attempt`, `status`, `error` (the URL-free summary, at most 300 characters), the dates) and the tokens (`id, purpose, createdAt, expiresAt, usedAt`; never a hash).
- Every action runs the guarded batch of `@smog/sponsorships` (injected by `@smog/api` as `AdminDeps.sponsorships`) with its audit entries in the **same** D1 batch: the change, its `sponsorship_event` and the entries land together or not at all. A lost race (a guard in the batch) and a status that does not allow the action are `INVALID_STATE stale`; the other refusals are `INVALID_STATE` `noVideo`, `gestureTaken`, `notRenewable`, `paid`, `notRefunded`, `paymentsUnavailable`, `paymentProvider` (Mollie failed); `NOT_FOUND` for an unknown sponsorship or payment. Emails (`sponsorship_live` on approve) and `payment.settled` are enqueued after the commit on the rpc env's queues (`enqueueOutputs`): a failed enqueue is retried, then logged and swallowed, except that `markPaid` fails the call when `payment.settled` cannot be enqueued (the change is committed; the stale sweep re-sends it).
- `requestChanges` from `rejected` is allowed only while the rejection is younger than `REJECTED_VIDEO_RETENTION_DAYS` (30): after that `INVALID_STATE` with `reason: rejectedTooLongAgo` (the age runs from the latest `rejected` event, else a migrated row's `legacy` event `data.legacy.reviewedAt`, else there is no bound). The daily purge deletes the Mux asset of a sponsorship whose `rejected` event is that old, at most 20 per run, and a migrated row with no `rejected` event is never purged (`docs/cutover-runbook.md`, the rejected-asset decision).
- `requestChanges` and `regenerateToken` revoke the open links of that purpose; the URL holds the raw token, shown once, and is never stored, logged or audited (only its expiry is). **The token is in the URL fragment** (phase 9 task 7): `/sponsor/edit#token=<raw>` and `/sponsor/renew#token=<raw>` (`sponsorshipLinkUrl` in `@smog/sponsorships/schema`, the only builder; emails, this dialog), so it never reaches a server, a CDN, Workers Logs or a `Referer`. The pages read it in the browser (`useLinkToken`) and send it in the procedures' body. An old `?token=` link (already emailed, migrated, copied by an admin) still opens: the page moves the token into the fragment with `history.replaceState`. `GET /sponsors/re-edit?token=` (and `/sponsors/renew`) answer `302 Location: /sponsor/edit#token=<same>` (a 301 for a URL with a token would be cached for good; without a token it stays 301). The first request of an old link is the one place a token can reach a log (accepted: the token is single-purpose, expires, and is revoked on use, reject, expire or cancel).
- `reject`, `forceExpire` and `cancel` (for each sponsorship it cancels) revoke every open re-edit and renewal link of that sponsorship in the same batch, so an emailed link answers `TOKEN_INVALID` ("link no longer usable"). Cancelling a renewal payment leaves its renewal link open for another try.
- `markPaid` and `cancel` act on the whole payment (every sponsorship in it), only while it is `open`. Both ask Mollie first (when a key and a Mollie id exist). For `markPaid`, a payment Mollie reports `paid` is settled as the webhook does, with the entries (`source: "mollie"`) in the settlement's batch; `result` is `settled`, or `refund_needed` when the settlement flagged it. Otherwise it is marked paid by hand (`marked_paid_manually`, every item to `in_review` (the end card), `payment.settled`; an item it did not move is audited `changed: false`), and only after that commit cancelled at Mollie while `isCancelable` (best effort, logged). `cancel` commits, then cancels at Mollie the same way; a payment Mollie reports `paid` is settled with `refused: "paid"` entries and answered `INVALID_STATE paid`.
- `forceExpire` needs `confirmName` equal to the gesture name (case-insensitive, else `VALIDATION`); after the batch it deletes the sponsored Mux asset through `@smog/video` `deleteAsset` (as the expiry sweep; Mux's 404 is done) unless it is the gesture's own (a failure is logged and swallowed).
- `retryRender` (A-27, phase 7) is **removed** (phase 10b task 9): a `render_failed` row has nothing to retry, and the stale cron moves it to `in_review`. The audit action `sponsorship.retry_render` stays in the enum and renders in the audit log, for old entries.
- `recordRefund` re-fetches the payment from Mollie and stores `amountRefunded`; nothing refunded is `INVALID_STATE notRefunded`.

### Export

| Procedure | Input | Output | Audit |
|---|---|---|---|
| `admin.export.sponsorshipsCsv` | `{ status?: Status[], from?, to? }` | `{ csv, filename, rows }` | `export.sponsorships_csv` `{ filters, rows }` (`system`) |

- The 18 columns in the old order (A-09): ID, Status, Sponsor name (`display_name`), Sponsor email, Contact name, Company, Invoice name, VAT number, Invoice email, Invoice requested, Has logo, Payment amount (€) (the checkout's item amount, `"50.00"`), Mollie payment ID, Start date, End date, Duration (years), Gesture ID, Created at (ISO 8601).
- The CSV starts with a UTF-8 BOM. Every field is quoted with `"` doubled; rows end in CRLF. A cell that starts with a tab, CR or LF, or whose first character after leading whitespace is `=`, `+`, `-`, `@` (full-width forms folded by NFKC, and U+2212) gets a leading `'` (formula injection).
- Oldest first, read in keyset pages of 500 with no 10,000 row cap; over 50,000 rows is `INVALID_STATE tooMany` (narrow the date range). `filename` is `sponsorships-YYYY-MM-DD.csv` (the Brussels date).

## `translation.*` (`@smog/translation`)

Phase 10b task 4: the screens at `/admin/translation/strings` and `/admin/translation/languages`. **Who may call:** the strings, the language list and the coverage need the **`translator` role** (an `admin` passes: `admin` implies every role; `UNAUTHORIZED` for a guest, `FORBIDDEN` for any other account, the roles read from D1 on every request); creating and changing a language need the **`admin` role**. A translator reaches nothing else: every `admin.*` procedure stays `FORBIDDEN` for them (`apps/site/test/security-authz-translation.test.ts`, the authz table), and the site shows them the translation screens only (`/admin` leads to the strings, any other admin path is the 404 page, the sidebar holds the translation group without the language list). Every change writes its audit entry in the same D1 batch (`@smog/rpc/audit`'s guard, the same rule as `admin.*`) and then **bumps `i18n:version`** in KV, so an edit reaches the runtime catalogue within a minute or two without a deploy.

| Procedure | Role | Input | Output | Audit |
|---|---|---|---|---|
| `translation.strings.list` | translator | `{ namespace?, search?, locale?, status? ("missing" \| "stale" \| "invalid"), offset? (0), limit? (1..200, default 100) }` | `{ items: StringRow[], languages: string[], namespaces: string[], offset, total }` | read |
| `translation.strings.save` | translator | `{ key, locale, value: string \| null, expectedUpdatedAt: number \| null }` | `{ key, locale, cell: StringCell }` | `translation.string_save` `{ key, locale, reverted? }`, `target_type` `ui_string`, `target_id` `<locale>:<key>` |
| `translation.strings.preview` | translator | `{ format: "json" \| "csv", content, locale? }` | `ImportPlan` | read |
| `translation.strings.import` | translator | the same | `{ applied, skipped }` | `translation.string_import` `{ applied, format, skipped }`, `target_id` the language (NULL for a file with several) |
| `translation.strings.export` | translator | `{ format, locale? }` | `{ content, contentType, filename, rows }` | read |
| `translation.languages.list` | translator | none | `{ items: { code, name, intlTag, enabled, isDefault, sortOrder }[] }` (every language, enabled or not, in menu order) | read |
| `translation.languages.create` | admin | `{ code, name, intlTag, enabled? (true), sortOrder? }` | the row | `language.create` `{ code, name, intlTag, enabled }`, `target_type` `language` |
| `translation.languages.update` | admin | `{ code, name?, intlTag?, enabled?, sortOrder? }` | the row | `language.update` `{ fields }` |
| `translation.coverage` | translator | none | `{ languages: { code, name, isDefault, total, translated, missing, stale, invalid }[] }` (enabled languages) | read |
| `translation.legal.list` | translator | none | `{ items: { kind, locale, published: { version, effectiveDate, publishedAt, publishedBy } \| null, draft: { updatedAt } \| null }[] }` (privacy and terms, every enabled language) | read |
| `translation.legal.get` | translator | `{ kind, locale }` | `{ kind, locale, published: { version, effectiveDate, publishedAt, publishedBy, content } \| null, draft: { version, content, updatedAt, updatedBy } \| null, canonical: LegalDocument \| null (the Dutch published text, for any other language), history: { version, effectiveDate, publishedAt, publishedBy }[] (newest first) }`; `NOT_FOUND` for a language that is not enabled | read |
| `translation.legal.version` | translator | `{ kind, locale, version }` | `{ version, effectiveDate, publishedAt, publishedBy, content }` of one published version; `NOT_FOUND` for an unknown or unpublished one | read |
| `translation.legal.save` | translator | `{ kind, locale, content, expectedUpdatedAt: number \| null }` | `{ draft: { version, content, updatedAt, updatedBy } }` | `legal.draft_save` `{ kind, locale, version }`, `target_type` `legal_text`, `target_id` `<kind>:<locale>:<version>` |
| `translation.legal.publish` | translator | `{ kind, locale, effectiveDate (ISO date), expectedUpdatedAt }` | `{ version, effectiveDate, publishedAt, publishedBy }` | `legal.publish` `{ kind, locale, version, effectiveDate }` |
| `translation.legal.restore` | admin | `{ kind, locale, version, effectiveDate }` | the new published version | `legal.restore` `{ kind, locale, version, restoredFrom }` |
| `translation.listAudio` | translator | `{ gestureId }` | `{ items: { gestureId, locale, contentType, size, durationMs, path, updatedAt }[] }` (one clip per language) | read |
| `translation.uploadAudio` | translator | `{ gestureId, locale, contentType: audio/mpeg \| audio/mp4, size ≤ 1 MiB }` | `{ key: "audio/<gestureId>/<locale>/<uuid>", uploadUrl, headers: { "content-type" }, expiresAt }`; `NOT_FOUND` for an unknown gesture or a language that is not enabled | read |
| `translation.finalizeAudio` | translator | `{ gestureId, locale, key }` | the row (`AudioRow`); `VALIDATION` (`fieldErrors.file`: `missing`, `tooLarge`, `format`, `duration`, `key`) | `translation.audio_upload` `{ name, slug, locale, durationMs, size, replaced }`, `target_type` `gesture` |
| `translation.deleteAudio` | translator | `{ gestureId, locale }` | `{ deleted }` | `translation.audio_delete` `{ name, slug, locale }` (a clip that is not there writes nothing) |

- **Audio (phase 10b task 6, ruling 6).** One MP3 or M4A clip per gesture and language (the spoken name), at most 1 MiB and 10 s. With `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID` and `MEDIA_BUCKET` the upload URL is an R2 presigned `PUT` (300 s, `Content-Type` and the declared size signed); otherwise the signed same-origin fallback `PUT /api/audio/upload/<gestureId>/<locale>/<uuid>?exp=&sig=` (a different HKDF `info` than the logo's, so a logo signature never opens an audio key), which refuses a type other than the signed one (403), a file over 1 MiB (413), bytes that are not an MP3 or M4A (415), a clip over 10 s (422) and a key that exists (409). `finalizeAudio` reads the object (never trusts the declared type): Layer III frames or an ISO media file with audio tracks only (`moov/mvhd` duration), size and duration, copies the verified bytes to a fresh `audio/<gestureId>/<locale>/<uuid>` (a presigned PUT that is still valid cannot change what was checked), records the clip with its audit entry in one batch, then deletes the upload and the clip it replaces. A refused upload is deleted. `GET /api/audio/<gestureId>/<locale>/<uuid>` is public (a clip is as public as the gesture page), `Cache-Control: public, max-age=31536000, immutable` (the key changes on every replace), `Accept-Ranges: bytes` with `206` and `Content-Range` for a `Range`, `416` for a bad range, the sandboxing CSP and `nosniff`. The gesture detail (`gestures.bySlug`) carries `audioPath` (the clip of the viewer's language, or `null`: never another language's) and `needsRecut`.

- **The catalogue the table shows.** Every key of the shipped catalogues, with the plural forms each enabled language needs (`requiredPluralForms`: `x_many` exists for French and is *not applicable* for Dutch, shown as a dash). A cell (`StringCell`) is what a language shows now: the `ui_string` override, else the shipped text, else nothing (`missing`). **Stale** means the default-language source changed after the text was translated (the override stores `source_hash`, a hash of the source it was translated from; a default-language edit makes every translation of that key stale instead of deleting it; saving the same text again confirms it). A translation held only in the shipped files has no hash and is never stale. **Invalid** is `validateTranslation(source, value)` failing (placeholders, length). The default language is the source column and is editable too (it has no stale or invalid state).
- **`save`** is optimistic-concurrency checked: `expectedUpdatedAt` is the `updatedAt` of the cell the editor read (`null` when it had no stored row). A different current value is `CONFLICT { reason: "stale", current: StringCell }` (the batch carries a guard, so a lost race changes and audits nothing). `value: null` removes the override (back to the shipped text); saving the text that is already stored (and not stale) writes nothing and audits nothing. `VALIDATION` (`fieldErrors.value`: `empty`, `tooLong`, `placeholders`); `NOT_FOUND` for an unknown key, a language that is not enabled, or a plural form that language does not use.
- **Import** reads JSON (one language: a flat `{ key: text }` or the nested shape of the shipped catalogue, with `locale`; all languages: `{ "nl": {...}, "fr": {...} }`) or CSV (`key` and one column per language code; a `source` column is context and ignored; with `locale` only that column is read). At most 2,000,000 characters (`IMPORT_MAX_CHARS`; the RPC body cap is 5 MiB). **`preview`** is the dry run: it counts `added`, `changed`, `unchanged` and `problemCount` and lists up to 200 changes (`before`, `after`) and 200 problems (`unknownKey`, `unknownLanguage`, `notApplicable`, `placeholders`, `tooLong`, `duplicate`); it writes nothing. **`import`** applies exactly what the preview marks as changes: a row with a problem is skipped and counted (`skipped`), a blank value is "no translation" (never a revert), and one audit entry carries the row count. The writes are `json_each` upserts of 400 rows per statement in one D1 batch with the audit entry (D1 binds at most 100 parameters per statement and a batch is atomic). A file that cannot be read is `VALIDATION` with `fieldErrors.content: [<code>]`: `invalidJson`, `invalidCsv`, `noKeyColumn`, `noLanguageColumn`, `unknownLanguage`, `unsupportedShape`, `needsLanguage`.
- **Export** gives the texts each language shows now (override, else shipped), per language or all enabled ones, as JSON or CSV (UTF-8 with a BOM, CRLF; the single-language CSV also has a `source` column). A cell a spreadsheet would run as a formula gets a leading `'`, which the import takes off again. Reads write nothing and are not audited (the texts are public interface copy).
- **Languages.** `create`: `code` must be a canonical BCP-47 tag (`pt-BR`, not `pt-br`) and `intlTag` valid for `Intl`; a taken code is `CONFLICT { reason: "exists" }`. `update` of the default language cannot disable it (`INVALID_STATE { reason: "defaultLanguage" }`); asking for what is stored writes nothing; an empty patch is `VALIDATION`; an unknown code `NOT_FOUND`. A language is never deleted (its translations stay); disabling hides it from the menu, the strings table and the coverage. A new language shows the default language's text until it is translated (`i18n` fallback chain).
- **Legal texts** (phase 10b task 7, `/admin/translation/legal`). A text is a row of `legal_text` per (kind, language, version). `save` validates `content` with `validateLegalDocument` (`@smog/i18n/legal/markup`): the `LegalDocument` shape and limits, unique section anchors of the form `rights` or `data-retention`, no HTML, links only `https:`, `mailto:` or a site path, and exactly one analytics switch (`consentControl`) in the privacy text, none in the terms. A refused text is `VALIDATION` with `fieldErrors.content` (the issue codes) and `fieldErrors["content@<path>"]` (the code at `sections.2.blocks.0`). There is at most one draft per text; the first save creates it (a provisional version number after every existing one), later saves change it, and a save of the stored text writes nothing. `expectedUpdatedAt` is the draft's `updatedAt` (`null` when the editor opened none): another editor's save is `CONFLICT { current, publishedVersion }` and nothing is written. **`publish`** turns the draft into the next version (renumbered after the highest *published* one, so a restore in between never makes a newer draft look older), sets the effective date, bumps `i18n:version` and is `CONFLICT` when the draft changed, or the published history moved, since the editor read it; a translator and an admin may call it (risk R1, `docs/LEGAL-SIGNOFF.md`). **`restore`** (admin only) copies an earlier published version into a new published one with a new effective date; history is never rewritten and an open draft stays. Drafts are invisible to the public pages; only publish and restore bump the version.
- **The public pages** (`/privacy`, `/terms`) read the highest published version of the visitor's language through the `getLegalTexts` server function (`@smog/i18n/server`'s `loadLegalText`: cached per isolate with the i18n version, so an edit shows within the catalogue's propagation time, and a text that does not validate, a missing row or a failing D1 falls back to the text shipped in `@smog/i18n/legal`, then, for a language with neither, to the Dutch text). Dutch stays canonical (the translation notice and `?lang=nl` are unchanged) and the page prints the version's effective date.
- **The sign-up locale** (`@smog/auth`): the Better Auth input validator takes any well-formed code; the sign-up hook replaces one that is not an enabled language with the default language's code, never a foreign-key error.

## `teacher.*` (`@smog/lessons`, phase 10c)

The private teaching material of a gesture (spec 3, `docs/superpowers/specs/2026-10-23-phase-10c-lessons.md`). **Who may call:** the **`teacher` or `translator` role** (an `admin` passes both; `UNAUTHORIZED` for a guest or a banned account, `FORBIDDEN` for any other account, the roles read from D1 on every request). Nothing here is public: no public output schema, query, search index or source names these tables (the three guards of phase 10c task 1). A write carries the audit guard (`adminGuard`): one D1 batch with the stale guard, the upsert and the audit entry. Task 2 holds the teacher information; the drawings (task 3) join this namespace and the lessons (task 4) come as their own.

| Procedure | Role | Input | Output | Audit |
|---|---|---|---|---|
| `teacher.getInfo` | teacher, translator, admin | `{ gestureId }` | `{ defaultLocale, gesture: { id, name, slug, published }, keywords: { <locale>: string[] } (the public C words, in order), rows: { <locale>: { gestureId, locale, hc, pl, or, bw, cNote, note, summary, updatedAt, version } } }`; `NOT_FOUND` for an unknown gesture | read |
| `teacher.saveInfo` | teacher, admin: any enabled language; translator: a non-default language only | `{ gestureId, locale, fields: { hc, pl, or, bw, cNote, note, summary } (each ≤ 2,000), expectedVersion: number \| null }` | `{ version }` (`null` when nothing was stored) | `teacher.info_save` `{ fields (the changed ones), locale, version }`, `target_type` `gesture_teacher_info`, `target_id` `<gestureId>:<locale>` |

- **The lock** is the row's `version` (`gesture_teacher_info.version`, bumped by every write; also part of the PDF cache fingerprint in task 5). `expectedVersion` is the version the editor read (`null` when it read no row). A different stored version, or a row that appeared since, is `CONFLICT { reason: "stale", current: row | null }` and nothing is written (the batch carries a guard, so a lost race changes and audits nothing). Saving what is stored, or saving a language without a row with seven empty texts, writes nothing and makes no entry.
- **Errors.** A translator writing the default language is `FORBIDDEN` (they translate, they do not author; a user who is also a teacher may). A language that is not enabled is `VALIDATION` (`fieldErrors.locale`: `notEnabled`); an unknown gesture `NOT_FOUND`; a text over 2,000 characters fails the input schema.
- **The C note** is the private text around the public C keywords: `getInfo` returns the keywords of every language so the editor can list them beside it, and the keyword list itself stays edited with the gesture's text (`admin.gestures`, `catalogTranslation.gestures.save`).
- **Readiness.** `teacherInfoCoverage(db, gestureIds, locale)` (`@smog/lessons/server`, not a procedure) says per gesture whether the language has text of its own (`own`), only the default language has (`fallback`, what a PDF prints, marked) or neither (`none`); a row with only empty texts counts as nothing. The lessons (task 4) and the export dialog (task 5) call it under their own role guard.
- **Where it is edited.** The "Teacher info" card (a tab per language, the default language's text beside each translation) is on the gesture editor and on `/admin/teacher-info/$id`, the one admin screen a teacher or a translator who is not an admin may open (the admin gate narrows them to it; a teacher alone has no sidebar yet).

## The render server (retired)

The Bun render server, the `SmogRenderer` Container and `POST /render` (phase 7) were removed in phase 10b task 9; there is no route, binding or contract left. `docs/DECISIONS.md`, "Retire the render pipeline (phase 10b task 9)".

## Cache policy and the static metadata routes (phase 9 task 6 and 9)

One table, `apps/site/src/worker/cache.ts` (`cacheHeaders`, applied in `worker/headers.ts` only when the route set no `Cache-Control` of its own), and `apps/site/public/_headers` for what Cloudflare serves before the Worker runs; `apps/site/test/cache-policy.test.ts` keeps the two together and `e2e/perf.spec.ts` reads the real headers.

| Path class | `Cache-Control` |
|---|---|
| Hashed build output `/assets/<name>-<hash>.(css\|js\|woff2)` | `public, max-age=31536000, immutable` (matched by extension in `_headers`: a new hashed extension needs a line there) |
| The unhashed brand files, icons, `og.png`, any other `/assets/*` (including the generated `/assets/logo.svg`) | `public, max-age=86400` |
| `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest` | `public, max-age=3600` |
| Documents (every SSR page; each carries its CSP nonce) | `private, no-cache` |
| `/api/*`, `/_serverFn/*` (TanStack server functions, session-dependent), `/webhooks/*`, `/dev/*`, the token `302` and every 5xx (the maintenance page included) | `no-store` |

No `Vary` is needed: every locale-dependent response is a document. `_headers` also sets Permissions-Policy, COOP and HSTS for the static files; the Worker sets the same set (and the CSP) on every response it serves (`worker/headers.ts`, pinned per environment by `test/security-headers.test.ts`).

**Metadata routes.** `GET /manifest.webmanifest` (`routes/manifest[.]webmanifest.ts`, the web app manifest built from constants by `apps/site/src/lib/manifest.ts`; `application/manifest+json`, linked once from `__root` with `<link rel="manifest">`; its icons are `icon-192.png`, `icon-512.png` and `icon-maskable-512.png` in `public/`), `GET /robots.txt`, `GET /sitemap.xml` (cached an hour in the Cache API), `GET /assets/logo.svg` (the old site's logo path, generated by `@smog/brand`, kept for old links and embeds) and the app-link files under `/.well-known/` (static). `browserconfig.xml` and the Yandex manifest are dropped on purpose (`docs/DECISIONS.md`, "Parity audit (phase 9 task 9)").

## Rate limits and request caps (phase 9 task 8)

The four Workers Rate Limiting bindings (`ratelimits` in `wrangler.jsonc`; staging and production: `RL_API` 300 per 60 s, `RL_SPONSOR` 5, `RL_AUTH` 5, `RL_ANALYTICS` 120; dev 1000 each) are keyed by the client address, `cf-connecting-ip` only (`clientIp` in `apps/site/src/server/context.ts`). `X-Forwarded-For`, `Forwarded` and `X-Real-IP` are never read, so a caller cannot choose its bucket. A request without `cf-connecting-ip` (the dev server, a test) shares one `unknown` bucket: accepted, because Cloudflare always sets it in front of staging and production. `scripts/security-guard.test.ts` holds this table in code and fails for a route file that is in neither column, for a limiter its source does not name, and for a missing "none, because".

| Route file (`apps/site/src/routes/`) | Serves | Limiter | Key |
|---|---|---|---|
| `api/rpc/$.ts` | `/api/rpc/*` | `RL_API` (`@smog/rpc` handler interceptor, after the origin check, before the session read) | `api:<ip>` |
| `api/openapi/$.ts` | `/api/openapi/*` (dev, staging) | `RL_API`, the same handler options | `api:<ip>` |
| `api/auth/$.ts` | `/api/auth/*` | `RL_AUTH` on POSTs except `sign-out` and `get-session` | `auth:<ip>` |
| `api/analytics.ts` | `/api/analytics` | `RL_ANALYTICS` | `analytics:<ip>` |
| `api/csp-report.ts` | `/api/csp-report` | `RL_ANALYTICS` | `csp:<ip>` |
| `api/audio/$.ts` | `GET /api/audio/<gestureId>/<locale>/<uuid>` | `RL_API` | `<ip>:audio` |
| `api/audio/upload/$.ts` | `PUT /api/audio/upload/<gestureId>/<locale>/<uuid>` | `RL_API` | `<ip>:audio-upload` |
| `api/logos/upload.$key.ts` | `PUT /api/logos/upload/<key>` | `RL_SPONSOR` | `<ip>:logo-upload` |
| `api/sponsor/reedit-logo.ts` | `POST /api/sponsor/reedit-logo` | `RL_API` | `<ip>` |
| `api/sponsor-logos/$key.ts` | `GET /api/sponsor-logos/<uuid>` | `RL_API` | `<ip>:sponsor-logo` |
| `api/webhooks/mollie.ts`, `webhooks/mollie.ts` (legacy alias) | Mollie | `RL_API` for the counted failures only (a verified id is never limited, so a genuine retry is never refused) | `mollie-webhook:<ip>` |
| `api/webhooks/mux.ts` | Mux | `RL_API` for rejected deliveries only (a verified delivery is never limited) | `mux-webhook:<ip>` |
| `api/logos/$key.ts` | `GET /api/logos/<key>` | none, because an admin session is required and a guest has no cookie, so Better Auth answers without a D1 read | |
| `api/health.ts` | `/api/health` | none, because it reads the vars only (no D1, KV or session) | |
| `dev/e2e-seed.ts`, `dev/mail.ts`, `dev/mail[.]json.ts` | `/dev/*` | none, because dev only: 404 in staging and production | |
| `manifest[.]webmanifest.ts` | `/manifest.webmanifest` | none, because static JSON built from constants, no I/O | |
| `robots[.]txt.ts` | `/robots.txt` | none, because static text | |
| `sitemap[.]xml.ts` | `/sitemap.xml` | none, because the answer is cached for an hour in the Cache API | |
| `turnstile-bridge.ts` | `/turnstile-bridge` | none, because a static page with no I/O | |
| the SSR pages (`*.tsx`) | every page | `RL_API`, once per render, shared with the loaders' in-process calls (`limitRender`); over it the page answers 429 | `api:<ip>` |
| `worker/maintenance.ts` | `POST /api/maintenance/bypass` | `RL_AUTH` | `mx:<ip>` |
| Workers Static Assets | `/assets/*`, icons, `/.well-known/*` | none, because they are served before the Worker runs | |

Per procedure, on top of the transport's `RL_API`: `RL_SPONSOR` (`rateLimit("RL_SPONSOR")`, key `<ip>:<procedure path>`) and Turnstile on the sponsor mutations (`sponsorships.checkout`, `reedit.submit`, `renewal.checkout`) and `RL_SPONSOR` alone on `sponsorships.uploadLogo`; see the `sponsorships.*` table.

Request caps: the RPC and OpenAPI transports refuse a body over **5 MiB** with an empty `413` (`no-store`) before the origin check, the rate limit or any procedure (`capRequestBody` in `apps/site/src/server/rpc.ts`; a declared `content-length` is refused without a read, a body without one is counted as it streams and cancelled past the cap, a malformed length is a `400`). The other caps: the sponsor logo 2 MiB (`PUT` upload), the re-edit logo request 1 KiB, the Mollie webhook 4 KiB, the Mux webhook 1 MiB, the CSP report 16 KiB, the analytics relay 4 KiB.

`[csp] violation` log lines are sampled per isolate: at most 20 per minute, then one `[csp] suppressed { count }` line when the window closes (the next report after it). The answer is `204` either way.
