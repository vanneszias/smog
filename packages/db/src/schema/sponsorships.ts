/** Sponsorship tables (spec §5.4). The state machine lives in `@smog/sponsorships`. */
import { DISPLAY_NAME_MAX } from "@smog/config/constants";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import {
  BLOCKING_SPONSORSHIP_STATUSES,
  LOCALES,
  PAYMENT_KINDS,
  PAYMENT_STATUSES,
  RENDER_JOB_STATUSES,
  SPONSORSHIP_EVENT_TYPES,
  SPONSORSHIP_STATUSES,
  SPONSORSHIP_TOKEN_PURPOSES,
} from "../enums";
import { user } from "./auth";
import {
  col,
  createdAt,
  inValues,
  lengthBetween,
  timestamp,
  updatedAt,
} from "./columns";
import { gesture } from "./learning";

/** The person who pays; one row per checkout. */
export const sponsor = sqliteTable(
  "sponsor",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    company: text("company"),
    locale: text("locale", { enum: LOCALES }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check("sponsor_name_length_check", lengthBetween(t.name, 1, 120)),
    check("sponsor_email_length_check", lengthBetween(t.email, 3, 254)),
    check("sponsor_company_length_check", lengthBetween(t.company, 0, 120)),
    check("sponsor_locale_check", inValues(t.locale, LOCALES)),
    index("sponsor_email_idx").on(t.email),
  ]
);

/** `vat_number` is a Belgian VAT number, mod-97 validated by the service. */
export const invoiceRequest = sqliteTable(
  "invoice_request",
  {
    sponsorId: text("sponsor_id")
      .primaryKey()
      .references(() => sponsor.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    vatNumber: text("vat_number").notNull(),
    email: text("email").notNull(),
  },
  (t) => [
    check("invoice_request_name_length_check", lengthBetween(t.name, 1, 160)),
    check("invoice_request_email_length_check", lengthBetween(t.email, 3, 254)),
  ]
);

export const sponsorship = sqliteTable(
  "sponsorship",
  {
    id: text("id").primaryKey(),
    sponsorId: text("sponsor_id")
      .notNull()
      .references(() => sponsor.id, { onDelete: "restrict" }),
    gestureId: text("gesture_id")
      .notNull()
      .references(() => gesture.id, { onDelete: "restrict" }),
    /** Shown in the video. */
    displayName: text("display_name").notNull(),
    /** R2 object key. */
    logoKey: text("logo_key"),
    status: text("status", { enum: SPONSORSHIP_STATUSES }).notNull(),
    startsAt: timestamp("starts_at"),
    endsAt: timestamp("ends_at"),
    videoPlaybackId: text("video_playback_id"),
    videoAssetId: text("video_asset_id"),
    reminderSentAt: timestamp("reminder_sent_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    legacyId: text("legacy_id").unique(),
  },
  (t) => [
    check("sponsorship_status_check", inValues(t.status, SPONSORSHIP_STATUSES)),
    check(
      "sponsorship_display_name_length_check",
      lengthBetween(t.displayName, 1, DISPLAY_NAME_MAX)
    ),
    // One active or pending sponsorship per gesture.
    uniqueIndex("sponsorship_gesture_blocking_uq")
      .on(t.gestureId)
      .where(inValues(t.status, BLOCKING_SPONSORSHIP_STATUSES)),
    index("sponsorship_gesture_status_idx").on(t.gestureId, t.status),
    index("sponsorship_status_ends_at_idx").on(t.status, t.endsAt),
    index("sponsorship_sponsor_id_idx").on(t.sponsorId),
  ]
);

/** One Mollie payment covers one or more sponsorships (`payment_item`). */
export const payment = sqliteTable(
  "payment",
  {
    id: text("id").primaryKey(),
    mollieId: text("mollie_id").unique(),
    kind: text("kind", { enum: PAYMENT_KINDS }).notNull(),
    status: text("status", { enum: PAYMENT_STATUSES }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency", { enum: ["EUR"] })
      .notNull()
      .default("EUR"),
    checkoutUrl: text("checkout_url"),
    paidAt: timestamp("paid_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /**
     * Mollie's `amountRefunded`, stored on every re-fetch (migration 0008,
     * phase 6 ruling 4). Refunds are made by hand in the Mollie dashboard.
     */
    refundedCents: integer("refunded_cents").notNull().default(0),
    /** When a refund was first recorded (`admin.sponsorships.recordRefund` or a webhook). */
    refundedAt: timestamp("refunded_at"),
  },
  (t) => [
    check("payment_kind_check", inValues(t.kind, PAYMENT_KINDS)),
    check("payment_status_check", inValues(t.status, PAYMENT_STATUSES)),
    check("payment_currency_check", sql`${col(t.currency)} = 'EUR'`),
    check("payment_amount_check", sql`${col(t.amountCents)} >= 0`),
    index("payment_status_created_idx").on(t.status, t.createdAt),
  ]
);

/** The price of one sponsorship in a payment (`priceSponsorship()`). */
export const paymentItem = sqliteTable(
  "payment_item",
  {
    paymentId: text("payment_id")
      .notNull()
      .references(() => payment.id, { onDelete: "cascade" }),
    sponsorshipId: text("sponsorship_id")
      .notNull()
      .references(() => sponsorship.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    includesLogo: integer("includes_logo", { mode: "boolean" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.paymentId, t.sponsorshipId] }),
    check("payment_item_amount_check", sql`${col(t.amountCents)} >= 0`),
    index("payment_item_sponsorship_id_idx").on(t.sponsorshipId),
  ]
);

/** `input` is the render contract (`@smog/render/contract`). */
export const renderJob = sqliteTable(
  "render_job",
  {
    id: text("id").primaryKey(),
    sponsorshipId: text("sponsorship_id")
      .notNull()
      .references(() => sponsorship.id, { onDelete: "cascade" }),
    status: text("status", { enum: RENDER_JOB_STATUSES }).notNull(),
    /**
     * The Workflow instance id, which is this row's `id`. Instance ids cannot
     * be reused, so a retry inserts a new row (`attempt` + 1).
     */
    workflowInstanceId: text("workflow_instance_id").notNull().unique(),
    input: text("input", { mode: "json" }).$type<unknown>().notNull(),
    muxUploadId: text("mux_upload_id"),
    muxAssetId: text("mux_asset_id"),
    playbackId: text("playback_id"),
    error: text("error"),
    attempt: integer("attempt").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    finishedAt: timestamp("finished_at"),
  },
  (t) => [
    check("render_job_status_check", inValues(t.status, RENDER_JOB_STATUSES)),
    check("render_job_attempt_check", sql`${col(t.attempt)} >= 1`),
    index("render_job_sponsorship_created_idx").on(
      t.sponsorshipId,
      t.createdAt
    ),
    index("render_job_mux_upload_id_idx").on(t.muxUploadId),
    index("render_job_mux_asset_id_idx").on(t.muxAssetId),
  ]
);

/** Review trail; `data` is validated per `type` by `@smog/sponsorships`. */
export const sponsorshipEvent = sqliteTable(
  "sponsorship_event",
  {
    id: text("id").primaryKey(),
    sponsorshipId: text("sponsorship_id")
      .notNull()
      .references(() => sponsorship.id, { onDelete: "cascade" }),
    type: text("type", { enum: SPONSORSHIP_EVENT_TYPES }).notNull(),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    data: text("data", { mode: "json" }).$type<unknown>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "sponsorship_event_type_check",
      inValues(t.type, SPONSORSHIP_EVENT_TYPES)
    ),
    index("sponsorship_event_sponsorship_created_idx").on(
      t.sponsorshipId,
      t.createdAt
    ),
    index("sponsorship_event_actor_id_idx").on(t.actorId),
  ]
);

/** Re-edit / renewal links. Only the SHA-256 of the token is stored. */
export const sponsorshipToken = sqliteTable(
  "sponsorship_token",
  {
    id: text("id").primaryKey(),
    sponsorshipId: text("sponsorship_id")
      .notNull()
      .references(() => sponsorship.id, { onDelete: "cascade" }),
    purpose: text("purpose", { enum: SPONSORSHIP_TOKEN_PURPOSES }).notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "sponsorship_token_purpose_check",
      inValues(t.purpose, SPONSORSHIP_TOKEN_PURPOSES)
    ),
    index("sponsorship_token_expires_at_idx").on(t.expiresAt),
    index("sponsorship_token_sponsorship_purpose_idx").on(
      t.sponsorshipId,
      t.purpose
    ),
  ]
);
