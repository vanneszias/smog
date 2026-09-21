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

/**
 * What a sponsorship order costs, in euro cents.
 *
 * **Transcribed, not designed.** The migration's non-goal is that pricing
 * does not change, so this is `apps/web/src/lib/pricing.ts`'s
 * `calculateSimplifiedPrice` reduced to the one number the payment needs:
 *
 * ```
 * subtotal  = PRICE_PER_YEAR_CENTS * gestureCount
 * logoTotal = includeLogo ? LOGO_ADDON_CENTS * gestureCount : 0
 * total     = subtotal + logoTotal
 * ```
 *
 * The constants come from `@smog/config`, which both apps share and which
 * survives until Stage 10 — a second copy in `apps/site` would be a second
 * thing to forget the next time a price changes.
 *
 * **`FIXED_DURATION_YEARS` is deliberately absent from the arithmetic.**
 * The plan's interface list names it as an input, but the shipped
 * calculation does not multiply by it: it multiplies by `gestureCount`
 * alone and reports `durationYears` alongside the total as a separate field
 * of the breakdown. The two agree today only because the constant is 1, and
 * multiplying here would silently double every price the day somebody set
 * it to 2 while `apps/web` kept charging the old amount. Transcription wins
 * over the plan.
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
  // Not belt-and-braces around Task 6's selection cap, which refuses an
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
