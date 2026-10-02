import { z } from "zod";

export const ENVIRONMENTS = ["dev", "staging", "production"] as const;
export const RENDER_MODES = ["container", "local", "fake"] as const;

export type Environment = (typeof ENVIRONMENTS)[number];

/** The self-hosted OpenPanel (spec §12), for the relay and the native client. */
export const OPENPANEL_DEFAULT_API_URL = "https://analytics.zias.be/api";

/** The Mux Video API; `MUX_API_URL` points at the Mux fake in tests and e2e. */
export const MUX_DEFAULT_API_URL = "https://api.mux.com";

/** An optional value: unset and empty (`KEY=` in `.dev.vars`) both mean "off". */
export const optionalValue = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional()
);

/** Plain `vars` of the site Worker (`wrangler.jsonc` `env.*.vars`). */
export const workerVarsSchema = z.object({
  EMAIL_FROM: z.string().min(1),
  EMAIL_REPLY_TO: z.email(),
  ENVIRONMENT: z.enum(ENVIRONMENTS),
  /** The Mux API base (`@smog/video`); only tests and e2e change it (the fake). */
  MUX_API_URL: z.url().default(MUX_DEFAULT_API_URL),
  OPENPANEL_API_URL: z.url().default(OPENPANEL_DEFAULT_API_URL),
  RENDER_MODE: z.enum(RENDER_MODES).default("container"),
  SITE_URL: z.url(),
  /** The public Turnstile widget key; the widget is hidden without it. */
  TURNSTILE_SITE_KEY: optionalValue,
});

export type WorkerVars = z.infer<typeof workerVarsSchema>;

/**
 * Secrets of the site Worker (`.dev.vars` locally, `wrangler secret put`
 * in staging/production). Phase 6 adds Mollie.
 */
export const workerSecretsSchema = z.object({
  APPLE_APP_BUNDLE_IDENTIFIER: optionalValue,
  APPLE_CLIENT_ID: optionalValue,
  APPLE_CLIENT_SECRET: optionalValue,
  BETTER_AUTH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: optionalValue,
  GOOGLE_CLIENT_SECRET: optionalValue,
  /**
   * The Mux access token (`@smog/video`). Optional: without both, admin
   * video uploads and the asset picker are off (`INVALID_STATE`) and only a
   * pasted playback id works. Phase 8 makes them required in production.
   */
  MUX_TOKEN_ID: optionalValue,
  MUX_TOKEN_SECRET: optionalValue,
  /** The Mux webhook signing secret; `/api/webhooks/mux` answers 503 without it. */
  MUX_WEBHOOK_SECRET: optionalValue,
  /** The OpenPanel relay (`/api/analytics`); events are dropped without them. */
  OPENPANEL_CLIENT_ID: optionalValue,
  OPENPANEL_CLIENT_SECRET: optionalValue,
  TURNSTILE_SECRET_KEY: optionalValue,
});

export type WorkerSecrets = z.infer<typeof workerSecretsSchema>;

/**
 * Vars and secrets together: the `env` of the rpc context. Outside `dev`
 * `TURNSTILE_SECRET_KEY` is required, so `requireTurnstile` can never fail
 * open in staging or production (Cloudflare's always-pass test secret is
 * fine for a staging without a real widget).
 */
export const workerEnvSchema = workerVarsSchema
  .extend(workerSecretsSchema.shape)
  .refine(
    (env) =>
      env.ENVIRONMENT === "dev" || env.TURNSTILE_SECRET_KEY !== undefined,
    {
      message:
        "is required outside dev (requireTurnstile fails open without it)",
      path: ["TURNSTILE_SECRET_KEY"],
    }
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

/** What the sign-in screens may know about the server's auth setup. */
export interface PublicAuthConfig {
  apple: boolean;
  google: boolean;
  /** Shown as a Turnstile widget on the guarded auth calls when set. */
  turnstileSiteKey: string | null;
}

/**
 * The public part of the auth config: a social provider shows only when
 * both its client id and secret are set (spec: optional in dev).
 */
export function publicAuthConfig(env: WorkerEnv): PublicAuthConfig {
  return {
    apple: Boolean(env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET),
    google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? null,
  };
}
