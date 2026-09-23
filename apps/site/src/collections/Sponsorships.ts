// Deliberately the `@smog/config/sponsorships` subpath rather than the
// package root. `@smog/config` ships raw TypeScript with no `type: module`,
// so Node treats its files as CJS; the Payload CLI's loader appends a
// `?namespace=<n>` query to every module it resolves, and that query then
// rides along into the barrel's own relative re-exports. `payload
// migrate:create` and `payload generate:types` both died on
// `ENOENT: ... /packages/config/src/constants.ts?namespace=1789853354189`
// until this import stopped going through the barrel. Bundlers (Vitest,
// Next) handle either form, so the breakage only ever shows up in the CLI.
import { SPONSORSHIP_STATUSES } from "@smog/config/sponsorships";
import type { CollectionConfig } from "payload";
import { isAdmin, isAdminField } from "@/access";
import { sponsorshipReEditAccess } from "@/access/sponsorships";
import { enforceStatusTransitions } from "@/hooks/enforceStatusTransitions";
import { logSponsorshipTransitions } from "@/hooks/logSponsorshipTransitions";
import { manageReEditToken } from "@/hooks/manageReEditToken";
import {
  invalidateComposedVideo,
  publishComposedVideo,
} from "@/hooks/publishComposedVideo";
import { queueReEditEmail } from "@/hooks/queueReEditEmail";
import { stampReviewDecision } from "@/hooks/stampReviewDecision";

/**
 * Field-level `read` for everything a re-edit token holder has no business
 * seeing.
 *
 * `access.read` on this collection is no longer `isAdmin`: an unexpired
 * `reEditToken` now resolves exactly one row (`access/sponsorships.ts`), so
 * for the first time a non-admin can read a sponsorship document. What that
 * capability is *for* is fixing the overlay on a video, and nothing on the
 * re-edit page renders any of the fields below.
 *
 * So they are stripped by the field layer rather than by each caller's
 * `select`, because a capability URL is forwardable: it reaches whoever the
 * sponsor's contact person forwarded the mail to, and a re-edit link in the
 * wrong hands should not be a copy of a VAT number, an invoice address and
 * the name of the administrator who rejected the submission. `reviewedBy` is
 * the sharpest of them — it is a relationship to `users`, so a `depth: 1`
 * read would populate an administrator's own document into the answer.
 *
 * `isAdminField` and not a token-aware rule: `FieldAccess` is boolean-only,
 * and "admins only" is the whole of the intent.
 */
const ADMIN_ONLY_READ = { read: isAdminField };

/**
 * The two defaults Payload's generated create types refuse to honour.
 *
 * `status` and `durationYears` are `required: true` with a `defaultValue`,
 * and `RequiredDataFromCollectionSlug<"sponsorships">` marks both required
 * on create regardless — so the very call the default exists to serve does
 * not typecheck. `lib/sponsorshipCreate.ts` is the one place that fixes
 * that, and it fills these values rather than restating them, so the two
 * cannot drift into disagreeing about what a new sponsorship starts as.
 */
export const SPONSORSHIP_DEFAULTS = {
  durationYears: 1,
  status: "pending_payment",
} as const;

/**
 * A sponsored gesture: a company pays for its name and logo to be overlaid
 * on one gesture's video for a fixed term.
 *
 * The status transitions, the Mollie payment flow, the re-edit link and the
 * renewal-reminder job are what write and validate its columns.
 *
 * **`create`, `update` and `delete` are admin-only; `read` is not, and that is
 * the one deliberate hole.** A row carries a sponsor's contact details, invoice
 * name and VAT number, so the public site still cannot read this collection:
 * the gesture page gets the handful of display fields it needs through
 * `lib/sponsorOverlay.ts`'s own privileged projection rather than by widening
 * anything here. The hole is `access/sponsorships.ts`, which resolves an
 * unexpired `reEditToken` to exactly one row and refuses everything else —
 * including, explicitly, a request that presents no token at all, which would
 * otherwise match every row whose token column is NULL. The fields that
 * capability must not see carry `ADMIN_ONLY_READ`.
 */
export const Sponsorships: CollectionConfig = {
  slug: "sponsorships",
  admin: {
    useAsTitle: "sponsorName",
    defaultColumns: ["sponsorName", "gesture", "status", "endDate"],
  },
  access: {
    read: sponsorshipReEditAccess,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    /*
     * Order is the policy, not an accident. `enforceStatusTransitions`
     * refuses an illegal move first, so nothing downstream mints a credential,
     * stamps a reviewer or publishes a video for a transition that is about to
     * be rejected; the rest then act on the move that survived. Each returns
     * the data the next one sees —
     * `collections/operations/utilities/update.js` chains them.
     *
     * **The one pair whose order is load-bearing rather than tidy** is
     * `invalidateComposedVideo` before `publishComposedVideo`. A single save
     * that both corrects the overlay text and approves the sponsorship must
     * not publish the composite of the text it just replaced, and swapping
     * these two lines is exactly that bug —
     * `hooks/publishComposedVideo.int.test.ts` fails on it by name. Everything
     * else here touches disjoint columns, so nothing can undo anything.
     */
    beforeChange: [
      enforceStatusTransitions,
      invalidateComposedVideo,
      publishComposedVideo,
      manageReEditToken,
      stampReviewDecision,
    ],
    /*
     * Both of these follow the write rather than preceding it, and neither
     * may throw: the status has already moved by the time they run, so a
     * throw would report a failure for a change that happened — and on the
     * webhook path would turn one delivered payment into an endless
     * redelivery. `queueReEditEmail` is second because the log is the record
     * of what happened and the invitation is a consequence of it.
     */
    afterChange: [logSponsorshipTransitions, queueReEditEmail],
  },
  fields: [
    {
      name: "gesture",
      type: "relationship",
      relationTo: "gestures",
      required: true,
      index: true,
    },
    { name: "sponsorName", type: "text", required: true },
    {
      access: ADMIN_ONLY_READ,
      name: "sponsorEmail",
      type: "email",
      required: true,
    },
    {
      access: ADMIN_ONLY_READ,
      name: "contactFullName",
      type: "text",
      required: true,
    },
    { access: ADMIN_ONLY_READ, name: "contactCompany", type: "text" },
    { name: "overlayText", type: "text", required: true },
    { name: "overlayImage", type: "upload", relationTo: "media" },
    { name: "hasLogo", type: "checkbox", defaultValue: false },
    { name: "originalVideoPlaybackId", type: "text", required: true },
    { name: "previewVideoPlaybackId", type: "text" },
    { name: "sponsoredVideoPlaybackId", type: "text" },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: SPONSORSHIP_DEFAULTS.status,
      index: true,
      // Built from the `@smog/config` tuple rather than restated here, so
      // the admin panel's options and the values `StatusBadge` and the
      // payment flow switch on cannot drift apart.
      options: SPONSORSHIP_STATUSES.map((value) => ({ label: value, value })),
    },
    { name: "startDate", type: "date", required: true },
    { name: "endDate", type: "date", required: true, index: true },
    {
      name: "durationYears",
      type: "number",
      required: true,
      defaultValue: SPONSORSHIP_DEFAULTS.durationYears,
    },
    /*
     * Indexed, and deliberately **not** unique.
     *
     * It was once unique, on the reasoning that "the Mollie webhook resolves a
     * payment to a sponsorship through this column". It does not: the webhook
     * resolves through `metadata.sponsorshipIds` (see `endpoints/mollie.ts`),
     * and the column means "which payment paid for this", which is
     * many-to-one by nature. One checkout covering three gestures writes three
     * rows carrying one payment id, and under a unique index D1 refused the
     * second — so the unique constraint made bulk purchase impossible rather
     * than safer. A bulk payment carries the same `molliePaymentId` on
     * *every* sponsorship it covers.
     *
     * Uniqueness has not disappeared from the design; it moved to where it
     * works. `webhook-deliveries.paymentId` is one row per payment and is the
     * claim that makes the webhook exactly-once — see
     * `collections/WebhookDeliveries.ts`.
     *
     * `20260921_120000_sponsorship_payment_id_not_unique` is the migration
     * that drops it in a deployed database; `migrations.test.ts` asserts the
     * chain really produces an ordinary index and that two rows may share a
     * payment id.
     */
    { name: "molliePaymentId", type: "text", index: true },
    { name: "paymentAmount", type: "number", required: true },
    { access: ADMIN_ONLY_READ, name: "rejectionReason", type: "textarea" },
    {
      access: ADMIN_ONLY_READ,
      name: "reviewedBy",
      type: "relationship",
      relationTo: "users",
    },
    { access: ADMIN_ONLY_READ, name: "reviewedAt", type: "date" },
    /*
     * Unique for the same reason as `molliePaymentId` is indexed, with the
     * stakes reversed: this is a bearer credential, so a collision hands one
     * sponsor's token holder access to another sponsor's record. Also
     * nullable, and NULL on the overwhelming majority of rows — a token
     * exists only while a sponsorship sits in `pending_resubmission`
     * (`hooks/manageReEditToken.ts`). SQLite permits any number of NULLs in a
     * unique index, so the two facts do not fight.
     *
     * ## Stored in the clear, and this is the decision rather than the default
     *
     * `endpoints/account.ts` stores the email-change confirmation token as
     * its **SHA-256**, and records why: a database dump is otherwise a set of
     * usable links. This column deliberately does not follow. The token is
     * minted when the status changes (`hooks/manageReEditToken.ts`) and mailed
     * later, by a queued job that reads the raw value back to build the link
     * (`jobs/sendEmail.ts`). A SHA-256 cannot be un-hashed, so hashing would
     * leave that job nothing to send. The difference from the account token
     * is that the job mints that one itself, at the moment of sending, so
     * nothing ever reads it back.
     *
     * **State the cost rather than bury it: a database dump contains usable
     * re-edit links.** Three things bound it.
     *
     * - It expires, and `access/sponsorships.ts` is what finally makes
     *   `reEditTokenExpiresAt` mean something. Seven days.
     * - `hidden: true`, so it never leaves through an API response at all:
     *   Payload 3.89.0 deletes a hidden field in the `afterRead` field pass
     *   unless the caller asks for `showHiddenFields`, which only server-side
     *   code can (`payload/dist/fields/hooks/afterRead/promise.js`). That is
     *   also how the mail job fetches the value to build the link, and it is
     *   why `hidden: true` and a mailed link are not in conflict. Nothing
     *   displays it; the job that mails it is its one reader.
     * - It grants exactly one thing. `access.read` resolves it to one row and
     *   `access.update` is `isAdmin`, so it cannot approve that sponsorship,
     *   cannot change its amount and cannot reach another row. That is the
     *   position Payload itself takes with `resetPasswordToken`.
     *
     * If the product owner would rather have the hash, that is a product
     * decision and a small change: hash the column, and have the job mint a
     * fresh token at the moment of sending, as the address change does.
     */
    {
      name: "reEditToken",
      type: "text",
      index: true,
      unique: true,
      hidden: true,
    },
    { name: "reEditTokenExpiresAt", type: "date" },
    { name: "invoiceRequested", type: "checkbox", defaultValue: false },
    { access: ADMIN_ONLY_READ, name: "invoiceName", type: "text" },
    { access: ADMIN_ONLY_READ, name: "invoiceVatNumber", type: "text" },
    { access: ADMIN_ONLY_READ, name: "invoiceEmail", type: "email" },
    { name: "renewalReminderSentAt", type: "date" },
  ],
};
