# Phase 6: Payments, sponsorships, jobs and emails implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone can sponsor gestures without an account. They choose up to 10 gestures, enter the display name, an optional logo, their contact details and an optional invoice request, pass Turnstile and pay through Mollie. A paid checkout enters `rendering`, gets a final video (a fake render until phase 7) and waits in the admin moderation queue. Approval puts it live for 365 days. A reminder 30 days before the end carries a renewal link, and expiry ends it. Every email goes out through the email queue, rendered with React Email in nl/en/fr. The admin can moderate, list, export, mark paid, cancel, force expire and record refunds, and every admin write is audited. The scheduled purges the privacy text promises run every day.

**Architecture:**
- New packages. Every name is already in the boundaries graph.
  - `@smog/payments` (`packages/payments`) is a thin `fetch` client for the Mollie v2 API: create, get, cancel, and the refund read. It also holds money conversion (integer cents ↔ `"50.00"`), the Mollie → `payment.status` mapping, and `./testing`, an in-memory fake plus a Bun HTTP fake with a hosted checkout page for e2e.
  - `@smog/jobs` (`packages/jobs`) holds the typed queue messages (`email`, `sponsorship-events`), the producers, the cron table (`CRON`), the `QueueEmailOutbox`, the email consumer core (render + send + idempotency) and the `RenderStarter` seam. It owns no feature logic (DECISIONS, D-JOBS).
  - `@smog/render` (`packages/render`) gets only `./contract` (`renderInputSchema`, `RenderInput`) in this phase. Phase 7 adds the compositions and the container.
  - `@smog/sponsorships` (`packages/features/sponsorships`) has `./schema`, `./contract`, `./server` and `./client`.
    - `./schema`: the wizard schema, `priceSponsorship()`, the BE VAT check, `hashSponsorshipToken`, and the status labels map.
    - `./server`: `transition()`, `transitionStatements()`, `settlePayment()`, the lifecycle builders for the admin, the render seam, the sweeps, and the public procedures.
    - The contract and router are split into one slice file per area (`public`, `checkout`, `logo`, `status`, `reedit`, `renewal`), so parallel tasks edit disjoint files.
- `@smog/email` gains the eight transactional templates and the `EmailOutbox` seam (`sendEmail()` was the phase 2 placeholder for it). `@smog/auth` takes an outbox instead of a sender, so auth emails go through the queue too (spec §6, §8.3).
- `@smog/admin` gains the `sponsorships` and `export` slices (one import, one spread and one `ADMIN_SLICES` entry each). It also gains the sponsorship stats on the dashboard and the user panel's sponsorships. The sponsorship logic is injected through `AdminDeps` by `@smog/api`, the `findSummaries` pattern: the admin never imports `@smog/sponsorships/server`.
- Site:
  - `src/worker.ts` dispatches `queue` and `scheduled` to `src/worker/{email-queue,events-queue,scheduled}.ts`.
  - Routes:
    - `/api/webhooks/mollie`, plus the legacy alias `/webhooks/mollie` for 30 days after cutover (spec §15)
    - `/api/logos/$key` (an admin read)
    - `PUT /api/logos/upload/$key` (the signed fallback upload)
    - `/sponsor`, `/sponsor/success`, `/sponsor/edit`, `/sponsor/renew`
    - `/admin/sponsorships`, `/admin/sponsorships/$id`
  - Composition components go in `src/components/sponsor/*` and `src/components/admin/sponsorships/*`.
- Mobile: the sponsor call-to-action on the gesture detail (L-17). The wizard stays web only (spec §16 flow 4).

**Tech stack:**
- As phase 5. Additions:
  - `aws4fetch` (newest) for the R2 presigned PUT, a **[dep]** DECISIONS entry. It is Web Crypto only and runs on workerd.
  - Cloudflare Queues (`queues.producers` and `queues.consumers` with DLQs), Cron Triggers (`triggers.crons` per env) and R2 (`MEDIA`), all emulated by Miniflare under `vite dev` and `@cloudflare/vitest-plugin`.
- No `@mollie/api-client`: four endpoints plus the `Idempotency-Key` header, which SDK 4.x cannot send. This follows the `@smog/video` precedent (DECISIONS, phase 5 task 3).
- **No Workflow binding in this phase.** A `workflows` entry whose class does not exist fails the deploy, so phase 7 adds `RENDER_WORKFLOW` together with its class.

**Spec:**
- §4.1, §4.2, §5.4–§5.6, §6 (the auth emails through the queue), §7 (`sponsorships.*`, `admin.sponsorships.*`, `admin.export.sponsorshipsCsv`, `RL_SPONSOR`, `turnstile`), §8.1, §8.2 (only the seam, see ruling 7), §8.3, §9 (the sponsor routes, webhooks, `/api/logos/$key`, maintenance exemptions), §12 (`sponsorship_checkout_started`), §13, §14, §15 (hashed re-edit tokens, the `/webhooks/mollie` alias, matching by `payment.mollie_id`), §16 (flows 4 and 5, StatusBadge, PriceSummary).
- Inventory rows:
  - S-01–S-09, S-11–S-16, S-18–S-24, S-26, S-27; S-10, S-17 and S-25 only up to the seam (ruling 7)
  - A-04–A-12, A-14, A-15 (without the render-retry button, which is A-27 in phase 7), A-29; A-02 and A-03 (their sponsorship parts)
  - J-01–J-04, J-06, J-07
  - E-01–E-08; E-09–E-12 move to the queue; E-13 `we_moved` is phase 8, with the migration script
  - W-01, W-12, W-13 (the mailbox), R-11, R-13/R-15 (re-verify), R-19 (the alias), L-17, P-01 (the event is now sent), P-09 (`RL_SPONSOR` in use), P-16 (`/sponsor` in the sitemap), X-03, X-06, X-07, X-08, X-13 (the sponsor part)
  - Bug list items 1, 2, 5, 6, 9, 11 (the export), 17, 19, 22–25, 28, 30, 32, 35
- Tick their `Done` boxes when shipped.

**Mandatory carries from `docs/PROGRESS.md`:**
- The sponsorship admin: the moderation queue and approve / request changes / reject (A-04–A-07); the list and the detail with the `sponsorship_event` trail (A-08, A-15, A-29); mark paid, cancel and force expire (A-10–A-12); the admin notification recipients (A-14); the CSV export (A-09). They are `admin.sponsorships.*` / `admin.export.*` slices with their `ADMIN_PROCEDURES` kinds, plus the rail's "Sponsorships" entry, the dashboard's sponsorship stats, the user panel's sponsorships and their `docs/API.md` sections. (Tasks 6, 7)
- The audit data schemas for every action phase 6 writes: `sponsorship.*`, `payment.refund` and `export.sponsorships_csv`. (Task 6)
- A sample in `EMAIL_SAMPLES` and an admin label for every new email template. (Tasks 1, 2)
- R-11: `/sponsors?gestureId=<old id>` resolves to the wizard's preselect parameter (ruling 13). (Task 8)
- The sponsor logo upload through an R2 presigned PUT (ruling 10). (Task 4)
- L-17: the sponsor call-to-action on the gesture detail, on the site and on mobile, from `sponsorships.availability`, and the `sponsorship_checkout_started` event. (Task 8)
- **Required before cutover:** a scheduled purge that deletes `audit_log` rows older than 3 years and expired `session` / `verification` rows within 30 days of their expiry, plus the audit retention cron (J-04). (Task 5, ruling 9)
- New secrets degrade cleanly when they are unset, and they join the required-secrets list and the phase 8 carry (ruling 12). (Tasks 1, 9)

## Rulings made for this plan

These are recorded here and go into `docs/DECISIONS.md` with the task that implements them.

1. **Seams between the packages.**
   - The money path, the state machine and the lifecycle logic live in `@smog/sponsorships/server`.
   - `@smog/jobs` only types messages, produces them and holds the email consumer core, which renders and sends and contains no feature logic.
   - The consumers and cron handlers that call feature services are wired in `apps/site/src/worker/*` (spec §4.1 circularity note).
   - The admin gets its sponsorship operations from `@smog/api` as `AdminDeps.sponsorships` (statement builders and services). It appends its `auditStatement` to the **same** D1 batch, so a transition, its `sponsorship_event` and its audit entry land together or not at all (phase 5 ruling 5).
   - `failWhen` (the in-batch guard) and `inList` (one `json_each` parameter per id list, because of D1's 100 bound parameters) move from `@smog/admin`'s `catalog-writes.ts` to `@smog/db` (`src/sql.ts`, next to `ref`), so the sponsorship batches use the same guards.
2. **Mollie (checked against the current Mollie docs).**
   - Mollie POSTs `application/x-www-form-urlencoded` `id=tr_…` and nothing else. **Webhooks are not signed**: the webhook is authenticated by re-fetching `GET /v2/payments/{id}` with our API key, and the body is only a pointer. Mollie expects a 2xx within about 15 s and retries anything else with backoff for about a day. It calls the webhook for most status changes, including refunds and chargebacks issued from the dashboard.
   - There is therefore **no webhook secret**. The only new secret is `MOLLIE_API_KEY`. A secret token in the URL adds nothing and is not used.
   - `POST /api/webhooks/mollie` answers as follows:
     - It reads the raw body, capped at 4 KiB, and takes `id` from the form (or from JSON, as the old handler did).
     - A missing or malformed id (`^tr_[A-Za-z0-9]{4,64}$`) is a 400.
     - An id Mollie does not know (404) is a 200 with nothing done, logged without the body. So is a payment that is not ours (no `payment.mollie_id` match and no `metadata.paymentId` match).
     - A Mollie 5xx, a network error or an unset `MOLLIE_API_KEY` is a 503, so Mollie retries.
     - Our own processing failure is a 500, so Mollie retries. Processing is idempotent (ruling 6), so that is safe.
     - Everything else is a 200.
   - It is exempt from maintenance (it is under `/api/webhooks/*`; the alias `/webhooks/mollie` is added to `EXEMPT_PATHS`). There is no origin check: no cookie, and Mollie's servers send no `Origin`.
   - **Rate limited on failures only**, as `/api/webhooks/mux`: a 400, or an id Mollie answers 404 for, counts against `RL_API` per IP and answers 429 past it. A verified id never counts, so genuine retries are never throttled.
   - The legacy `POST /webhooks/mollie` is the same handler and logs `[mollie] legacy webhook path used`. It must not go through `legacy-redirects.ts` (Mollie does not follow redirects). PROGRESS gets a carry to remove it 30 days after cutover. Migrated payments are found by `payment.mollie_id` (spec §15).
   - Creating a payment sends:
     - `POST /v2/payments` with `Idempotency-Key: <payment.id>`
     - `amount { currency: "EUR", value }` from integer cents
     - a localized `description` (`sponsor.mollie.description` with the count)
     - `redirectUrl` `${SITE_URL}/sponsor/success?payment=<payment.id>`
     - `webhookUrl` `${SITE_URL}/api/webhooks/mollie`, which is omitted when `SITE_URL` is `localhost` unless `MOLLIE_API_URL` points at the fake, which can reach it
     - `metadata { paymentId, kind }` (Mollie allows at most 1 KB)
     - `locale` `nl_BE` | `fr_BE` | `en_US`
     - No `method`: Mollie shows the profile's methods.
   - `_links.checkout.href` is required. Mollie's own expiry differs per method (15 min to 12 days for a bank transfer), so the 24 h stale sweep (ruling 9) also cancels a bank transfer that is still open.
   - The return page does not wait for the webhook. `sponsorships.paymentStatus` re-fetches an `open` payment from Mollie and applies `settlePayment`, the same function the webhook uses. That is how dev works without a reachable webhook, as the old skill advised: webhook plus return-URL polling.
   - The key is validated as `^(test|live)_\w{20,}$`. Outside production only `test_` keys are accepted, and production accepts only `live_` keys (`workerEnvSchema` refine). `MOLLIE_API_URL` (a var, default `https://api.mollie.com`) may differ only in dev, for the fake. This is the `MUX_API_URL` rule.
3. **Money and VAT, as the old system did them.**
   - Every amount is an integer number of cents (`amount_cents`, `payment_item.amount_cents`), computed only by `priceSponsorship()`: `n × (5000 + (logo ? 1000 : 0))`, and a renewal is the same per gesture.
   - Mollie's `"50.00"` is parsed with `^\d+\.\d{2}$` into cents, never through a float. `formatMoney` (`@smog/utils`, `nl-BE`/`en-BE`/`fr-BE`) formats every amount shown.
   - **No VAT is computed or shown (parity, S-09).** The prices are flat totals, with no VAT line and no discounts.
   - The invoice request (name, BE enterprise or VAT number, invoice email) is collected only for the manual invoice the organisation sends, as before. The admin sees it in the detail, the CSV and the admin email.
   - The VAT number is stored normalised as 10 digits. It is checked like the old `-validation.ts`: strip spaces and dots, 10 digits, `last2 === 97 - (first8 % 97)`. One addition: a leading `BE` (any case) is accepted and stripped, because Belgian users type it, **[ux]**.
   - The client's `expectedTotalCents` is only a consistency check: a mismatch is `PAYMENT_MISMATCH` and nothing is written. The webhook compares Mollie's amount and currency with `payment.amount_cents` for **every** payment (bug 6).
4. **Refunds, as the old system did them: by hand, in the Mollie dashboard.**
   - The old code never refunded anything, and the terms say a sponsor contacts SMOG and the payment is "handled appropriately". Phase 6 therefore does **not** call the Mollie Refunds API.
   - What it adds:
     - `refund_needed` payments (a late payment for a gesture that is taken, an amount mismatch, money that arrived for a payment already marked paid by hand) are flagged, and every admin gets the `admin_refund_needed` email.
     - They show on the dashboard and as a list filter.
     - Each payment row has a link to its Mollie dashboard page.
   - **Migration `0008_payment_refunds`** adds `payment.refunded_cents INTEGER NOT NULL DEFAULT 0` and `payment.refunded_at INTEGER` with `ALTER TABLE … ADD COLUMN`: no table rebuild, safe on existing rows. A rebuild for a new `refunded` status was rejected: `payment` has children with RESTRICT and CASCADE rules.
   - Each webhook re-fetch stores Mollie's `amountRefunded`. Refunds made in the dashboard therefore show up by themselves, with no audit entry, since it is not an admin action in our system.
   - `admin.sponsorships.recordRefund({ paymentId })` re-fetches the payment and stores `amountRefunded` and `refunded_at`, writing `payment.refund` `{ amountCents, refundedCents }`. When Mollie reports nothing refunded it answers `INVALID_STATE notRefunded`, so the admin can only record a refund that happened. It is for when the webhook missed the change; the UI says "refund in the Mollie dashboard first".
   - A fully refunded `refund_needed` payment reads as "Refunded" in the admin (derived: `refunded_cents >= amount_cents`).
5. **Checkout semantics.**
   - One checkout makes one `sponsor`, an optional `invoice_request`, n `sponsorship` rows (`awaiting_payment`, `starts_at`/`ends_at` NULL), one `payment` (`initial`, `open`), n `payment_item`s and n `created` events, all in **one D1 batch**.
   - The partial unique index decides availability atomically. A unique violation on `sponsorship_gesture_blocking_uq` becomes `GESTURE_UNAVAILABLE` with `{ gestureIds }`. Those ids are read again after the failure, since D1 does not name the row.
   - Unpublished or unknown gestures are `GESTURE_UNAVAILABLE` too (bug 39).
   - The client sends `checkoutId` (a v4 UUID it makes once per wizard run), which becomes `payment.id`. A repeat with the same id returns the existing payment's `checkoutUrl` while it is `open` (a double click or a retry after a timeout), and `INVALID_STATE alreadySettled` otherwise.
   - The Mollie payment is created **after** the batch, because it needs our payment id. If Mollie fails, a compensating batch cancels the sponsorships (`cancelled`, event `cancelled` `{ reason: "provider" }`) and marks the payment `failed`, so the gestures are free again, and the call answers `INVALID_STATE paymentProvider`. A crash between the two leaves an `open` payment with no `mollie_id`, which the stale sweep cancels after 24 h.
   - `MOLLIE_API_KEY` unset: `checkout` and `renewal.checkout` answer `INVALID_STATE paymentsUnavailable` before writing anything, and `availability` returns `checkoutEnabled: false`, so the wizard says sponsoring is paused instead of failing at the end.
   - Turnstile (`requireTurnstile`) and `rateLimit("RL_SPONSOR")` guard `checkout`, `reedit.submit` and `renewal.checkout`. `uploadLogo` is `RL_SPONSOR` only, since a Turnstile token is single use and the checkout needs it. The reads are `RL_API` only.
6. **Payment outcomes (`settlePayment(db, mollie, molliePayment)`, idempotent by the stored payment status).**
   - Mollie `paid`, our payment `open`, amount and currency matching:
     - The payment becomes `paid` with `paid_at`.
     - For an `initial` payment, every `awaiting_payment` item goes to `rendering` (`payment_paid`).
     - For a `renewal` payment, the sponsorship goes from `expiring` (or `live`) to `live` with `ends_at += 365 days` and `reminder_sent_at = NULL` (`renewed`; bug 35). The renewal token is marked used.
     - The caller then enqueues `payment.settled { paymentId }`.
   - Mollie `paid` and our payment already `paid`: nothing is written, but `payment.settled` is enqueued again. The consumer is idempotent, and a 503 or 500 retry must still get the fan-out out.
   - **Late paid** (spec §5.5, D-LATEPAID): Mollie `paid` and our payment `canceled`/`expired`/`failed`.
     - Each `cancelled` item is revived to `rendering` (`revived`) in its own guarded statement. Items whose gesture is taken now (the unique index) are not revived.
     - If any item could not be revived, the payment becomes `refund_needed` and `admin_refund_needed` goes out. The webhook still answers 200.
     - A renewal paid after its sponsorship expired is `refund_needed` too: an expired sponsorship is not revived.
   - Mollie `paid` for a payment an admin already marked paid by hand (ruling 14): `refund_needed`, since the money arrived twice.
   - Amount or currency mismatch: `refund_needed` plus the admin email, logged as an error, answered 200. It cannot happen without tampering, and a 400 would make Mollie retry for a day.
   - Mollie `failed` / `canceled` / `expired` with our payment `open`:
     - The payment takes that status.
     - For `initial`, every `awaiting_payment` item becomes `cancelled` (`payment_failed`), so the gesture is free again.
     - A renewal only marks the payment; the sponsorship keeps running until `ends_at`.
   - Mollie `open` / `pending` / `authorized`: nothing changes.
   - Every webhook re-fetch also stores `amountRefunded` (ruling 4).
7. **The render seam: what phase 7 plugs into.** Phase 6 implements none of the render pipeline. It fixes these contracts:
   1. `@smog/render/contract` `renderInputSchema` (v1): `{ v: 1, sourcePlaybackId, displayName (1..35), logoKey: string | null }`. It is stored in `render_job.input`. Phase 7 may add optional fields; a breaking change bumps `v`.
   2. **Creation.** The `sponsorship-events` consumer creates the job when a sponsorship is in `rendering` with no `queued`/`running` job (after `payment.settled`, a revival, an admin mark-paid, or a re-edit resubmission). It inserts `render_job` (`queued`, `attempt` 1 or the previous + 1, `id = workflow_instance_id` = a new UUID, D-RENDERJOB) and a `render_started` event, then enqueues `render.requested { renderJobId }` on `EVENTS_QUEUE`.
   3. **Start.** `render.requested` calls `RenderStarter.start({ renderJobId, input })` (`@smog/jobs`), chosen by `RENDER_MODE` in `apps/site/src/worker/render.ts`:
      - `fake` (dev, tests, e2e and **staging until phase 7**) calls `completeRender` at once with the gesture's own playback id and no asset id. That is the spec §8.2 "fake" mode, and the admin detail labels such a video "fake render (no overlay)".
      - `container` / `local` use `pendingRenderStarter`, which logs `[render] RENDER_MODE=<mode> is not available before phase 7` and leaves the job `queued`, so nothing is lost. Production cannot launch before phase 7 anyway.
      - **Phase 7 replaces only this switch:** `RENDER_WORKFLOW.create({ id: job.workflowInstanceId, params: { renderJobId } })`.
   4. **Progress and result**, from `@smog/sponsorships/server`, idempotent (a final job is a no-op):
      - `markRenderRunning(db, { renderJobId })`
      - `completeRender(db, { renderJobId, playbackId, assetId })`: the job `succeeded`, `sponsorship.video_playback_id` / `video_asset_id` set, `rendering → in_review` (`render_succeeded`)
      - `failRender(db, { renderJobId, error })`: the job `failed`, `rendering → render_failed`, and the `admin_render_failed` email
      - The Workflow's `commit` step and its failure path call these. The site wires them into the Workflow class in phase 7.
   5. **Retry.** The `render_failed → rendering` (`render_retried`) transition and the `sponsorship.retry_render` audit action exist now. `admin.sponsorships.retryRender` and its button are A-27, in phase 7. Until then a `render_failed` row can only be rejected or (after a request for changes) resubmitted.
   6. **Inputs phase 7 can rely on.** `/api/logos/$key` serves the logo to the workflow (an admin session, or an `x-smog-render` HMAC header phase 7 adds). The Mux passthrough prefix `render-job:<id>` is reserved: `/api/webhooks/mux` ignores it now and routes it in phase 7.
   7. **Live preview.** The wizard shows a static preview. `SponsorOverlayPreview` is the gesture's poster with the fixed layout drawn in CSS from the `@smog/render/contract` layout constants: the logo box 22 % at (50 %, 76 %), and the text at y 87 % in `#00805F`, 3.8 % of the height. Phase 7 replaces that one component with the Remotion Player `SponsorPreview`.
8. **Emails go through the queue.**
   - `@smog/email` gets `EmailOutbox { send(input: OutboxEmail) }`, where `OutboxEmail = { template, props, locale, to, idempotencyKey? }`. `From` and `Reply-To` are added by the consumer from env.
   - `@smog/jobs` `QueueEmailOutbox(EMAIL_QUEUE)` puts the message on the queue. `DirectEmailOutbox(sender, env)` renders and sends inline, for tests and as the fallback when the binding is missing (logged).
   - Better Auth takes the outbox (`createAuth({ outbox })`), so the verify, OTP, magic-link and reset emails are queued too (spec §6). The `sendEmail()` phase 2 seam is removed.
   - **The email consumer:**
     - batches of 10, handled one message at a time
     - `max_retries: 5`, per-message `retry({ delaySeconds: min(30 × 2^(attempts-1), 3600) })`
     - DLQ `smog-<env>-email-dlq`, with no consumer: messages are kept 4 days and the DLQ is checked by hand, as a PROGRESS note says
   - **Idempotency:** a message with an `idempotencyKey` is skipped when KV `email:sent:<key>` exists. The marker is written after a successful send, with a 7 day TTL. That is at least once: a crash between the send and the marker may send twice, which is accepted.
   - The keys:
     - `welcome:<userId>`
     - `sponsorship_received:<sponsorshipId>`
     - `payment_confirmed:<paymentId>:<sponsorshipId>`
     - `admin_new_sponsorship:<paymentId>:<adminId>`
     - `sponsorship_live:<sponsorshipId>:<startsAt>`
     - `renewal_reminder:<sponsorshipId>:<endsAt>`
     - `admin_render_failed:<renderJobId>:<adminId>`
     - `admin_refund_needed:<paymentId>:<adminId>`
     - Auth emails have none: each code is new.
   - **Enqueue after the commit.** State is written first, and emails are enqueued after the D1 batch: an email for something that did not happen is worse than a late one.
     - The webhook answers 503 when the `payment.settled` enqueue fails, so Mollie retries, and the retry re-enqueues (ruling 6).
     - Elsewhere (admin actions, crons) a failed `send` is retried 3 times in the process (100/400/1600 ms), then logged `[jobs] Failed to enqueue <type>` and swallowed. Queues are highly available. A transactional outbox table was rejected as too much for that risk.
   - **Recipients.**
     - Sponsor emails go to `sponsor.email` in `sponsor.locale`.
     - Admin emails (A-14) go to every `user` with `role = 'admin'`, a verified email and no ban in force, each in their `locale` (else `nl`). There is one message per admin, so one bad address does not block the others (bug 30).
   - **Welcome (E-01)** is sent once per account, when its email becomes verified: Better Auth's `databaseHooks.user.update.after`, or `create.after` for a social sign-up that arrives verified. Its key is `welcome:<userId>`. The sign-in-only instance never sends it, and migrated users (inserted by SQL in phase 8) never get it.
   - **Parity:** rejection, a request for changes, a failed payment, expiry and cancellation send no email to the sponsor (inventory §4). The admin copies the re-edit link by hand, as before.
   - Templates: `welcome`, `sponsorship_received`, `payment_confirmed` (one per gesture with that gesture's amount; also for renewals), `sponsorship_live` (the stored `starts_at`/`ends_at`, bug 1), `renewal_reminder` (says 30 days and links to `/sponsor/renew?token=`, bug 2), `admin_new_sponsorship` (after payment, with the invoice box), `admin_render_failed` and `admin_refund_needed`.
     - Dates are in Europe/Brussels and money uses `formatMoney`.
     - A missing gesture name falls back to `email.common.yourGesture` (bug 28).
     - Each template gets a sample (`EMAIL_SAMPLES`, the RFC 2606 host) and an admin label.
   - Email domains are the ones the owner set in `wrangler.jsonc`:
     - staging sends from `SMOG & Co <info@smog.zias.be>`, replies to `info@smog.zias.be`, `allowed_sender_addresses: ["info@smog.zias.be"]`
     - production sends from `SMOG & Co <noreply@smog.vlaanderen>`, replies to `info@smog.vlaanderen`
     - Phase 6 changes neither. The Email Service sends only to verified destination addresses until the domain is onboarded, which is a phase 8 carry for `smog.vlaanderen`.
9. **Crons, retention and the purge the privacy text promises.**
   - Cron Triggers are UTC and live per env under `env.<env>.triggers.crons`. They are dispatched on `controller.cron` against `CRON` in `@smog/jobs`, and each one is a testable function taking `{ db, now, … }`:
     - `0 0 * * *` `runExpirySweep`: `live`/`expiring` with `ends_at < now` become `expired`. The sponsored Mux asset is deleted when `video_asset_id` is set and is not the gesture's own; a failure is logged and swallowed (J-01).
     - `0 8 * * *` `runReminderSweep`: `live` with `now < ends_at ≤ now + 30 d` and no `reminder_sent_at` becomes `expiring` (`reminder_sent`). It sets `reminder_sent_at` and issues a `renewal` token that expires at `ends_at` (`token_issued`), then enqueues `renewal_reminder` (J-02).
     - `0 * * * *` `runStaleSweep`: every `open` payment whose `created_at` is more than 24 h ago is re-fetched first. A payment Mollie reports `paid` is settled, never cancelled. Otherwise it is cancelled in Mollie when `isCancelable` and settled as `canceled` locally either way (J-03, D-STALE). With no Mollie key, or no `mollie_id`, it is cancelled locally only.
       - **Amended (task 5 fix round 1, I-2):** only a payment **without** a `mollie_id` (it never reached Mollie) is cancelled locally. One with a `mollie_id` stays `open` (counted `keptOpen`, logged) when there is no key, when Mollie answers 404, or when it is open and not cancelable: money may still arrive for it, and the webhook or a later run settles it. Its gestures stay blocked until then.
       - The same sweep reconciles: a `paid` payment with an item in `rendering` and no `queued`/`running` render job gets `payment.settled` again (task 4 review), oldest first, at most 100 per run, for 7 days after payment; older ones are counted `stuck` and logged once a day.
     - `15 3 * * *` `runRetentionPurge` (J-04), **daily, not the spec's monthly `0 3 1 * *`.** "Within 30 days of expiry" cannot hold with a monthly run: a session that expires just after one run waits about 31 days for the next. A daily run is cheap, and it is stricter than the privacy text. What it deletes:
       - `audit_log` with `created_at < now − 3 × 365 d`
       - `session` and `verification` with `expires_at < now`
       - `sponsorship_token` used or expired more than 29 days ago (amended, task 5 fix round 1 M-4: gone within 30 days with a daily run)
       - R2 `logos/*` objects that no sponsorship references and that were uploaded more than 24 h ago
       - logos referenced only by terminal sponsorships (`rejected`, `cancelled`, `expired`) whose `updated_at` is more than 30 days old. The same batch sets `logo_key` NULL; `payment_item.includes_logo` keeps the fact for the CSV.
       - **Amended (task 5 fix round 1, I-1):** whether a sponsorship has a logo is read from `payment_item.includes_logo`, not from the status list. A logo is never released while a sponsorship that paid for it can still use it: only from an `expired` sponsorship, or a `rejected`/`cancelled` one none of whose `includes_logo` payments took money (`canceled`, `expired` or `failed`, no `paid_at`). A `rejected` sponsorship can come back through a request for changes and a `cancelled` one through a late payment; their paid logo stays. A re-edit takes a new logo when one was paid for and the key is gone.
   - Deletes run in chunks: `WHERE rowid IN (SELECT rowid … LIMIT 500)`, at most 20 chunks per table per run, and the next day continues. Migration 0008 adds `session_expires_at_idx` and `verification_expires_at_idx`, so these are seeks.
   - Per-record handlers are idempotent and re-runnable, one record per D1 batch, and a failed record is logged and skipped (spec §8.1).
   - Local runs use `bun run cron <name>` (`scripts/cron.ts`). It calls the dev server's scheduled endpoint (`/cdn-cgi/handler/scheduled?cron=…`, or the current `/cdn-cgi/local/scheduled` path; check it against the installed wrangler and Vite plugin and record it).
10. **The sponsor logo: an R2 presigned PUT, with a signed same-origin fallback.**
    - `sponsorships.uploadLogo({ contentType: image/png|image/jpeg|image/webp, size ≤ 2 MiB })` returns `{ key: "logos/<uuid>", uploadUrl, headers: { "content-type" }, expiresAt }`.
    - **When `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` are set:**
      - an `aws4fetch` presigned PUT on `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com/<MEDIA_BUCKET>/<key>`
      - `X-Amz-Expires` 300, with the signed `Content-Type` enforced (a mismatch is a 403)
      - bucket CORS: PUT from the `SITE_URL` origin with `content-type`, set by the provisioning script (ruling 12)
      - The CSP `connect-src` gets that host when `R2_ACCOUNT_ID` is set.
      - The file never passes through the Worker. Presigned URLs do not work on custom domains, and none is used.
    - **Otherwise** (dev, tests, e2e, and a staging without R2 tokens) the upload URL is `PUT /api/logos/upload/<key>?exp=<ms>&sig=<hmac>`:
      - The HMAC key is derived from `BETTER_AUTH_SECRET` with HKDF (`info: "smog-logo-upload"`), so it needs no new secret.
      - The route checks `isForeignRequest`, the signature and its expiry, the `Content-Type`, and a size of at most 2 MiB (by `Content-Length` and by counting the stream), then writes to `MEDIA` with `customMetadata.uploadedAt`.
      - It is clean degradation, not a second design: presigned is the production path, and the R2 tokens are in the production required list.
    - **The checkout verifies the object**, which fixes bug 23. `MEDIA.head(key)` must exist, be at most 2 MiB and have one of the three types. The first 12 bytes must be a PNG, JPEG or WebP signature. Otherwise the answer is `INVALID_STATE logoInvalid`, the object is deleted, and nothing is written.
    - Logos are private. `GET /api/logos/$key` streams one to an admin session (and to the phase 7 render header), with `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.
    - The wizard previews the local file through an object URL, so the CSP `img-src` gets `blob:`.
11. **Tokens (re-edit and renewal).**
    - The raw token is 32 random bytes, base64url (43 characters). Only `hashSponsorshipToken(raw)` = lowercase hex SHA-256 (Web Crypto, in `@smog/sponsorships/schema`) is stored.
    - The schema also accepts the old UUID tokens: §15 migrates the unexpired old re-edit tokens as the SHA-256 of their raw UUID, and phase 8's migration script imports `hashSponsorshipToken` from `./schema`, which the root boundaries rule allows.
    - Re-edit: TTL 7 days (S-19), single use. `requestChanges` and `regenerateToken` revoke every open token of the same purpose (`used_at = now`) in the same batch.
    - Renewal: issued by the reminder sweep, expires at `ends_at`, single use. The admin can regenerate it for an `expiring` sponsorship (a lost email).
    - `TOKEN_INVALID` (unknown or used) and `TOKEN_EXPIRED` (with `expiresAt`, for the page's message) answer the public reads. The raw token appears only in the link: the email, or the admin's copy dialog, shown once.
    - Re-edit edits `display_name` (≤ 35) and, only if the sponsorship has a logo, the logo. The gesture is locked, nothing is paid again, and the sponsorship goes `changes_requested → rendering` (`resubmitted`), which leads to a new render job.
12. **Secrets, staging and provisioning.**
    - New secrets, all optional in `workerSecretsSchema`, each degrading cleanly:
      - `MOLLIE_API_KEY`: without it, payments are paused (ruling 5), the webhook answers 503 and the sweeps work locally.
      - `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`: without them, the signed fallback upload is used.
    - New vars: `MOLLIE_API_URL` (dev-only override), `R2_ACCOUNT_ID` and `MEDIA_BUCKET`, plus `RENDER_MODE` set per env (`fake` in dev and staging, `container` in production).
    - There are **no webhook secrets** (ruling 2).
    - `.dev.vars.example` documents each of them.
    - **The required-secrets list starts now.** `REQUIRED_WORKER_CONFIG` in `@smog/config/env/worker` lists, per env, the secrets and vars a deploy needs:
      - production: `BETTER_AUTH_SECRET`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_SITE_KEY` (var), `MOLLIE_API_KEY`, `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_WEBHOOK_SECRET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID` (var)
      - staging: `BETTER_AUTH_SECRET`, `TURNSTILE_SECRET_KEY`
    - `scripts/release-config-check.ts` asserts that every listed key exists in the env schema and in `.dev.vars.example` (for secrets) or in `wrangler.jsonc` vars (for vars). Phase 8 makes the deploy check them against `wrangler secret list` (PROGRESS carry, extended with these names).
    - **Staging deploys are real**, so every new binding must exist before the first develop push that uses it. `scripts/ensure-cloudflare-resources.ts --env <env>` (Bun, tested with a fake `wrangler` runner) reads `wrangler.jsonc` and creates what is missing:
      - the queues and their DLQs (`wrangler queues list` / `create`)
      - the R2 bucket, and its CORS (`wrangler r2 bucket cors set`)
      - It changes nothing that exists.
      - **Staging creates, production checks.** `deploy.yml` runs it with `--create` for staging. For production it runs with `--check` and fails, printing the exact `wrangler` commands to run, unless the repository variable `SMOG_PROVISION_PRODUCTION` is `1` (the owner opts in). It never deletes or modifies an existing resource, in any env.
    - `deploy.yml` runs that script before the D1 migrations, and `release-config-check` asserts both that it does and the naming: `smog-<env>-email`, `-email-dlq`, `-sponsorship-events`, `-sponsorship-events-dlq`, `-media`, where every consumer has a DLQ.
13. **Wizard URLs, R-11 and L-17.**
    - The wizard's preselect parameter is `?gesture=<slug>`. It applies only when the selection is empty and the gesture is available (S-03).
    - `legacy-redirects.ts` gets one D1-backed rename, like the category names: `/sponsors?gestureId=<id|legacy_id|slug>` and `/sponsor?gestureId=…` become **one 301** to `/sponsor?gesture=<slug>`, with the other query keys kept. An unknown value is dropped, so the wizard opens empty.
    - L-17 on the site: the gesture detail gets a `SponsorCta` card from `sponsorships.availability` (one id).
      - `available`: "Sponsor this gesture", a link to `/sponsor?gesture=<slug>`.
      - `pending`: "This gesture is being sponsored".
      - `sponsored`: "Sponsored by {name}" and "available again from {date}". The existing credit line becomes part of the card.
      - The card is hidden when `checkoutEnabled` is false and the gesture is available.
    - L-17 on mobile: the same card from the same hook. Its link opens `${SITE_URL}/sponsor?gesture=<slug>` in the system browser. The old app had no CTA. **App Store guideline 3.1.1 risk:** a purchase link outside in-app purchase may be questioned in review, so `SPONSOR_LINK_IN_APP` (a constant in `apps/mobile/src/config.ts`) can drop the link on iOS without a code change elsewhere, and the phase 8 store-submission carry names it.
    - `sponsorship_checkout_started { gesture_count, has_logo }` is sent once per checkout attempt, on the site, after the checkout call succeeds and before the redirect.
    - `/sponsor` joins `sitemap.xml` (P-16). `robots.txt` already allows it.
14. **Admin lifecycle rules.**
    - Approve, reject and request changes act on one sponsorship. Each runs a guarded transition (`failWhen(status ≠ from)`); a lost race is `INVALID_STATE stale`, as in the catalogue.
      - Approve: only from `in_review` and only with `video_playback_id` set. It sets `starts_at = now` and `ends_at = now + 365 d`, then enqueues `sponsorship_live`.
      - Reject: only from `in_review`/`changes_requested`, with a reason of 1..500 characters in the event and the audit entry.
      - Request changes: from `in_review`/`rejected`, issuing the token (ruling 11).
    - **Mark paid and cancel act on the payment, with every sponsorship in it**, since one Mollie payment covers them all. The UI says how many gestures are affected. Each writes one audit entry per sponsorship (`{ paymentId }`).
      - Mark paid (bank transfer): the Mollie payment is re-fetched first. Already `paid` settles normally. Otherwise it is cancelled when `isCancelable`, and the payment becomes `paid` (`paid_at`, event `marked_paid_manually` with the admin's optional note ≤ 200 characters), every item goes to `rendering`, and `payment.settled` is enqueued, so the same render path produces the video (bug 32).
      - Cancel: only `open`. It re-fetches (`paid` is refused: `INVALID_STATE paid`, and that payment is settled instead), cancels in Mollie when possible, then sets `canceled` and moves every item `awaiting_payment → cancelled`.
    - Force expire: from `live`/`expiring`, behind a typed confirmation. It deletes the Mux asset like the expiry sweep, which differs from the old force expire (it left the asset); recorded.
    - `recordRefund`: see ruling 4.
    - `admin.export.sponsorshipsCsv({ status?, from?, to? })`:
      - It keeps the 18 columns in their old order (A-09), with the new statuses, `display_name` as "Sponsor name" and the item amount.
      - It reads in keyset pages of 500, and there is **no 10,000 row cap** (bug 11). A result over 50,000 rows answers `INVALID_STATE tooMany` and asks for a date range.
      - Every field is quoted with `"` doubled. A cell starting with `=`, `+`, `-`, `@`, a tab or a CR gets a leading `'`, against formula injection in spreadsheets.
      - It writes `export.sponsorships_csv` `{ filters, rows }`. The file name is `sponsorships-YYYY-MM-DD.csv` (Brussels date).
15. **Status presentation.**
    - One `SPONSORSHIP_STATUS_LABEL_KEYS` map (`as const satisfies Record<SponsorshipStatus, TranslationKey>`) and one tone map (`awaiting_payment` info, `rendering` neutral, `render_failed` danger, `in_review` warning, `changes_requested` accent, `live` success, `expiring` warning, `expired`/`cancelled` neutral, `rejected` danger) live in `@smog/sponsorships/schema`.
    - The admin `StatusBadge` (a thin site component over the kit Badge) and the success page use them. No colour or label is written twice.

## Global constraints

- Everything in the phase 1–5 global constraints still applies. That includes:
  - newest versions and the catalog
  - no `Bun.*` in workerd
  - tokens-only styling
  - i18n-only copy in nl/en/fr
  - the code style and the commit trailer
  - append-only migrations
  - `isForeignRequest` on every cookie-authenticated non-oRPC endpoint (the logo upload, the logo read)
  - `SMOG_OFFLINE=1 bun run release:check` green before reporting
- Money is integer cents end to end. No float ever touches an amount. A test forbids `parseFloat`/`Number(` on Mollie amounts.
- Every status change goes through `transition()` and `transitionStatements()`, with its `sponsorship_event` in the same D1 batch. No code writes `sponsorship.status` directly; `test/no-direct-status.test.ts` scans the repo for `status:` updates on `sponsorship` outside `server/transition.ts`.
- `@smog/admin` and `@smog/sponsorships` may import other features' `./schema` and `./contract` only. `@smog/api` injects cross-feature server logic. Handlers that call feature services live in `apps/site/src/worker/*`.
- D1 rules:
  - at most 100 bound parameters per statement (`inList`)
  - one batch per change, with in-batch guards (`failWhen`)
  - correlated subqueries name both sides (`ref`)
  - every list is a keyset seek with a query-plan test
- External services are faked at the adapter boundary:
  - `@smog/payments/testing` (Mollie, selected with `MOLLIE_API_URL` in dev and e2e)
  - `@smog/video/testing` (Mux)
  - `MemoryEmailSender`
  - Miniflare queues, R2 and KV in the Workers pool
  - `RENDER_MODE=fake`
  - No test calls a real Mollie, Mux, R2 S3 or Email Service endpoint.
- Every queue and cron handler is idempotent and safe to run twice. Its test runs it twice and asserts one effect (one email, one job, one event).
- Staging deploys on every develop push: a task that adds a binding also updates the provisioning script and `release-config-check`. No secret is required in staging that staging does not have.
- The e2e uses Playwright with Chromium at `/opt/pw-browsers`. **Never run `playwright install`.**
- Parallel tasks each touch only their own blocks in shared files:
  - The i18n catalogues: `email.*` (Task 2), `sponsorship.*` (Task 3), `sponsor.*` and `gesture.sponsorCta.*` (Task 8), `admin.sponsorships.*` / `admin.export.*` / `admin.dashboard.sponsorships.*` (Tasks 6, 7). Task 1 creates the empty blocks.
  - `routeTree.gen.ts`: regenerate on merge; never hand-merge it.
  - `bun.lock`: take either side and re-run `bun install`; never hand-merge it.
  - `docs/DECISIONS.md`: each task adds its entries under its own `## … (phase 6 task N)` heading, which Task 1 creates.
  - The slice files of `@smog/sponsorships` (`src/{contract,server,client}/<area>.ts`), which Task 3 creates (the later areas as stubs).
- Docs per task:
  - DECISIONS entries for the rulings it implements and any deviation
  - `docs/API.md` for new procedures and routes
  - `docs/DATA_MODEL.md` for migration 0008
  - the inventory `Done` ticks

## Review focus

1. Money:
   - The server recomputes every price.
   - The webhook never trusts the body (it re-fetches) and checks amount and currency on every payment.
   - A replayed, duplicated or out-of-order webhook (paid after canceled, canceled after paid) leaves exactly one correct state, one fan-out and one set of emails.
   - Late paid revives or flags `refund_needed` and always answers 200.
   - Cents are never floats.
2. State machine:
   - The table is exhaustive and tested.
   - No status write bypasses it.
   - Every transition has its event in the same batch.
   - The partial unique index is the only availability check that decides anything.
   - A lost race is a typed error, never a second blocking row.
3. Secrets and degradation:
   - With no Mollie key, no R2 tokens and no Mux secrets, every page and procedure answers cleanly (paused, fallback or 503 for the webhook).
   - No secret reaches `dist/client` (the deploy guard gets `MOLLIE_API_KEY` and `R2_SECRET_ACCESS_KEY`).
   - Production refuses a `test_` Mollie key.
4. Abuse:
   - Turnstile and `RL_SPONSOR` sit on the public mutations.
   - The logo upload is type- and size-checked server side, including the magic bytes.
   - The webhook is limited only on failures.
   - Tokens are hashed, single use and expiring.
   - The CSV is safe against formula injection.
   - The public status answer holds no PII beyond the display name.
5. Audit and admin:
   - Every `admin.sponsorships.*` / `admin.export.*` mutation writes its entry in the same batch as its change (the guard and `expectAudit`).
   - Mark paid and cancel cover the whole payment.
   - A demoted admin is `FORBIDDEN`.
6. Jobs:
   - Each consumer and cron is idempotent (run twice).
   - The DLQ is configured.
   - The daily purge removes exactly the promised rows and nothing else.
   - The render seam matches ruling 7 word for word.

---

### Task 1: Infrastructure: `@smog/payments`, `@smog/jobs`, bindings, env, provisioning, migration 0008

**Files:**
- `packages/payments/{package.json,tsconfig*.json,turbo.json,src/{index,client,money,status,schema}.ts,src/testing/{index,fake-mollie,fake-server}.ts}` and tests (`bun test`). Copy the shape of `packages/video`.
- `packages/jobs/{package.json,tsconfig*.json,turbo.json,vitest.config.ts,test/wrangler.jsonc,src/{index,messages,producers,cron,render-starter,outbox}.ts}` and tests.
- `packages/render/{package.json,tsconfig*.json,src/contract.ts}` (only the `./contract` export: `renderInputSchema` v1 and the overlay layout constants of ruling 7), with tests.
- `packages/email/src/templates/transactional/*.tsx`: the eight templates as **minimal stubs** (subject + one paragraph from `email.<id>.*` keys) with typed props, registered in `render.ts`, with samples in `samples.ts` and admin labels, so every later task type-checks. Task 2 designs them.
- `packages/db`:
  - `src/sql.ts`: (the phase 5 fix wave may already have moved `inList`/`jsonList` here; reuse them) move `failWhen` / `GuardFailedError` / `inList` from `packages/features/admin/src/server/catalog-writes.ts`, which then imports them (the behaviour and the tests stay). Add `src/retention.ts` (statement builders for ruling 9's D1 purges, chunked), with tests.
  - `migrations/0008_payment_refunds.sql` (`db:generate`): `payment.refunded_cents`, `payment.refunded_at`, `session_expires_at_idx`, `verification_expires_at_idx`. Update the schema files and `docs/DATA_MODEL.md`.
- `packages/config/src/env/worker.ts`: the secrets, vars and refines of rulings 2, 10 and 12, and `REQUIRED_WORKER_CONFIG`, with tests.
- `apps/site/wrangler.jsonc`, per env:
  - `MEDIA` R2
  - the `EMAIL_QUEUE` / `EVENTS_QUEUE` producers
  - the consumers: email `max_retries` 5, events `max_retries` 10, `max_batch_size` 10, `retry_delay` 30, each with its DLQ
  - `triggers.crons` (ruling 9)
  - the `RENDER_MODE` / `R2_ACCOUNT_ID` / `MEDIA_BUCKET` vars
- `apps/site/.dev.vars.example`.
- `apps/site/src/worker.ts`: `queue()` dispatches by `batch.queue` suffix to `worker/email-queue.ts` / `worker/events-queue.ts`, and `scheduled()` to `worker/scheduled.ts`. All three are stubs that ack or log and that Tasks 2, 4 and 5 fill. An unknown queue or cron is logged and acked.
- `apps/site/scripts/deploy-guard.ts`: `MOLLIE_API_KEY`, `R2_SECRET_ACCESS_KEY` and `aws4fetch` must not appear in `dist/client`.
- `scripts/{ensure-cloudflare-resources.ts,ensure-cloudflare-resources.test.ts,cron.ts}`, `scripts/release-config-check.ts` (+ test), `.github/workflows/deploy.yml` (the ensure step before migrations), the root `package.json` (`cron` script).
- `packages/config/src/boundaries.ts` (only if a subpath is missing; the packages are listed), knip.
- The i18n empty blocks and the `docs/DECISIONS.md` headings `## … (phase 6 task 1..9)`.

**Interfaces:**
- `@smog/payments`:
  - `createMollie(env) → MollieClient | null`: `null` without `MOLLIE_API_KEY`; outside dev the base URL is always `https://api.mollie.com`.
  - `createPayment(mollie, { idempotencyKey, amountCents, description, redirectUrl, webhookUrl?, metadata, locale })`
  - `getPayment(mollie, id) → MolliePayment | null` (404 → `null`)
  - `cancelPayment(mollie, id)`
  - `MolliePayment` (Zod) is `{ id, status, amountCents, currency, amountRefundedCents, isCancelable, checkoutUrl?, metadata, createdAt, paidAt? }`.
  - `MollieApiError` (status, retryable) and `MollieRateLimitError`.
  - `centsToMollieValue(5000) === "50.00"`; `mollieValueToCents("50.00") === 5000`, which refuses `"50"`, `"50.0"`, `"-1.00"` and `"1e3"`.
  - `mapMollieStatus(status) → "open" | "paid" | "failed" | "canceled" | "expired"`.
  - `./testing`: `createFakeMollie()`, the same surface as a `fetch` that records every request (the body, the `Idempotency-Key`), with `setStatus(id, status)`, `refund(id, cents)` and a `webhook` callback. `./testing/server` serves it with Bun for e2e, with a hosted `/checkout/<id>` page (Pay / Fail / Cancel / Expire buttons that set the status, POST the webhook and redirect to `redirectUrl`).
- `@smog/jobs`:
  - `emailMessageSchema { id, template, props, locale, to, idempotencyKey? }` (≤ 128 KB; the producer asserts it)
  - `eventMessageSchema` = `{ type: "payment.settled", paymentId } | { type: "render.requested", renderJobId }`
  - `enqueueEmail(queue, msg)` and `enqueueEvent(queue, msg)`, each with the 3 in-process retries of ruling 8
  - `CRON = { expiry: "0 0 * * *", reminders: "0 8 * * *", stale: "0 * * * *", retention: "15 3 * * *" }`
  - `RenderStarter { start(job: { renderJobId, input: RenderInput }): Promise<void> }` and `pendingRenderStarter`
  - `QueueEmailOutbox` (implements `EmailOutbox`, added to `@smog/email` in this task as an interface only)
- `REQUIRED_WORKER_CONFIG: Record<Environment, { secrets: string[]; vars: string[] }>`.

- [ ] TDD:
  - the money conversions (every edge above)
  - the status map
  - the client against the fake: the request body, the headers and the `Idempotency-Key`; 404 → `null`; 5xx → retryable
  - the env refines: a `test_` key refused in production; `live_` refused in staging; `MOLLIE_API_URL` override refused outside dev; everything optional parses in dev
  - the message schemas and the size guard
  - the producer retries
  - the queue and cron dispatch (`createMessageBatch` / `createScheduledController` from `cloudflare:test`): an unknown queue or cron is acked or logged
  - the retention builders: chunking, and the 3-year boundary
  - migration 0008 applied to the dev seed
  - the ensure script: it creates only what is missing and sets CORS
  - `release-config-check`: missing DLQ, wrong name, a required key absent from the schema, the deploy step missing
  - the deploy guard markers
- [ ] `SMOG_OFFLINE=1 bun run release:check`. Commit `feat(payments,jobs): Mollie client, queue messages, bindings and provisioning`.

### Task 2: Emails: templates, the email queue and auth through the outbox

**Files:**
- `packages/email/src/templates/transactional/*.tsx` (the full designs, replacing Task 1's stubs), `src/outbox.ts` (`EmailOutbox`, `DirectEmailOutbox`), `src/samples.ts` (the real sample data, as A-25: "Hond", "Acme BV" and so on, on `smog.example`), `src/index.ts`; remove `src/send.ts` once nothing uses it. Tests.
- `packages/jobs/src/{outbox,email-consumer}.ts`: `QueueEmailOutbox`, and `processEmailMessage(msg, { sender, kv, env })` (idempotency, render, send, the typed retry decision). Tests.
- `packages/auth/src/server.ts`: `createAuth({ outbox })` instead of `email`; the welcome hooks (ruling 8); tests (`welcome.test.ts`: verify once → one message; a second update → none; social create verified → one; sign-in-only → none).
- `apps/site/src/server/auth.ts`: the outbox from `EMAIL_QUEUE`, with `DirectEmailOutbox` and a logged warning if the binding is missing. `apps/site/src/worker/email-queue.ts`: the consumer (ack / `retry({ delaySeconds })`).
- `packages/i18n` `email.*` blocks (nl/en/fr). `apps/site` `admin.emails` labels for the new templates.

**Behaviour:**
- The templates follow inventory §4. They use the phase 2 layout (green header, logo, footer "© <year> SMOG & CO vzw · België"), the token theme, and a plain-text part.
  - `payment_confirmed` shows the per-gesture amount (E-03); for a renewal it also shows the new end date.
  - `admin_new_sponsorship` lists the gestures, the contact (+ company), the duration "1 jaar" and the invoice box (name, VAT, invoice email or the sponsor's email), with a button to `/admin/sponsorships/<id>` for a single sponsorship and `/admin/sponsorships?payment=<id>` for several.
  - `admin_render_failed` has the gesture, the error summary (≤ 300 characters, no stack) and a link to the detail. `admin_refund_needed` has the payment id, the amount, the reason (`late`, `mismatch`, `double`) and the Mollie dashboard link.
- The consumer, per message:
  - parse it; an invalid message is logged and acked, never retried
  - skip it if already sent (KV)
  - render it in the message's locale
  - send it with `From`/`Reply-To` from env
  - mark it sent
  - On a send error it retries with backoff; after `max_retries` the platform moves it to the DLQ.
- Auth emails keep their content and locale rules. Only the transport changes, so an OTP arrives within the queue's batch timeout (set `max_batch_timeout: 1` on the email consumer and record it).

- [ ] TDD:
  - every template renders in 3 locales from its sample (the samples test); a `<script>` in a display name is escaped; the date and money formats per locale; the missing-gesture fallback in nl/fr/en
  - the consumer: sent once with a key, run twice → one send; a send failure → retry with the right delay; an invalid message → ack; dev → the KV mailbox
  - auth: a sign-up's verification email is one queue message (Workers pool with a real queue) and lands in `/dev/mail.json` through the consumer
  - welcome idempotency
- [ ] The `/admin/emails` previews show all twelve templates (screenshot check). Commit `feat(email): transactional templates and the email queue`.

### Task 3: `@smog/sponsorships` core: schema, pricing, state machine, settlement, lifecycle builders, render seam

**Files:**
- `packages/features/sponsorships/{package.json,tsconfig*.json,turbo.json,vitest.config.ts,test/wrangler.jsonc}`. Copy the shape of `packages/features/admin`.
- `src/schema/{index,wizard,pricing,vat,tokens,status,availability}.ts`.
- `src/contract/{index,public,checkout,logo,status,reedit,renewal}.ts`: the **whole** public contract (ruling 5's guards declared per procedure).
- `src/server/{index,router,transition,statements,settle,lifecycle,render,recipients,availability,quote,mollie-payment}.ts`, plus the stub slices `server/{checkout,logo,status,reedit,renewal}.ts` (handlers throw `INTERNAL_SERVER_ERROR` "not implemented") that Tasks 4 and 5 replace.
- `src/client/{index,use-availability,use-quote}.ts` and the empty hook files `use-checkout.ts`, `use-payment-status.ts`, `use-reedit.ts`, `use-renewal.ts`, `use-logo-upload.ts` (Task 8 fills them).
- `test/*`. Mount it in `packages/api/src/{contract,router}.ts` (`appContract.sponsorships`).
- `packages/i18n` `sponsorship.*` (status labels, error reasons).

**Interfaces:**
- Schema:
  - `checkoutInputSchema { checkoutId: uuid, gestureIds: uuid[] 1..10 unique, displayName: trimmed 1..35, logoKey?: /^logos\/[0-9a-f-]{36}$/, contact { name 1..120, email ≤ 254 (the old regex + z.email), company? ≤ 120 }, invoice? { name 1..160, vatNumber (ruling 3), email ≤ 254 }, locale, expectedTotalCents }`
  - `priceSponsorship({ count, logo }) → { perGestureCents, totalCents, items }`
  - `normalizeBelgianVat(input) → string | null`
  - `hashSponsorshipToken(raw) → Promise<string>`, `newSponsorshipToken()`, `sponsorshipTokenSchema` (43-character base64url or UUID)
  - `SPONSORSHIP_STATUS_LABEL_KEYS`, `SPONSORSHIP_STATUS_TONES`
- `transition(status, event) → status | null`. It is exhaustive over `SPONSORSHIP_STATUSES × SPONSORSHIP_EVENT_TYPES` (the transition events), per spec §5.5 and ruling 6:
  - `payment_paid` / `marked_paid_manually`: `awaiting_payment → rendering`
  - `payment_failed` / `cancelled`: `awaiting_payment → cancelled`
  - `revived`: `cancelled → rendering`
  - `render_succeeded`: `rendering → in_review`; `render_failed`: `rendering → render_failed`; `render_retried`: `render_failed → rendering`
  - `approved`: `in_review → live`
  - `rejected`: `in_review | changes_requested → rejected`
  - `changes_requested`: `in_review | rejected → changes_requested`
  - `resubmitted`: `changes_requested → rendering`
  - `reminder_sent`: `live → expiring`
  - `renewed`: `expiring | live → live`
  - `expired` / `force_expired`: `live | expiring → expired`
  - everything else → `null`
  - A table test enumerates every pair.
- `transitionStatements(db, { sponsorshipId, from, event, actorId, data, patch?, now })` returns `[failWhen(status ≠ from), update status/patch/updated_at, insert sponsorship_event]`. It throws `InvalidTransitionError` when `transition(from, event)` is `null`. `SPONSORSHIP_EVENT_DATA_SCHEMAS` validates `data` per type, like the audit writer, and refuses an unknown key.
- `settlePayment(db, { payment: MolliePayment, now }) → { outcome: "paid" | "already" | "late_revived" | "refund_needed" | "failed" | "noop", paymentId, kind, notify: EmailPlan[] }`, exactly ruling 6. It also stores `amountRefundedCents`. The caller enqueues `payment.settled` and the plan.
- `startMolliePayment(db, mollie, { payment, items, locale, siteUrl, allowFakeWebhook })` creates the Mollie payment and stores `mollie_id` / `checkout_url`, or runs the compensation of ruling 5 (initial) or marks the renewal payment `failed`. Tasks 4 and 5 use it.
- Lifecycle builders for the admin (each returns `{ statements, after: AfterCommit[] }`, where `after` lists the emails and events to enqueue):
  - `approveStatements`, `rejectStatements`, `requestChangesStatements` (returns the raw token once), `regenerateTokenStatements`
  - `markPaidStatements(paymentId)`, `cancelPaymentStatements(paymentId)`, `forceExpireStatements`
  - `recordRefundStatements`
  - `adminRecipients(db)`
- Render seam (ruling 7): `createRenderJobStatements(db, sponsorshipId)`, `markRenderRunning`, `completeRender`, `failRender`.
- Public procedures implemented here:
  - `sponsorships.availability({ gestureIds 1..100 }) → { checkoutEnabled, items: { gestureId, state, sponsorName?, endsAt? }[] }`. It is one read (`inList`, the `(gesture_id, status)` index, published gestures only; `sponsorName`/`endsAt` only for `live`/`expiring`, S-02, S-26).
  - `sponsorships.quote({ gestureIds 1..10, logo }) → { items, totalCents, currency: "EUR", unavailable: string[] }`.
- Client: `useAvailability(ids)` (staleTime 30 s) and `useQuote`.

- [ ] TDD (`bun test` for the pure parts; Workers pool for D1):
  - the transition table, every pair
  - the pricing for 1..10 gestures with and without the logo, and 11 refused
  - VAT: `0123456749` valid, `0000000000` invalid, `BE 0123.456.749` valid and normalised, a wrong check refused
  - token hashing: a known vector; a UUID token accepted
  - `transitionStatements`: a guard failure leaves nothing; the event is in the same batch; event data is validated
  - `settlePayment`: every branch of ruling 6, each run twice for one effect (paid; paid after canceled with a free gesture → revived; with a taken gesture → `refund_needed`; mismatch; renewal paid → `ends_at` + 365 d and the reminder reset; renewal paid after expiry → `refund_needed`; failed initial → cancelled and the gesture free; failed renewal → only the payment changes; refunded amount stored)
  - the render seam: create → complete → `in_review`; fail → `render_failed` plus the admin plan; complete twice → no-op
  - availability: one D1 read, `pending` for every blocking status (bug 17), the sponsor name only when live; a query-plan test
  - `startMolliePayment` with the fake: the request body and the compensation
  - the `no-direct-status` scan
- [ ] Commit `feat(sponsorships): state machine, pricing, settlement and render seam`.

### Task 4: The money path: checkout, logo upload, payment status, Mollie webhook, events consumer

**Files:**
- `packages/features/sponsorships/src/server/{checkout,logo,status}.ts` (they replace the stubs) and `test/{checkout,logo,status}.test.ts`.
- `apps/site/src/routes/api/webhooks/mollie.ts` and `src/routes/webhooks/mollie.ts` (the alias), `src/server/mollie-webhook.ts` (shared), `src/routes/api/logos/$key.ts`, `src/routes/api/logos/upload.$key.ts`, `src/server/logo-upload.ts` (sign/verify), `src/worker/{events-queue,render}.ts`.
- `apps/site/src/worker/maintenance.ts`: add `/webhooks/mollie` to `EXEMPT_PATHS`, with a test. `src/worker/headers.ts`: `connect-src` for the R2 host, `img-src blob:`, with tests.
- `apps/site/test/{mollie-webhook,logo-upload,events-queue}.test.ts`.

**Interfaces and behaviour:**
- `sponsorships.checkout` (ruling 5):
  - validate
  - verify the logo (ruling 10)
  - price it (`PAYMENT_MISMATCH` on a different `expectedTotalCents`)
  - write one batch
  - `startMolliePayment`
  - return `{ paymentId, checkoutUrl }`
  - An idempotent replay returns the same answer.
- `sponsorships.uploadLogo` (ruling 10) returns the presigned or fallback URL. The fallback route stores the object with `customMetadata { uploadedAt }`.
- `sponsorships.paymentStatus({ payment: uuid | tr_… }) → { status, kind, totalCents, displayName, items: { gestureName, gestureSlug, includesLogo }[], renewedUntil? }`. It re-fetches and settles an `open` payment (ruling 2), at most once per 5 s per payment (a KV marker). It returns no email, name, company, invoice or Mollie data (S-14). An unknown payment is `NOT_FOUND`.
- The webhook (ruling 2): parse, re-fetch, `settlePayment`, enqueue `payment.settled` for `paid` / `already` / `late_revived` and the plan's emails for `refund_needed`; the failure-only rate limit; the alias.
- `worker/events-queue.ts`:
  - `payment.settled`:
    - for every item in `rendering` without an active job: `createRenderJobStatements`, then enqueue `render.requested`
    - for an initial payment: `sponsorship_received` + `payment_confirmed` per sponsorship, and `admin_new_sponsorship` per admin
    - for a renewal: `payment_confirmed`
    - All of these have idempotency keys.
  - `render.requested`: load the job (queued only; anything else is acked), then `RenderStarter.start` from `worker/render.ts` (ruling 7).
  - A failing message retries with backoff; the DLQ follows after 10 attempts.
- `/api/logos/$key`: `requireAdmin` through the session, 404 for an unknown key, and the headers of ruling 10.

- [ ] TDD (Workers pool, the Mollie fake injected):
  - checkout end to end: rows, events, the payment, the Mollie request; a replay; a gesture taken in between → `GESTURE_UNAVAILABLE` with the id and nothing written; unpublished → `GESTURE_UNAVAILABLE`; mismatch → `PAYMENT_MISMATCH`; Mollie down → compensation and the gestures free; no key → `paymentsUnavailable`; Turnstile missing → `TURNSTILE_FAILED`; `RL_SPONSOR` exhausted → `RATE_LIMITED`
  - logo: a valid PNG; a mismatched type, a renamed GIF and a 2 MiB + 1 file refused; an expired or forged signature refused; a foreign origin refused; presign mode returns an S3 URL with the signed `Content-Type`
  - the webhook: form and JSON bodies; a bad id → 400 and counted; unknown → 200; Mollie 5xx → 503; replay → one fan-out; out of order (paid then canceled) → stays paid; the alias works under maintenance; no `Origin` needed
  - the consumer: `payment.settled` twice → one job and one set of emails; fake render → `in_review`; `container` → stays `queued` with the log
  - `paymentStatus` settles an `open` payment without a webhook and leaks no PII (a snapshot of the keys)
- [ ] Commit `feat(sponsorships): checkout, logo upload, Mollie webhook and post-payment fan-out`.

### Task 5: Lifecycle jobs and token flows: crons, retention purge, re-edit, renewal

**Files:**
- `packages/features/sponsorships/src/server/{sweeps,orphan-logos,reedit,renewal}.ts` (replacing the `reedit`/`renewal` stubs) and `test/{sweeps,retention,reedit,renewal}.test.ts`.
- `packages/video/src/assets.ts`: `deleteAsset(mux, id)` (404 counts as done) and the fake, with tests.
- `apps/site/src/worker/scheduled.ts` (the dispatch to the sweeps and to `@smog/db` retention + `orphanLogoSweep`) and `apps/site/test/scheduled.test.ts`.

**Interfaces and behaviour:**
- `runExpirySweep({ db, mux, now })`, `runReminderSweep({ db, events, email, siteUrl, now })`, `runStaleSweep({ db, mollie, events, now })`, `runRetentionPurge({ db, media, now })`, exactly ruling 9. Each returns counts, which the handler logs as `[cron] <name> …`.
- `sponsorships.reedit.get({ token })` and `reedit.submit({ token, displayName, logoKey? })`, ruling 11. The submit is Turnstile + `RL_SPONSOR`; it uses the token, transitions `resubmitted`, updates the display name and the logo (the old logo object is left to the orphan sweep), creates a render job and enqueues `render.requested`.
- `sponsorships.renewal.get({ token }) → { gesture { name, slug }, displayName, endsAt, hasLogo, amountCents }`.
- `sponsorships.renewal.checkout({ token, checkoutId })`:
  - It is valid while the sponsorship is `expiring` or `live` and the token is open.
  - It creates a `renewal` payment (one item, with `includes_logo` from `logo_key`) and calls `startMolliePayment`.
  - A second open renewal payment for the same sponsorship returns the open one's checkout URL.
  - The token is used only when the payment settles `paid` (`settlePayment`), so a failed payment can be retried with the same link.

- [ ] TDD (each sweep runs twice):
  - expiry (an asset deleted once; a Mux failure swallowed; the gesture's own asset never deleted)
  - reminders (exactly one email and one token; the window edges at 30 d)
  - stale (paid at Mollie → settled not cancelled; cancelable → cancelled in Mollie; no key → local; a renewal payment → only the payment)
  - retention (a row at 3 y − 1 ms kept and at 3 y + 1 ms deleted; expired sessions deleted and live ones kept; the chunking continues; orphan and terminal-old logos deleted with `logo_key` cleared; a fresh pending upload kept)
  - re-edit (a used, expired or unknown token; a logo change refused when there was no logo; resubmit → rendering → fake → `in_review`)
  - renewal (pay → `ends_at` + 365 d, `live`, `reminder_sent_at` cleared, the token used; a failed payment keeps the token usable; renewal after expiry is refused)
  - the scheduled dispatch through `createScheduledController` for each cron string
- [ ] Commit `feat(sponsorships): expiry, reminders, stale payments, retention purge, re-edit and renewal`.

### Task 6: Admin sponsorships API, export, dashboard stats

**Files:**
- `packages/features/admin/src/{schema/sponsorships.ts,contract/sponsorships.ts,contract/export.ts,server/sponsorships.ts,server/export.ts,client/use-admin-sponsorships.ts,client/use-admin-export.ts}`, wired into `contract/index.ts`, `server/router.ts` and `ADMIN_SLICES`, and `test/inputs/{sponsorships,export}.ts`.
- `src/schema/audit.ts`: the phase 6 block with schemas for `sponsorship.{approve,reject,request_changes,regenerate_token,mark_paid,cancel,force_expire}`, `payment.refund` and `export.sponsorships_csv`. `sponsorship.retry_render` stays unmapped until phase 7.
- `src/server/procedure.ts`: `AdminDeps.sponsorships` (the builders and services of Task 3, plus the Mollie client factory). `packages/api/src/router.ts` passes them.
- `src/{schema,server}/dashboard.ts` (the stats) and `src/server/users.ts` (`get` adds sponsorships by verified email, the account-export rule).
- `test/{sponsorships,export}.test.ts`, and extend `dashboard.test.ts`, `users.test.ts` and `limits.test.ts`.

**Interfaces:**
- `admin.sponsorships.list({ status?: Status[], q?, paymentId?, from?, to?, cursor?, limit ≤ 100 = 50 }) → { items: AdminSponsorshipRow[], nextCursor, counts: Record<Status, number> }`.
  - Newest first by `(created_at, id)` keyset; add the index in migration `0009_sponsorship_admin_order` if the plan test needs it.
  - `q` is an `instr` match on the gesture name, the display name and the sponsor email (as `admin.users`).
  - `AdminSponsorshipRow { id, status, gesture { id, name, slug }, displayName, sponsor { name, email, company }, hasLogo, invoiceRequested, amountCents, paymentStatus, createdAt, updatedAt, startsAt, endsAt }`.
- `admin.sponsorships.get({ id })` returns the A-15 / A-29 detail:
  - the sponsorship
  - the gesture (with the original playback id)
  - the video (`videoPlaybackId`, and `fakeRender: boolean` when it equals the gesture's own)
  - the sponsor and the invoice
  - the payments (`id`, `mollieId`, `kind`, `status`, `amountCents`, `refundedCents`, `paidAt`, `createdAt`, `mollieDashboardUrl`, `items`)
  - the events (with the actor name, or a deleted actor)
  - the render jobs (read only)
  - the tokens (`purpose`, `createdAt`, `expiresAt`, `usedAt`; never a hash)
  - `logoUrl` (`/api/logos/<key>`)
- Mutations (ruling 14), each `{ audit: … }` in `ADMIN_PROCEDURES`:
  - `approve({ id })`, `reject({ id, reason })`
  - `requestChanges({ id }) → { url, expiresAt }`, `regenerateToken({ id, purpose }) → { url, expiresAt }`
  - `markPaid({ paymentId, note? })`, `cancel({ paymentId })`
  - `forceExpire({ id, confirmName })` (the gesture name)
  - `recordRefund({ paymentId })`
- `admin.export.sponsorshipsCsv(filters) → { csv, filename, rows }`, ruling 14.
- `admin.dashboard` adds `sponsorships { inReview, awaitingPayment, rendering, renderFailed, live, expiring, refundNeeded }`, still one batch.

- [ ] TDD:
  - the auth matrix covers the new procedures (the existing enumerating test)
  - each mutation's entry is in the same batch (`expectAudit`, and a failing batch leaves neither)
  - a lost race → `INVALID_STATE stale`
  - mark paid on a 3-item payment → 3 entries, 3 `rendering`, one `payment.settled`; mark paid when Mollie says paid → settled normally; cancel refused when paid
  - approve without a video refused; approve's email has the stored dates
  - request changes / regenerate revoke the old token
  - force expire deletes the asset
  - `recordRefund` refused with nothing refunded
  - the CSV: the column order, the escaping and the formula guard, more than 10,000 rows, the date filter, the audit entry
  - the limits test at 100 statuses and ids
  - the dashboard counts
  - the user panel's sponsorships only for a verified email
- [ ] Commit `feat(admin): sponsorship moderation, payment actions and CSV export API`.

### Task 7: Admin sponsorships screens

Depends on Task 6.

**Files:**
- `apps/site/src/routes/admin/sponsorships/{index,$id}.tsx`.
- `src/components/admin/sponsorships/{sponsorship-table,moderation-queue,sponsorship-detail,status-badge,event-trail,payment-card,invoice-box,token-dialog,action-dialogs,export-dialog}.tsx`.
- The rail entry (`admin-rail.tsx`, second after Dashboard) and the dashboard stat cards (`admin/index.tsx`). The user panel lists the sponsorships, linked.
- i18n `admin.sponsorships.*`. `e2e/admin-sponsorships.spec.ts`, with the screenshot and a11y entries in `e2e/admin.ts` `ADMIN_PAGES`.

**Behaviour:**
- `/admin/sponsorships`:
  - It opens on the **Review** tab (`status=in_review`, A-04) with a count.
  - The other tabs are All, Awaiting payment, Rendering/failed, Live/expiring, Refund needed, and Closed (`rejected`, `cancelled`, `expired`).
  - It is a DataTable with the URL-synced search, status, date range and cursor.
  - The Review tab is a card grid (thumbnail, gesture, display name, amount, the invoice flag) whose row opens the detail.
  - "Export CSV" opens a dialog with the status and the date range, then downloads.
- `/admin/sponsorships/$id`:
  - two players side by side (the original and the sponsored video, with the "fake render" badge)
  - the logo preview, the metadata, the invoice box ("Invoice requested" / "No invoice")
  - the payment cards with "Open in Mollie", the refund state and "Record refund"
  - the event trail with the actors
  - the render jobs (read only, "retry arrives with the render pipeline")
  - the tokens
  - The actions shown depend on the status: Approve; Request changes (shows the link once with Copy and the expiry, A-07); Reject (reason required, the confirm disabled while it is blank); Mark paid / Cancel (they name every gesture of the payment); Force expire (type the gesture name); Regenerate link.
  - Every action has an AlertDialog and a toast, and refetches.
- States: Skeleton, EmptyState ("All caught up" for the queue) and ErrorState. Tokens only. A dense, fluid layout; on a phone the detail stacks.

- [ ] Tests:
  - component tests (status-dependent actions, the token dialog shows the URL once, the reject validation)
  - e2e on the dev D1 with the Mollie fake: a paid checkout (seeded through `/dev/e2e-seed`, with new operations for a sponsorship in each state) appears in Review → approve → the public detail shows "Sponsored by"; request changes → the copied link opens `/sponsor/edit`; mark paid; the CSV downloads with 18 columns; the audit page lists the entries
- [ ] Screenshots (light/dark × 390/1280) of the list, the queue and the detail, reviewed. Commit `feat(site): admin sponsorship screens`.

### Task 8: Public sponsor screens, the gesture CTA on site and mobile, R-11

Depends on Task 3 (contract and hooks). Runs beside Tasks 4–6 against the contract, component tests and the Mollie fake; the e2e completes once Task 4 is merged.

**Files:**
- `apps/site/src/routes/sponsor/{index,success,edit,renew}.tsx`.
- `src/components/sponsor/{wizard,step-select,step-details,step-review,selection-bar,price-summary,logo-dropzone,overlay-preview,status-timeline,sponsor-cta}.tsx`.
- `packages/features/sponsorships/src/client/{use-checkout,use-payment-status,use-reedit,use-renewal,use-logo-upload}.ts` (the files Task 3 created). The wizard state is a reducer in `use-checkout.ts`, tested.
- `src/components/learning/gesture-detail.tsx` (the CTA replaces the credit line), `src/lib/legacy-redirects.ts` (+ test, ruling 13), `src/routes/sitemap[.]xml.ts`.
- `apps/mobile/app/gestures/[slug].tsx`, `apps/mobile/src/sponsor-cta.tsx` (+ test), `apps/mobile/src/config.ts` (`SPONSOR_LINK_IN_APP`).
- i18n `sponsor.*`, `gesture.sponsorCta.*`. `e2e/sponsor.spec.ts`.

**Behaviour:**
- `/sponsor` is a three-step Stepper (Choose gestures → Your details → Preview & pay), with the wizard state kept in memory (S-01).
  - **Choose** (S-03): the copy of S-03, with the value cards derived from the constants (bug 24). A search over `gestures.search` with category chips (8 + "more"). Cards with availability badges, where unavailable cards are disabled. A selection capped at 10 with an explanation. A sticky selection bar with the count and `formatMoney(total)` from `priceSponsorship` (the same function the server uses).
  - **Details** (S-05–S-08):
    - the display name with a live counter /35
    - the logo checkbox + dropzone (drag and drop or browse; 2 MiB and the type checked on the client too; a 96 px preview through an object URL; Remove; the guidelines box)
    - contact name / email / company
    - "I want an invoice", which prefills the invoice email, and the BE number validated with the shared check
    - Errors sit on their fields (`Field`).
  - **Preview & pay** (S-11):
    - one `SponsorOverlayPreview` per gesture (ruling 7)
    - the summary (count, "1 year", the name, the logo yes/no, the contact, the total)
    - the Turnstile widget
    - "Continue to payment": `uploadLogo` → PUT → `checkout` → `sponsorship_checkout_started` → `location.assign(checkoutUrl)`
    - The note says "You will be redirected to Mollie".
    - `GESTURE_UNAVAILABLE` sends the user back to step 1 with those cards marked. `paymentsUnavailable` shows a calm "sponsoring is paused" state from the start (`checkoutEnabled`).
- `/sponsor/success?payment=` (S-14): polls `paymentStatus` every 2 s, at most 15 times, then "taking longer" with "Check again". The states are paid (the timeline: review within five working days, an email when live), open, failed or canceled (with "Try again" back to the wizard with the selection kept in the URL as `?gesture=` slugs), and `refund_needed` ("we will contact you"). The total uses `formatMoney`.
- `/sponsor/edit?token=` (S-19): the guards (no token, checking, unknown, expired with the days pill), then the display name and the logo (only if the sponsorship has one), the preview, Turnstile, "Send for review", and success.
- `/sponsor/renew?token=` (S-20): the summary (gesture, name, current end date → the new end date, the amount), Turnstile, then pay. It shares the success page.
- The CTA (L-17) on the site and mobile, as in ruling 13. It hides itself on an availability error (it never blocks the gesture page).

- [ ] Tests:
  - the reducer (the cap at 10, preselect only when empty and available, logo toggling keeps the file but does not send it)
  - component tests (counter, VAT error, `GESTURE_UNAVAILABLE` path, polling states)
  - legacy redirects (id, legacy id, slug, unknown)
  - mobile Jest (the CTA states, the iOS flag)
  - e2e with the Mollie fake: choose 2 → details with a logo and an invoice → pay → the fake checkout "Pay" → success shows paid → (fake render) the admin queue has 2; "Fail" → failed state and the gestures free again; the re-edit link flow; `/sponsors?gestureId=<legacy>` lands preselected; axe on every step in light and dark
- [ ] Screenshots (light/dark × 390/1280) of every step, the success states, edit and renew, plus a mobile gallery or Jest snapshot of the CTA, reviewed. Commit `feat(site,mobile): sponsor wizard, payment status, re-edit, renewal and gesture CTA`.

### Task 9: Hardening, staging smoke, docs and parity

Depends on Tasks 1–8.

**Files:** `apps/site/e2e/{sponsor-a11y,sponsor-screenshots}.spec.ts`, `csp.spec.ts` (the sponsor pages: the Turnstile frame, the blob logo preview, the fallback upload, the redirect to the fake checkout), fixes in any phase 6 file, `docs/{API.md,DECISIONS.md,PROGRESS.md,DATA_MODEL.md}`, the inventory ticks, and the privacy and terms text only where a fact changed (the daily purge wording; renewal).

**Behaviour:**
- axe on every sponsor page and dialog. Keyboard-only runs of the wizard (the dropzone through its button, the stepper, the selection bar), the moderation actions and the token dialog.
- **Staging smoke** (after the develop push, with the Mollie **test** key set on staging by the owner, or recorded as pending):
  - a real Mollie test payment reaches `in_review` through the real webhook
  - a canceled one frees the gesture
  - `wrangler tail` shows the crons firing
  - the provisioning step created the queues and the bucket
  - Record the result.
- The parity walk through every row listed under **Spec** against the running site, ticking each or noting it (phase 7: S-10/S-17/S-25 render parts, A-27; phase 8: E-13).
- PROGRESS:
  - log the phase 6 tasks
  - **phase 7 carries:** ruling 7 point by point (the starter switch, the Workflow binding and class, `completeRender`/`failRender` from the workflow, A-27 `retryRender`, `render-job:` Mux passthroughs, the logo header, the Remotion Player replacing `SponsorOverlayPreview`, staging `RENDER_MODE` → `container`)
  - **phase 8 carries:**
    - `REQUIRED_WORKER_CONFIG` checked against `wrangler secret list` before each deploy, with the new names (`MOLLIE_API_KEY` live in production, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`)
    - Mollie's production profile website set to `SITE_URL`
    - the Email Service domain onboarding for `smog.vlaanderen`
    - the removal of the `/webhooks/mollie` alias 30 days after cutover
    - the migration script using `hashSponsorshipToken` and `payment.mollie_id`
    - `SPONSOR_LINK_IN_APP` at store review
    - the DLQs checked by hand
  - Update "Pending before develop → master": the retention purge item is done.

- [ ] The full site e2e and `SMOG_OFFLINE=1 bun run release:check` pass. Commit `test(site): sponsor accessibility, CSP, staging smoke and parity`.

---

## Parallelism

| Wave | Tasks | Why they can run together |
|---|---|---|
| A | 1 | Every later task needs the packages, the bindings, the env, the template stubs, the `@smog/db` guard helpers, the worker dispatch stubs, the i18n blocks and the DECISIONS headings. |
| B | 2, 3 | Disjoint: 2 is `packages/email`, `packages/auth`, `packages/jobs/src/{outbox,email-consumer}.ts`, `apps/site/src/server/auth.ts` and `worker/email-queue.ts`; 3 is `packages/features/sponsorships` and the `@smog/api` mount. They share only their own i18n blocks. Task 3 enqueues against Task 1's template stubs and message types. |
| C | 4, 5, 6, 8 | Disjoint: 4 is `sponsorships/src/server/{checkout,logo,status}.ts`, the webhook and logo routes, `worker/{events-queue,render,maintenance,headers}.ts`; 5 is `sponsorships/src/server/{sweeps,orphan-logos,reedit,renewal}.ts`, `packages/video` and `worker/scheduled.ts`; 6 is `packages/features/admin/*` and `packages/api/src/router.ts`; 8 is the `/sponsor*` routes, `components/sponsor`, the `sponsorships/src/client` hook files, `gesture-detail.tsx`, `legacy-redirects.ts`, the sitemap and `apps/mobile`. Shared: only the i18n blocks, `routeTree.gen.ts` (regenerate) and `bun.lock`. Task 8's full e2e waits for Task 4's merge. |
| D | 7 | Needs Task 6's admin API. |
| E | 9 | Needs all of them. |

Nine tasks, one over the 6–8 target. The money path (4), the time-driven lifecycle (5) and the admin API (6) are each a full 2–4 h slice, and merging any two of them would put two unrelated review focuses in one task.

## Moved to later phases

- Phase 7:
  - the render pipeline behind ruling 7's seam (Workflow, Container, Mux upload, `completeRender`/`failRender` callers)
  - A-27 (`admin.sponsorships.retryRender` and the render job controls)
  - the Remotion Player preview (S-10)
  - staging `RENDER_MODE=container`
  - the `render-job:` Mux webhook passthroughs (W-02)
- Phase 8:
  - `we_moved` (E-13) with the migration script
  - the required-config check against the real secrets
  - the production Mollie, Email Service domain, R2 token and store-review items listed in Task 9
  - the removal of the `/webhooks/mollie` alias after its 30 days
