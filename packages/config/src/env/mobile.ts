import { z } from "zod";
import { ENVIRONMENTS } from "./worker";

/** Public (`EXPO_PUBLIC_*`) env of the mobile app, inlined at build time. */
export const mobileEnvSchema = z.object({
  EXPO_PUBLIC_API_URL: z.url(),
  EXPO_PUBLIC_ENVIRONMENT: z.enum(ENVIRONMENTS),
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
