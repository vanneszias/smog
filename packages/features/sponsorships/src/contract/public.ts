import {
  availabilityInputSchema,
  availabilitySchema,
  quoteInputSchema,
  quoteSchema,
} from "../schema/availability";
import {
  READ_GUARD,
  type SponsorshipGuards,
  sponsorshipContract,
} from "./guards";

/** The wizard's and the gesture CTA's reads (S-02, S-26, L-17). */
export const publicSlice = {
  /**
   * Whether each gesture can be sponsored (`available`, `pending`,
   * `sponsored` with the display name and the end, or `unavailable`), and
   * `checkoutEnabled` (`false` without a Mollie key). One D1 read.
   */
  availability: sponsorshipContract
    .input(availabilityInputSchema)
    .output(availabilitySchema),
  /** The price of a selection and which gestures are not available. */
  quote: sponsorshipContract.input(quoteInputSchema).output(quoteSchema),
};

export const PUBLIC_GUARDS = {
  availability: READ_GUARD,
  quote: READ_GUARD,
} as const satisfies SponsorshipGuards<typeof publicSlice>;
