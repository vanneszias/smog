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
import { isAdmin } from "@/access";
import { enforceStatusTransitions } from "@/hooks/enforceStatusTransitions";

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
 * This task defines the shape only. The status transitions, the Mollie
 * payment flow, the re-edit link and the expiry/renewal jobs are Stage 5 —
 * the fields they will read (`molliePaymentId`, `reEditToken`,
 * `reEditTokenExpiresAt`, `renewalReminderSentAt`) exist here so the schema
 * lands in one migration, but nothing writes or validates them yet.
 *
 * Every operation is admin-only. A row carries a sponsor's contact details,
 * invoice name and VAT number, so the public site cannot read this
 * collection directly; Stage 2 exposes the handful of display fields a
 * gesture page needs through its own read path rather than by widening
 * `access.read` here.
 */
export const Sponsorships: CollectionConfig = {
  slug: "sponsorships",
  admin: {
    useAsTitle: "sponsorName",
    defaultColumns: ["sponsorName", "gesture", "status", "endDate"],
  },
  access: {
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [enforceStatusTransitions],
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
    { name: "sponsorEmail", type: "email", required: true },
    { name: "contactFullName", type: "text", required: true },
    { name: "contactCompany", type: "text" },
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
      // the admin panel's options and the values Stage 2's StatusBadge and
      // Stage 5's payment flow switch on cannot drift apart.
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
    // Unique, not merely indexed: the Mollie webhook resolves a payment to
    // a sponsorship through this column, so two rows sharing one id means
    // the webhook marks the wrong sponsorship paid. Nullable — and SQLite
    // allows any number of NULLs under a unique index — so the rows that
    // have no payment yet are unaffected.
    { name: "molliePaymentId", type: "text", index: true, unique: true },
    { name: "paymentAmount", type: "number", required: true },
    { name: "rejectionReason", type: "textarea" },
    { name: "reviewedBy", type: "relationship", relationTo: "users" },
    { name: "reviewedAt", type: "date" },
    // Unique for the same reason, with the stakes reversed: this is a
    // bearer credential, so a collision hands one sponsor's token holder
    // access to another sponsor's record. Also nullable.
    { name: "reEditToken", type: "text", index: true, unique: true },
    { name: "reEditTokenExpiresAt", type: "date" },
    { name: "invoiceRequested", type: "checkbox", defaultValue: false },
    { name: "invoiceName", type: "text" },
    { name: "invoiceVatNumber", type: "text" },
    { name: "invoiceEmail", type: "email" },
    { name: "renewalReminderSentAt", type: "date" },
  ],
};
