// The `@smog/config/constants` subpath rather than the `@smog/config`
// barrel, for the reason `collections/Sponsorships.ts` documents at length:
// the Payload CLI's module loader appends a `?namespace=<n>` query to every
// module it resolves, that query rides along into the barrel's own relative
// re-exports, and `payload generate:types` then dies on
// `ENOENT: .../constants.ts?namespace=...`. This module is reached from
// `payload.config.ts` through the sponsorship endpoints, so it is on that
// path.
import {
  LOGO_ADDON_CENTS,
  MAX_GESTURES_PER_SPONSORSHIP,
  PRICE_PER_YEAR_CENTS,
} from "@smog/config/constants";

/** Mollie and `Intl` both speak euro; the database speaks cents. */
const CENTS_PER_EURO = 100;

/**
 * What a sponsorship order costs, in euro cents.
 *
 * **Fixed, not designed here.** Pricing is behaviour sponsors already pay
 * against, so this is the established calculation reduced to the one number
 * the payment needs:
 *
 * ```
 * subtotal  = PRICE_PER_YEAR_CENTS * gestureCount
 * logoTotal = includeLogo ? LOGO_ADDON_CENTS * gestureCount : 0
 * total     = subtotal + logoTotal
 * ```
 *
 * The constants come from `@smog/config`, which the apps share — a second
 * copy in `apps/site` would be a second thing to forget the next time a
 * price changes.
 *
 * **`FIXED_DURATION_YEARS` is deliberately absent from the arithmetic.** The
 * calculation multiplies by `gestureCount` alone and reports `durationYears`
 * alongside the total rather than multiplying it in. The two agree today only
 * because the constant is 1, and multiplying here would silently double every
 * price the day somebody set it to 2.
 *
 * @param gestureCount How many gestures the order covers.
 * @param includeLogo Whether the sponsor's logo is overlaid on each of them.
 * @throws If `gestureCount` is not a whole number between 1 and
 *   `MAX_GESTURES_PER_SPONSORSHIP`.
 */
export function sponsorshipAmountCents(
  gestureCount: number,
  includeLogo: boolean
): number {
  // Not belt-and-braces around the selection endpoint's cap, which refuses an
  // over-long selection with a sentence a person can read. This is the
  // money path: a fractional count multiplies into a fractional cent
  // amount, which `toFixed(2)` turns into a rounded charge nobody agreed
  // to, and a zero or negative one turns into a Mollie error — or a refund
  // — at the moment the sponsor presses pay. Both guards read the same
  // shared constant, so they cannot drift into disagreeing.
  if (!Number.isInteger(gestureCount)) {
    throw new Error(
      `A sponsorship covers a whole number of gestures; got ${gestureCount}.`
    );
  }

  if (gestureCount < 1 || gestureCount > MAX_GESTURES_PER_SPONSORSHIP) {
    throw new Error(
      `A sponsorship covers between 1 and ${MAX_GESTURES_PER_SPONSORSHIP} gestures; got ${gestureCount}.`
    );
  }

  const subtotalCents = PRICE_PER_YEAR_CENTS * gestureCount;
  const logoCents = includeLogo ? LOGO_ADDON_CENTS * gestureCount : 0;

  return subtotalCents + logoCents;
}

/**
 * An amount of euro cents, as a page prints it.
 *
 * Belgian Dutch: a comma for the decimal separator and a non-breaking space
 * after the sign, which is what `Intl` produces for `nl-BE` and what nobody
 * gets right by hand. It lives beside the arithmetic so that the number a
 * sponsor reads on the selection screen, on the review screen and on Mollie's
 * page is formatted once — three `toFixed(2)` calls is three chances to show
 * a price that is not the one being charged.
 */
export function formatEuro(cents: number): string {
  return new Intl.NumberFormat("nl-BE", {
    currency: "EUR",
    style: "currency",
  }).format(cents / CENTS_PER_EURO);
}
