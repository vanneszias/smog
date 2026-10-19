import {
  uploadLogoInputSchema,
  uploadLogoResultSchema,
} from "../schema/wizard";
import { type SponsorshipGuards, sponsorshipContract } from "./guards";

/** The logo upload (S-07, ruling 10). Implemented by phase 6 task 4. */
export const logoSlice = {
  /**
   * A presigned R2 PUT (or the signed same-origin fallback) for one logo
   * of at most 2 MiB (PNG, JPEG or WebP). The checkout verifies the object.
   */
  uploadLogo: sponsorshipContract
    .input(uploadLogoInputSchema)
    .output(uploadLogoResultSchema),
};

/** `RL_SPONSOR` only: a Turnstile token is single use, and the checkout needs it. */
export const LOGO_GUARDS = {
  uploadLogo: { rateLimit: "RL_SPONSOR", turnstile: false },
} as const satisfies SponsorshipGuards<typeof logoSlice>;
