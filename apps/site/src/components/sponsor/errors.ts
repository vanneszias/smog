import type { Translate, TranslationKey } from "@smog/i18n";
import {
  type DetailsError,
  type DetailsField,
  LogoUploadError,
  sponsorshipError,
} from "@smog/sponsorships/client";
import {
  INVALID_STATE_REASONS,
  type InvalidStateReason,
} from "@smog/sponsorships/schema";

/** `INVALID_STATE` reasons → their copy (`sponsorship.errors.*`, Task 3). */
const INVALID_STATE_KEYS = {
  alreadySettled: "sponsorship.errors.alreadySettled",
  gestureTaken: "sponsorship.errors.gestureTaken",
  logoInvalid: "sponsorship.errors.logoInvalid",
  noLogo: "sponsorship.errors.noLogo",
  notRefunded: "sponsorship.errors.notRefunded",
  notRenewable: "sponsorship.errors.notRenewable",
  noVideo: "sponsorship.errors.noVideo",
  paid: "sponsorship.errors.paid",
  paymentProvider: "sponsorship.errors.paymentProvider",
  paymentsUnavailable: "sponsorship.errors.paymentsUnavailable",
  stale: "sponsorship.errors.stale",
  tooMany: "sponsorship.errors.tooMany",
} as const satisfies Record<InvalidStateReason, TranslationKey>;

function isReason(value: unknown): value is InvalidStateReason {
  return (INVALID_STATE_REASONS as readonly unknown[]).includes(value);
}

/** The `INVALID_STATE` reason of an error, else `null`. */
export function invalidStateReason(error: unknown): InvalidStateReason | null {
  const known = sponsorshipError(error);
  if (known?.code !== "INVALID_STATE") {
    return null;
  }
  const reason = (known.data as { reason?: unknown } | undefined)?.reason;
  return isReason(reason) ? reason : null;
}

/** The ids of a `GESTURE_UNAVAILABLE` answer, else `null`. */
export function unavailableGestureIds(error: unknown): string[] | null {
  const known = sponsorshipError(error);
  if (known?.code !== "GESTURE_UNAVAILABLE") {
    return null;
  }
  const ids = (known.data as { gestureIds?: unknown } | undefined)?.gestureIds;
  return Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === "string")
    : [];
}

/**
 * What a failed sponsor mutation says: the reason's copy, the shared
 * Turnstile and rate-limit messages, a refused logo, else `fallback`.
 */
export function mutationErrorMessage(
  error: unknown,
  t: Translate,
  fallback: TranslationKey
): string {
  const reason = invalidStateReason(error);
  if (reason) {
    return t(INVALID_STATE_KEYS[reason]);
  }
  if (error instanceof LogoUploadError) {
    return t("sponsorship.errors.logoInvalid");
  }
  switch (sponsorshipError(error)?.code) {
    case "TURNSTILE_FAILED":
      return t("auth.errors.captchaFailed");
    case "RATE_LIMITED":
      return t("auth.errors.rateLimited");
    case "GESTURE_UNAVAILABLE":
      return t("sponsor.select.taken");
    default:
      return t(fallback);
  }
}

/** A details error → its copy (errors sit on their fields, `Field`). */
const FIELD_ERROR_KEYS = {
  invalid: "sponsor.details.errors.emailInvalid",
  logoTooLarge: "sponsor.details.errors.logoTooLarge",
  logoType: "sponsor.details.errors.logoType",
  required: "sponsor.details.errors.required",
  tooLong: "sponsor.details.errors.tooLong",
} as const satisfies Record<DetailsError, TranslationKey>;

/** The copy of one field's error, with the field-specific wording. */
export function detailsErrorMessage(
  field: DetailsField,
  error: DetailsError,
  t: Translate,
  displayNameMax: number
): string {
  if (field === "displayName") {
    if (error === "required") {
      return t("sponsor.details.errors.displayNameRequired");
    }
    return error === "tooLong"
      ? t("sponsor.details.errors.displayNameTooLong", { max: displayNameMax })
      : t("sponsor.details.errors.displayNameInvalid");
  }
  if (field === "logo" && error === "required") {
    return t("sponsor.details.errors.logoRequired");
  }
  if (field === "vatNumber" && error === "invalid") {
    return t("sponsor.details.errors.vatInvalid");
  }
  return t(FIELD_ERROR_KEYS[error]);
}
