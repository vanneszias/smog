import { z } from "zod";
import {
  reeditSchema,
  reeditSubmitInputSchema,
  tokenInputSchema,
} from "../schema/tokens";
import {
  MUTATION_GUARD,
  READ_GUARD,
  type SponsorshipGuards,
  sponsorshipContract,
} from "./guards";

/** The re-edit link (S-19, ruling 11). Implemented by phase 6 task 5. */
export const reeditSlice = {
  reedit: {
    /**
     * What the link may change. `TOKEN_INVALID` for an unknown or used
     * link, `TOKEN_EXPIRED` (with `expiresAt`) for an expired one.
     */
    get: sponsorshipContract.input(tokenInputSchema).output(reeditSchema),
    /**
     * Uses the token, sets the display name (and the logo, only if the
     * sponsorship has one: `INVALID_STATE noLogo`), and moves
     * `changes_requested → rendering`, which starts a new render.
     */
    submit: sponsorshipContract
      .input(reeditSubmitInputSchema)
      .output(z.object({ submitted: z.literal(true) })),
  },
};

export const REEDIT_GUARDS = {
  "reedit.get": READ_GUARD,
  "reedit.submit": MUTATION_GUARD,
} as const satisfies SponsorshipGuards<typeof reeditSlice>;
