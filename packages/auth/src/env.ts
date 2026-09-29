import { workerSecretsSchema, workerVarsSchema } from "@smog/config/env/worker";
import { z } from "zod";

/**
 * The public dev secret from `apps/site/.dev.vars.example` (a site test keeps
 * the two equal). It is refused outside `dev`.
 */
export const DEV_BETTER_AUTH_SECRET =
  "dev-only-secret-change-me-0123456789abcdef";

/** The vars and secrets `createAuth` reads (defined in `@smog/config`). */
export const authEnvSchema = workerVarsSchema
  .pick({
    EMAIL_FROM: true,
    EMAIL_REPLY_TO: true,
    ENVIRONMENT: true,
    SITE_URL: true,
  })
  .extend(workerSecretsSchema.shape)
  .refine(
    (env) =>
      env.ENVIRONMENT === "dev" ||
      env.BETTER_AUTH_SECRET !== DEV_BETTER_AUTH_SECRET,
    {
      message: "the public dev secret is not allowed outside dev",
      path: ["BETTER_AUTH_SECRET"],
    }
  );

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
