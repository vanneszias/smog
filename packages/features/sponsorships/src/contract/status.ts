import {
  paymentStatusInputSchema,
  paymentStatusSchema,
} from "../schema/status";
import {
  READ_GUARD,
  type SponsorshipGuards,
  sponsorshipContract,
} from "./guards";

/** The return page's poll (S-14, ruling 2). Implemented by phase 6 task 4. */
export const statusSlice = {
  /**
   * The payment's status by our id or Mollie's. An `open` payment is
   * re-fetched from Mollie and settled (at most once per 5 s). No PII
   * beyond the display name. `NOT_FOUND` for an unknown payment.
   */
  paymentStatus: sponsorshipContract
    .input(paymentStatusInputSchema)
    .output(paymentStatusSchema),
};

export const STATUS_GUARDS = {
  paymentStatus: READ_GUARD,
} as const satisfies SponsorshipGuards<typeof statusSlice>;
