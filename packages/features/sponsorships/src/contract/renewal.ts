import {
  renewalCheckoutInputSchema,
  renewalSchema,
  tokenInputSchema,
} from "../schema/tokens";
import { checkoutResultSchema } from "../schema/wizard";
import {
  MUTATION_GUARD,
  READ_GUARD,
  type SponsorshipGuards,
  sponsorshipContract,
} from "./guards";

/** The renewal link (S-20, ruling 11). Implemented by phase 6 task 5. */
export const renewalSlice = {
  renewal: {
    /**
     * A `renewal` payment while the sponsorship is `live` or `expiring`
     * (`INVALID_STATE notRenewable` otherwise); an open one is answered
     * again. The token is used only when the payment settles paid.
     */
    checkout: sponsorshipContract
      .input(renewalCheckoutInputSchema)
      .output(checkoutResultSchema),
    /** The sponsorship to renew and its price. `TOKEN_INVALID` / `TOKEN_EXPIRED`. */
    get: sponsorshipContract.input(tokenInputSchema).output(renewalSchema),
  },
};

export const RENEWAL_GUARDS = {
  "renewal.checkout": MUTATION_GUARD,
  "renewal.get": READ_GUARD,
} as const satisfies SponsorshipGuards<typeof renewalSlice>;
