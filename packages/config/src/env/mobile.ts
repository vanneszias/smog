import { z } from "zod";
import {
  ENVIRONMENTS,
  OPENPANEL_DEFAULT_API_URL,
  optionalValue,
} from "./worker";

/** Public (`EXPO_PUBLIC_*`) env of the mobile app, inlined at build time. */
export const mobileEnvSchema = z.object({
  EXPO_PUBLIC_API_URL: z.url(),
  EXPO_PUBLIC_ENVIRONMENT: z.enum(ENVIRONMENTS),
  EXPO_PUBLIC_OPENPANEL_API_URL: z.url().default(OPENPANEL_DEFAULT_API_URL),
  /**
   * A write-only OpenPanel client (spec §12): the secret ships in the app
   * binary, so it may only send events. Without both, analytics is off.
   */
  EXPO_PUBLIC_OPENPANEL_CLIENT_ID: optionalValue,
  EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET: optionalValue,
  EXPO_PUBLIC_SITE_HOST: z.hostname(),
});

export type MobileEnv = z.infer<typeof mobileEnvSchema>;

export function parseMobileEnv(env: Record<string, unknown>): MobileEnv {
  const result = mobileEnvSchema.safeParse(env);
  if (!result.success) {
    throw new Error(
      `[config] Invalid mobile env:\n${z.prettifyError(result.error)}`
    );
  }
  return result.data;
}
