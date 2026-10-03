import { accountContract } from "@smog/account/contract";
import { adminContract } from "@smog/admin/contract";
import { ENVIRONMENTS } from "@smog/config/env/worker";
import { favoritesContract } from "@smog/favorites/contract";
import { gesturesContract } from "@smog/gestures/contract";
import { listsContract } from "@smog/lists/contract";
import { baseContract, roleSchema } from "@smog/rpc/contract";
import { sponsorshipsContract } from "@smog/sponsorships/contract";
import { z } from "zod";

/** The public fields of the signed-in user. */
export const whoamiUserSchema = z.object({
  email: z.email(),
  id: z.string(),
  image: z.string().nullable(),
  name: z.string(),
  role: roleSchema,
});

/** Liveness and the current session, before any feature exists. */
export const systemContract = {
  /** Which sign-in methods and captcha the app shows (no secrets). */
  authConfig: baseContract.output(
    z.object({
      apple: z.boolean(),
      google: z.boolean(),
      turnstileSiteKey: z.string().nullable(),
    })
  ),
  health: baseContract.output(
    z.object({ environment: z.enum(ENVIRONMENTS), ok: z.literal(true) })
  ),
  whoami: baseContract.output(z.object({ user: whoamiUserSchema.nullable() })),
};

/**
 * The app contract: one key per feature contract (spec §7). Features are
 * added here as they land (`gestures`, `favorites`, …).
 */
export const appContract = {
  account: accountContract,
  admin: adminContract,
  favorites: favoritesContract,
  gestures: gesturesContract,
  lists: listsContract,
  sponsorships: sponsorshipsContract,
  system: systemContract,
};

export type AppContract = typeof appContract;
