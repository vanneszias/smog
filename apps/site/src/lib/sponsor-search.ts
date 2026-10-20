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

const TOKEN_PARAM = "token";
const HASH_PREFIX = /^#/;

/** Where the page's token came from, and the address it should have. */
export interface LinkTokenRead {
  /** The address to `replaceState` to, or `null` when it is already right. */
  replaceWith: string | null;
  /** The valid token, else `null` ("Invalid link"). */
  token: string | null;
}

interface LinkLocation {
  hash: string;
  pathname: string;
  search: string;
}

function fragmentToken(hash: string): string | null {
  return tokenParam(
    new URLSearchParams(hash.replace(HASH_PREFIX, "")).get(TOKEN_PARAM)
  );
}

/**
 * `/sponsor/edit#token=` and `/sponsor/renew#token=` (ruling 7 of phase 9;
 * ruling 11 of phase 7): the raw token is in the URL **fragment**, which
 * never reaches a server, a CDN, Workers Logs or a `Referer`. An old
 * `?token=` link (already emailed, migrated, copied by an admin) is still
 * accepted: the token is read from the query and `replaceWith` is the
 * same page with the token in the fragment instead, so a reload, the
 * history and a screenshot hold no query token. The fragment wins when
 * both are present. The router's `search` is not used: it JSON-parses
 * values (`?token=123` is a number) and a query reaches the server.
 */
export function readLinkToken(location: LinkLocation): LinkTokenRead {
  const query = new URLSearchParams(location.search);
  const inFragment = fragmentToken(location.hash);
  if (!query.has(TOKEN_PARAM)) {
    return { replaceWith: null, token: inFragment };
  }
  const token = inFragment ?? tokenParam(query.get(TOKEN_PARAM));
  query.delete(TOKEN_PARAM);
  const rest = query.toString();
  const hash = token ? `#${TOKEN_PARAM}=${encodeURIComponent(token)}` : "";
  return {
    replaceWith: `${location.pathname}${rest ? `?${rest}` : ""}${hash || location.hash}`,
    token,
  };
}
