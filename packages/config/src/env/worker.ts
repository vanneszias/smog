import { z } from "zod";

export const ENVIRONMENTS = ["dev", "staging", "production"] as const;
export const RENDER_MODES = ["container", "local", "fake"] as const;

export type Environment = (typeof ENVIRONMENTS)[number];

/** Plain `vars` of the site Worker (`wrangler.jsonc` `env.*.vars`). */
export const workerVarsSchema = z.object({
  EMAIL_FROM: z.string().min(1),
  EMAIL_REPLY_TO: z.email(),
  ENVIRONMENT: z.enum(ENVIRONMENTS),
  OPENPANEL_API_URL: z.url().default("https://analytics.zias.be/api"),
  RENDER_MODE: z.enum(RENDER_MODES).default("container"),
  SITE_URL: z.url(),
});

export type WorkerVars = z.infer<typeof workerVarsSchema>;

/** An optional secret: unset and empty (`KEY=` in `.dev.vars`) both mean "off". */
const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional()
);

/**
 * Secrets of the site Worker (`.dev.vars` locally, `wrangler secret put`
 * in staging/production). Later phases add Mollie, Mux and OpenPanel.
 */
export const workerSecretsSchema = z.object({
  APPLE_APP_BUNDLE_IDENTIFIER: optionalSecret,
  APPLE_CLIENT_ID: optionalSecret,
  APPLE_CLIENT_SECRET: optionalSecret,
  BETTER_AUTH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: optionalSecret,
  GOOGLE_CLIENT_SECRET: optionalSecret,
  TURNSTILE_SECRET_KEY: optionalSecret,
});

export type WorkerSecrets = z.infer<typeof workerSecretsSchema>;

/** Vars and secrets together: the `env` of the rpc context. */
export const workerEnvSchema = workerVarsSchema.extend(
  workerSecretsSchema.shape
);

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

/** Validates the vars and secrets once per isolate; names every invalid key. */
export function parseWorkerEnv(env: object): WorkerEnv {
  const result = workerEnvSchema.safeParse(env);
  if (!result.success) {
    throw new Error(
      `[config] Invalid worker env:\n${z.prettifyError(result.error)}`
    );
  }
  return result.data;
}

export function parseWorkerVars(env: object): WorkerVars {
  const result = workerVarsSchema.safeParse(env);
  if (!result.success) {
    throw new Error(
      `[config] Invalid worker vars:\n${z.prettifyError(result.error)}`
    );
  }
  return result.data;
}
