import { workerSecretsSchema, workerVarsSchema } from "@smog/config/env/worker";
import { z } from "zod";

/** The vars and secrets `createAuth` reads (defined in `@smog/config`). */
export const authEnvSchema = workerVarsSchema
  .pick({
    EMAIL_FROM: true,
    EMAIL_REPLY_TO: true,
    ENVIRONMENT: true,
    SITE_URL: true,
  })
  .extend(workerSecretsSchema.shape);

export type AuthEnv = z.infer<typeof authEnvSchema>;

/** Validates the auth env once per isolate; names every invalid key. */
export function parseAuthEnv(env: object): AuthEnv {
  const result = authEnvSchema.safeParse(env);
  if (!result.success) {
    throw new Error(
      `[auth] Invalid auth env:\n${z.prettifyError(result.error)}`
    );
  }
  return result.data;
}
