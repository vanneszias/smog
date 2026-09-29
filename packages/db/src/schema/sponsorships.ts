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
    company: text("company"),
    createdAt: createdAt(),
    email: text("email").notNull(),
    id: text("id").primaryKey(),
    locale: text("locale", { enum: LOCALES }).notNull(),
    name: text("name").notNull(),
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
    email: text("email").notNull(),
    name: text("name").notNull(),
    sponsorId: text("sponsor_id")
      .primaryKey()
      .references(() => sponsor.id, { onDelete: "cascade" }),
    vatNumber: text("vat_number").notNull(),
  },
  (t) => [
    check("invoice_request_name_length_check", lengthBetween(t.name, 1, 160)),
    check("invoice_request_email_length_check", lengthBetween(t.email, 3, 254)),
  ]
);

export const sponsorship = sqliteTable(
  "sponsorship",
  {
    createdAt: createdAt(),
    /** Shown in the video. */
    displayName: text("display_name").notNull(),
    endsAt: timestamp("ends_at"),
    gestureId: text("gesture_id")
      .notNull()
      .references(() => gesture.id, { onDelete: "restrict" }),
    id: text("id").primaryKey(),
    legacyId: text("legacy_id").unique(),
    /** R2 object key. */
    logoKey: text("logo_key"),
    reminderSentAt: timestamp("reminder_sent_at"),
    sponsorId: text("sponsor_id")
      .notNull()
      .references(() => sponsor.id, { onDelete: "restrict" }),
    startsAt: timestamp("starts_at"),
    status: text("status", { enum: SPONSORSHIP_STATUSES }).notNull(),
    updatedAt: updatedAt(),
    videoAssetId: text("video_asset_id"),
    videoPlaybackId: text("video_playback_id"),
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
    amountCents: integer("amount_cents").notNull(),
    checkoutUrl: text("checkout_url"),
    createdAt: createdAt(),
    currency: text("currency", { enum: ["EUR"] })
      .notNull()
      .default("EUR"),
    id: text("id").primaryKey(),
    kind: text("kind", { enum: PAYMENT_KINDS }).notNull(),
    mollieId: text("mollie_id").unique(),
    paidAt: timestamp("paid_at"),
    status: text("status", { enum: PAYMENT_STATUSES }).notNull(),
    updatedAt: updatedAt(),
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
    amountCents: integer("amount_cents").notNull(),
    includesLogo: integer("includes_logo", { mode: "boolean" }).notNull(),
    paymentId: text("payment_id")
      .notNull()
      .references(() => payment.id, { onDelete: "cascade" }),
    sponsorshipId: text("sponsorship_id")
      .notNull()
      .references(() => sponsorship.id, { onDelete: "restrict" }),
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
    attempt: integer("attempt").notNull().default(1),
    createdAt: createdAt(),
    error: text("error"),
    finishedAt: timestamp("finished_at"),
    id: text("id").primaryKey(),
    input: text("input", { mode: "json" }).$type<unknown>().notNull(),
    muxAssetId: text("mux_asset_id"),
    muxUploadId: text("mux_upload_id"),
    playbackId: text("playback_id"),
    sponsorshipId: text("sponsorship_id")
      .notNull()
      .references(() => sponsorship.id, { onDelete: "cascade" }),
    status: text("status", { enum: RENDER_JOB_STATUSES }).notNull(),
    updatedAt: updatedAt(),
    workflowInstanceId: text("workflow_instance_id").notNull(),
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
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    data: text("data", { mode: "json" }).$type<unknown>().notNull(),
    id: text("id").primaryKey(),
    sponsorshipId: text("sponsorship_id")
      .notNull()
      .references(() => sponsorship.id, { onDelete: "cascade" }),
    type: text("type", { enum: SPONSORSHIP_EVENT_TYPES }).notNull(),
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
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at").notNull(),
    id: text("id").primaryKey(),
    purpose: text("purpose", { enum: SPONSORSHIP_TOKEN_PURPOSES }).notNull(),
    sponsorshipId: text("sponsorship_id")
      .notNull()
      .references(() => sponsorship.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    usedAt: timestamp("used_at"),
  },
  (t) => [
    check(
      "sponsorship_token_purpose_check",
      inValues(t.purpose, SPONSORSHIP_TOKEN_PURPOSES)
    ),
    index("sponsorship_token_sponsorship_purpose_idx").on(
      t.sponsorshipId,
      t.purpose
    ),
  ]
);
