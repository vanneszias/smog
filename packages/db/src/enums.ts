/**
 * Enum values for the `text` + `CHECK` columns (spec §5). The CHECK
 * constraints are generated from these arrays, so adding a value needs a
 * migration (`bun run db:generate`).
 */
import { LOCALES as APP_LOCALES } from "@smog/config/constants";

/** The app languages (defined once in `@smog/config/constants`). */
export const LOCALES = APP_LOCALES;
export type Locale = (typeof LOCALES)[number];

/**
 * The legacy single role on `user.role` (Better Auth's admin plugin). Since
 * phase 10b it is the mirror of `user_role`: `admin` while the user holds the
 * `admin` role, else `user` (`USER_ROLES` below is the set).
 */
export const ROLES = ["user", "admin"] as const;
export type Role = (typeof ROLES)[number];

/**
 * The roles a user can hold besides being a learner (phase 10b, `user_role`).
 * A user with no row is a plain learner; `admin` implies every other role.
 */
export const USER_ROLES = ["translator", "teacher", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** The two legal texts (`legal_text.kind`), as in `@smog/i18n`'s `LegalKind`. */
export const LEGAL_KINDS = ["privacy", "terms"] as const;
export type LegalTextKind = (typeof LEGAL_KINDS)[number];

/** A legal text version is a draft until published; history is kept. */
export const LEGAL_STATUSES = ["draft", "published"] as const;
export type LegalStatus = (typeof LEGAL_STATUSES)[number];

/**
 * The audio formats of a gesture's spoken name (`gesture_audio.content_type`):
 * MP3 and M4A, verified by magic bytes after the upload.
 */
export const AUDIO_CONTENT_TYPES = ["audio/mpeg", "audio/mp4"] as const;
export type AudioContentType = (typeof AUDIO_CONTENT_TYPES)[number];

/** The upload caps of a gesture's audio clip (1 MiB, 10 s). */
export const AUDIO_MAX_BYTES = 1_048_576;
export const AUDIO_MAX_DURATION_MS = 10_000;

/**
 * Teacher information (phase 10c, `gesture_teacher_info`): every long text
 * field is bounded at 2,000 characters (the same number is a CHECK).
 */
export const TEACHER_FIELD_MAX = 2000;

/**
 * The drawings of a gesture (`gesture_drawing`): PNG, JPEG or WebP verified
 * by magic bytes after the upload, at most 1 MiB and 2,000 px on a side
 * (the PDF embeds the file as it is), one image per step (1, optionally 2).
 */
export const DRAWING_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export type DrawingContentType = (typeof DRAWING_CONTENT_TYPES)[number];
export const DRAWING_STEPS = [1, 2] as const;
export type DrawingStep = (typeof DRAWING_STEPS)[number];
export const DRAWING_MAX_BYTES = 1_048_576;
export const DRAWING_MAX_PIXELS = 2000;
export const DRAWING_CREDIT_MAX = 120;

/** Lessons (phase 10c): the caps of the text columns, and of the lesson number. */
export const LESSON_TITLE_MAX = 200;
export const LESSON_NOTES_MAX = 2000;
export const LESSON_NUMBER_MAX = 9999;

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
  "dead_letter.replay",
  "dead_letter.discard",
  /** Phase 10b: roles as a set (`user_role`), one row per grant or revoke. */
  "user.role_grant",
  "user.role_revoke",
  /** Phase 10b: languages are data (`language`). */
  "language.create",
  "language.update",
  /** Phase 10b: interface strings (`ui_string`), a single save or an import. */
  "translation.string_save",
  "translation.string_import",
  /** Phase 10b: gesture and category translations. */
  "translation.gesture_save",
  "translation.category_save",
  /** Phase 10b: a gesture's spoken name (`gesture_audio`). */
  "translation.audio_upload",
  "translation.audio_delete",
  /** Phase 10b: an admin cleared `gesture.needs_recut` (a textless video was uploaded). */
  "gesture.recut_done",
  /** Phase 10b: legal text versions (`legal_text`). */
  "legal.draft_save",
  "legal.publish",
  "legal.restore",
  /** Phase 10c: private teaching information and drawings (ids and counts, never texts). */
  "teacher.info_save",
  "teacher.drawing_upload",
  "teacher.drawing_delete",
  /** Phase 10c: lessons and their PDF exports. */
  "lesson.create",
  "lesson.update",
  "lesson.delete",
  "lesson.duplicate",
  "lesson.export",
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
  /** A message a DLQ consumer stored (`target_id` = its queue message id), phase 9. */
  "dead_letter",
  /** A language (`target_id` = its code), phase 10b. */
  "language",
  /** An interface string (`target_id` = `<locale>:<key>`) or an import (`system`), phase 10b. */
  "ui_string",
  /** A legal text version (`target_id` = its id), phase 10b. */
  "legal_text",
  /** A gesture's teacher information (`target_id` = `<gestureId>:<locale>`) or drawing (`<gestureId>:<step>`), phase 10c. */
  "gesture_teacher_info",
  /** A lesson (`target_id` = its id), phase 10c. */
  "lesson",
] as const;
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

/**
 * The queue a dead letter came from (phase 9, ruling 5): `email` is
 * `smog-<env>-email`, `events` is `smog-<env>-sponsorship-events`. Replay
 * re-enqueues on it.
 */
export const DEAD_LETTER_ORIGINS = ["email", "events"] as const;
export type DeadLetterOrigin = (typeof DEAD_LETTER_ORIGINS)[number];
