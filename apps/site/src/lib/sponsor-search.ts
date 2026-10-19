import { MAX_GESTURES_PER_CHECKOUT } from "@smog/config/constants";
import { paymentParam, tokenParam } from "@smog/sponsorships/client";

/** A slug as the catalogue writes them. */
const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;

/** `/sponsor?gesture=<slug>[,<slug>]` (ruling 13); "Try again" keeps the selection. */
export interface SponsorSearch {
  gesture?: string;
}

function asText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(asText).join(",");
  }
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

/** The distinct, well-formed slugs of `?gesture=`, at most 10. */
export function preselectSlugs(value: string | undefined): string[] {
  const slugs = (value ?? "")
    .split(",")
    .map((slug) => slug.trim().toLowerCase())
    .filter((slug) => SLUG.test(slug));
  return [...new Set(slugs)].slice(0, MAX_GESTURES_PER_CHECKOUT);
}

export function validateSponsorSearch(
  search: Record<string, unknown>
): SponsorSearch {
  const slugs = preselectSlugs(asText(search.gesture));
  return slugs.length > 0 ? { gesture: slugs.join(",") } : {};
}

/** `/sponsor/success?payment=<our id | tr_…>` (S-14). */
export interface PaymentSearch {
  payment?: string;
}

export function validatePaymentSearch(
  search: Record<string, unknown>
): PaymentSearch {
  const payment = paymentParam(search.payment);
  return payment ? { payment } : {};
}

/** `/sponsor/edit?token=` and `/sponsor/renew?token=` (ruling 11). */
export interface TokenSearch {
  token?: string;
}

export function validateTokenSearch(
  search: Record<string, unknown>
): TokenSearch {
  const token = tokenParam(search.token);
  return token ? { token } : {};
}
