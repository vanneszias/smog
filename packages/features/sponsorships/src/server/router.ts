import { getAvailability } from "./availability";
import { checkoutProcedures } from "./checkout";
import { logoProcedures } from "./logo";
import {
  type SponsorshipsDeps,
  type SponsorshipsImplementer,
  sponsorshipProcedure,
} from "./procedure";
import { getQuote } from "./quote";
import { reeditProcedures } from "./reedit";
import { renewalProcedures } from "./renewal";
import { statusProcedures } from "./status";

/** The public reads (S-02, S-26, L-17). */
function publicProcedures(os: SponsorshipsImplementer) {
  return {
    availability: os.availability.handler(async ({ context, input }) => ({
      checkoutEnabled: Boolean(context.env.MOLLIE_API_KEY),
      items: await getAvailability(context.db, input.gestureIds),
    })),
    quote: os.quote.handler(
      async ({ context, input }) => await getQuote(context.db, input)
    ),
  };
}

/**
 * The `sponsorships` slice of the app router: one spread per area, so the
 * tasks that implement them edit only their own file. Every procedure is
 * public and runs its declared guards (`sponsorshipProcedure`).
 */
export function createSponsorshipsRouter(deps: SponsorshipsDeps = {}) {
  const os = sponsorshipProcedure;
  return os.router({
    ...publicProcedures(os),
    ...checkoutProcedures(os, deps),
    ...logoProcedures(os),
    ...statusProcedures(os, deps),
    ...reeditProcedures(os, deps),
    ...renewalProcedures(os, deps),
  });
}
