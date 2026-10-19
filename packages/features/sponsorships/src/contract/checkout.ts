import { checkoutInputSchema, checkoutResultSchema } from "../schema/wizard";
import {
  MUTATION_GUARD,
  type SponsorshipGuards,
  sponsorshipContract,
} from "./guards";

/** The checkout (S-11, ruling 5). Implemented by phase 6 task 4. */
export const checkoutSlice = {
  /**
   * Validates, verifies the logo, prices the selection (`PAYMENT_MISMATCH`
   * when `expectedTotalCents` differs), writes the sponsor, the invoice
   * request, the sponsorships, the payment and its items in one batch,
   * creates the Mollie payment and answers its checkout URL. A repeat with
   * the same `checkoutId` answers the same while the payment is open
   * (`INVALID_STATE alreadySettled` after). `GESTURE_UNAVAILABLE` with the
   * ids for a taken, unpublished or unknown gesture;
   * `INVALID_STATE paymentsUnavailable` without a Mollie key,
   * `paymentProvider` when Mollie fails, `logoInvalid` for a bad logo.
   */
  checkout: sponsorshipContract
    .input(checkoutInputSchema)
    .output(checkoutResultSchema),
};

export const CHECKOUT_GUARDS = {
  checkout: MUTATION_GUARD,
} as const satisfies SponsorshipGuards<typeof checkoutSlice>;
