/**
 * Enum values for the `text` + `CHECK` columns (spec §5). The CHECK
 * constraints are generated from these arrays, so adding a value needs a
 * migration (`bun run db:generate`).
 */
import { LOCALES as APP_LOCALES } from "@smog/config/constants";

/** The app languages (defined once in `@smog/config/constants`). */
export const LOCALES = APP_LOCALES;
export type Locale = (typeof LOCALES)[number];

export const ROLES = ["user", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const LIST_SHARE_ROLES = ["view", "edit"] as const;
export type ListShareRole = (typeof LIST_SHARE_ROLES)[number];

export const CONSENT_PURPOSES = ["analytics", "marketing"] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const CONSENT_SOURCES = ["web", "mobile", "import"] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

/** Spec §5.5. */
export const SPONSORSHIP_STATUSES = [
  "awaiting_payment",
  "rendering",
  "render_failed",
  "in_review",
  "changes_requested",
  "live",
  "expiring",
  "rejected",
  "cancelled",
  "expired",
] as const;
export type SponsorshipStatus = (typeof SPONSORSHIP_STATUSES)[number];

/** While a sponsorship has one of these, its gesture cannot get another. */
export const BLOCKING_SPONSORSHIP_STATUSES = [
  "awaiting_payment",
  "rendering",
  "render_failed",
  "in_review",
  "changes_requested",
  "live",
  "expiring",
] as const satisfies readonly SponsorshipStatus[];
export type BlockingSponsorshipStatus =
  (typeof BLOCKING_SPONSORSHIP_STATUSES)[number];

export const PAYMENT_KINDS = ["initial", "renewal"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export const PAYMENT_STATUSES = [
  "open",
  "paid",
  "failed",
  "canceled",
  "expired",
  "refund_needed",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const RENDER_JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
] as const;
export type RenderJobStatus = (typeof RENDER_JOB_STATUSES)[number];

/**
 * The review trail of a sponsorship (spec §5.5): one type per transition
 * event, plus the non-transition events (reminder, token, migration).
 */
export const SPONSORSHIP_EVENT_TYPES = [
  "created",
  "payment_paid",
  "payment_failed",
  "marked_paid_manually",
  "render_started",
  "render_succeeded",
  "render_failed",
  "render_retried",
  "approved",
  "rejected",
  "changes_requested",
  "resubmitted",
  "reminder_sent",
  "renewed",
  "expired",
  "force_expired",
  "cancelled",
  "revived",
  "refund_needed",
  "token_issued",
  "legacy",
] as const;
export type SponsorshipEventType = (typeof SPONSORSHIP_EVENT_TYPES)[number];

export const SPONSORSHIP_TOKEN_PURPOSES = ["reedit", "renewal"] as const;
export type SponsorshipTokenPurpose =
  (typeof SPONSORSHIP_TOKEN_PURPOSES)[number];

/**
 * Admin actions. `audit_log.data` is validated per action by
 * `@smog/admin/schema`. `legacy` holds migrated Convex `adminLogs` rows.
 */
export const AUDIT_ACTIONS = [
  "gesture.create",
  "gesture.update",
  "gesture.publish",
  "gesture.unpublish",
  "gesture.delete",
  "gesture.bulk_update",
  "category.create",
  "category.update",
  "category.publish",
  "category.unpublish",
  "category.delete",
  "category.reorder",
  "user.role_change",
  "user.ban",
  "user.unban",
  "user.delete",
  "user.impersonate",
  "sponsorship.approve",
  "sponsorship.reject",
  "sponsorship.request_changes",
  "sponsorship.mark_paid",
  "sponsorship.cancel",
  "sponsorship.retry_render",
  "sponsorship.force_expire",
  "sponsorship.regenerate_token",
  "payment.refund",
  "maintenance.enable",
  "maintenance.disable",
  "export.sponsorships_csv",
  "legacy",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_TARGET_TYPES = [
  "gesture",
  "category",
  "user",
  "sponsorship",
  "payment",
  "list",
  /** A KV setting, such as maintenance mode (`target_id` = the setting key). */
  "setting",
  /** A system-wide action with no single target (`target_id` NULL), such as a CSV export. */
  "system",
] as const;
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];
