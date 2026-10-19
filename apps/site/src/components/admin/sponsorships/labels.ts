import { sponsorshipRefusalOf } from "@smog/admin/client";
import type {
  PaymentKind,
  PaymentStatus,
  RenderJobStatus,
  SponsorshipEventType,
  SponsorshipTokenPurpose,
} from "@smog/db/enums";
import {
  DEFAULT_LOCALE,
  formatDate,
  isLocale,
  type Locale,
  type Translate,
  type TranslationKey,
} from "@smog/i18n";
import { useTranslation } from "@smog/i18n/react";
import { INVALID_STATE_REASON_KEYS } from "@smog/sponsorships/schema";
import { formatMoney } from "@smog/utils";
import { useCallback } from "react";

/*
 * One literal key per enum value (never a template-literal key cast to one
 * literal): TypeScript checks each against the catalogue once, and `t`
 * never widens to the whole key union (DECISIONS, phase 5 task 3). The
 * sponsorship status labels and tones live in `@smog/sponsorships/schema`
 * (ruling 15); these are the admin's own.
 */

/**
 * What a refused or failed sponsorship action shows: the typed reason
 * (`sponsorship.errors.*`), a missing row, a mismatched confirmation, or
 * the generic error.
 */
export function sponsorshipActionError(t: Translate, error: unknown): string {
  const reason = sponsorshipRefusalOf(error);
  if (reason) {
    return t(INVALID_STATE_REASON_KEYS[reason]);
  }
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "NOT_FOUND") {
    return t("admin.sponsorships.errors.notFound");
  }
  if (code === "VALIDATION" || code === "BAD_REQUEST") {
    return t("admin.sponsorships.errors.validation");
  }
  if (code === "FORBIDDEN") {
    // The role is checked on every call: an admin demoted meanwhile.
    return t("admin.sponsorships.errors.forbidden");
  }
  return t("admin.sponsorships.errors.generic");
}

const PAYMENT_STATUS_KEYS = {
  canceled: "admin.sponsorships.paymentStatus.canceled",
  expired: "admin.sponsorships.paymentStatus.expired",
  failed: "admin.sponsorships.paymentStatus.failed",
  open: "admin.sponsorships.paymentStatus.open",
  paid: "admin.sponsorships.paymentStatus.paid",
  refund_needed: "admin.sponsorships.paymentStatus.refund_needed",
} as const satisfies Record<PaymentStatus, TranslationKey>;

export function paymentStatusLabel(
  t: Translate,
  status: PaymentStatus
): string {
  return t(PAYMENT_STATUS_KEYS[status]);
}

/** The kit Badge variant of a payment status. */
export const PAYMENT_STATUS_TONES = {
  canceled: "neutral",
  expired: "neutral",
  failed: "danger",
  open: "primary",
  paid: "success",
  refund_needed: "danger",
} as const satisfies Record<
  PaymentStatus,
  "neutral" | "primary" | "success" | "danger"
>;

const PAYMENT_KIND_KEYS = {
  initial: "admin.sponsorships.payment.kind.initial",
  renewal: "admin.sponsorships.payment.kind.renewal",
} as const satisfies Record<PaymentKind, TranslationKey>;

export function paymentKindLabel(t: Translate, kind: PaymentKind): string {
  return t(PAYMENT_KIND_KEYS[kind]);
}

const EVENT_KEYS = {
  approved: "admin.sponsorships.events.approved",
  cancelled: "admin.sponsorships.events.cancelled",
  changes_requested: "admin.sponsorships.events.changes_requested",
  created: "admin.sponsorships.events.created",
  expired: "admin.sponsorships.events.expired",
  force_expired: "admin.sponsorships.events.force_expired",
  legacy: "admin.sponsorships.events.legacy",
  marked_paid_manually: "admin.sponsorships.events.marked_paid_manually",
  payment_failed: "admin.sponsorships.events.payment_failed",
  payment_paid: "admin.sponsorships.events.payment_paid",
  refund_needed: "admin.sponsorships.events.refund_needed",
  rejected: "admin.sponsorships.events.rejected",
  reminder_sent: "admin.sponsorships.events.reminder_sent",
  render_failed: "admin.sponsorships.events.render_failed",
  render_retried: "admin.sponsorships.events.render_retried",
  render_started: "admin.sponsorships.events.render_started",
  render_succeeded: "admin.sponsorships.events.render_succeeded",
  renewed: "admin.sponsorships.events.renewed",
  resubmitted: "admin.sponsorships.events.resubmitted",
  revived: "admin.sponsorships.events.revived",
  token_issued: "admin.sponsorships.events.token_issued",
} as const satisfies Record<SponsorshipEventType, TranslationKey>;

export function eventLabel(t: Translate, type: SponsorshipEventType): string {
  return t(EVENT_KEYS[type]);
}

const RENDER_JOB_KEYS = {
  failed: "admin.sponsorships.renderJobs.status.failed",
  queued: "admin.sponsorships.renderJobs.status.queued",
  running: "admin.sponsorships.renderJobs.status.running",
  succeeded: "admin.sponsorships.renderJobs.status.succeeded",
} as const satisfies Record<RenderJobStatus, TranslationKey>;

export function renderJobLabel(t: Translate, status: RenderJobStatus): string {
  return t(RENDER_JOB_KEYS[status]);
}

/** Failure codes whose stored error (`code: detail`) gets an admin hint. */
const RENDER_FAILURE_HINT_KEYS = {
  rendererBusy: "admin.sponsorships.renderJobs.hint.rendererBusy",
  sourceTooLong: "admin.sponsorships.renderJobs.hint.sourceTooLong",
  workflowNeverStarted:
    "admin.sponsorships.renderJobs.hint.workflowNeverStarted",
} as const satisfies Record<string, TranslationKey>;

/**
 * What the admin can do about a failed render job, from its stored error
 * (`<code>: <detail>`, phase 7 fix wave), or `null` for any other error.
 */
export function renderFailureHint(
  t: Translate,
  error: string | null
): string | null {
  const code = error?.split(":", 1)[0] ?? "";
  return Object.hasOwn(RENDER_FAILURE_HINT_KEYS, code)
    ? t(RENDER_FAILURE_HINT_KEYS[code as keyof typeof RENDER_FAILURE_HINT_KEYS])
    : null;
}

const TOKEN_PURPOSE_KEYS = {
  reedit: "admin.sponsorships.tokens.purpose.reedit",
  renewal: "admin.sponsorships.tokens.purpose.renewal",
} as const satisfies Record<SponsorshipTokenPurpose, TranslationKey>;

export function tokenPurposeLabel(
  t: Translate,
  purpose: SponsorshipTokenPurpose
): string {
  return t(TOKEN_PURPOSE_KEYS[purpose]);
}

/** The page's language (the formatters' locale). */
export function usePageLocale(): Locale {
  const { i18n } = useTranslation();
  return isLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE;
}

/** Integer cents as euro in the page's language (`formatMoney`). */
export function useMoney(): (cents: number) => string {
  const locale = usePageLocale();
  return useCallback((cents: number) => formatMoney(cents, locale), [locale]);
}

/** A day in the page's language (Brussels time). */
export function useDay(): (ms: number) => string {
  const locale = usePageLocale();
  return useCallback(
    (ms: number) => formatDate(ms, locale, { dateStyle: "medium" }),
    [locale]
  );
}
