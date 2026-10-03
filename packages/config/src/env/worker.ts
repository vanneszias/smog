import { z } from "zod";

export const ENVIRONMENTS = ["dev", "staging", "production"] as const;
export const RENDER_MODES = ["container", "local", "fake"] as const;

export type Environment = (typeof ENVIRONMENTS)[number];

/** The self-hosted OpenPanel (spec §12), for the relay and the native client. */
export const OPENPANEL_DEFAULT_API_URL = "https://analytics.zias.be/api";

/** The Mux Video API; `MUX_API_URL` points at the Mux fake in tests and e2e. */
export const MUX_DEFAULT_API_URL = "https://api.mux.com";

/** The Mollie API; `MOLLIE_API_URL` points at the Mollie fake in dev and e2e. */
export const MOLLIE_DEFAULT_API_URL = "https://api.mollie.com";

const TRAILING_SLASHES = /\/+$/;
/** A Mollie API key (ruling 2): `test_` or `live_`, then the key itself. */
const MOLLIE_API_KEY_PATTERN = /^(test|live)_\w{20,}$/;

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
  /** The R2 bucket behind `MEDIA` (`smog-<env>-media`), for the presigned logo PUT. */
  MEDIA_BUCKET: optionalValue,
  /** The Mollie API base (`@smog/payments`); only dev changes it (the fake). */
  MOLLIE_API_URL: z.url().default(MOLLIE_DEFAULT_API_URL),
  /** The Mux API base (`@smog/video`); only tests and e2e change it (the fake). */
  MUX_API_URL: z.url().default(MUX_DEFAULT_API_URL),
  OPENPANEL_API_URL: z.url().default(OPENPANEL_DEFAULT_API_URL),
  /** The account id of the R2 S3 endpoint (`<id>.r2.cloudflarestorage.com`). */
  R2_ACCOUNT_ID: optionalValue,
  /** How a render job starts (ruling 7): `fake` in dev and staging until phase 7. */
  RENDER_MODE: z.enum(RENDER_MODES).default("container"),
  SITE_URL: z.url(),
  /** The public Turnstile widget key; the widget is hidden without it. */
  TURNSTILE_SITE_KEY: optionalValue,
});

export type WorkerVars = z.infer<typeof workerVarsSchema>;

/**
 * Secrets of the site Worker (`.dev.vars` locally, `wrangler secret put`
 * in staging/production).
 */
export const workerSecretsSchema = z.object({
  APPLE_APP_BUNDLE_IDENTIFIER: optionalValue,
  APPLE_CLIENT_ID: optionalValue,
  APPLE_CLIENT_SECRET: optionalValue,
  BETTER_AUTH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: optionalValue,
  GOOGLE_CLIENT_SECRET: optionalValue,
  /**
   * The Mollie API key (`@smog/payments`). Optional: without it checkout
   * answers `paymentsUnavailable`, the wizard says sponsoring is paused and
   * `/api/webhooks/mollie` answers 503 (ruling 5). `test_` outside
   * production, `live_` in production (`workerEnvSchema`).
   */
  MOLLIE_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .regex(MOLLIE_API_KEY_PATTERN, "must be a Mollie test_ or live_ key")
      .optional()
  ),
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
  /**
   * An R2 API token (S3 credentials) for the presigned logo PUT (ruling 10).
   * Optional: without both, uploads go through the signed same-origin
   * fallback route.
   */
  R2_ACCESS_KEY_ID: optionalValue,
  R2_SECRET_ACCESS_KEY: optionalValue,
  TURNSTILE_SECRET_KEY: optionalValue,
});

export type WorkerSecrets = z.infer<typeof workerSecretsSchema>;

/**
 * Vars and secrets together: the `env` of the rpc context. Outside `dev`
 * `TURNSTILE_SECRET_KEY` is required, so `requireTurnstile` can never fail
 * open in staging or production (Cloudflare's always-pass test secret is
 * fine for a staging without a real widget), and `MUX_API_URL` must be the
 * real Mux API (the Basic token goes there). The same holds for
 * `MOLLIE_API_URL`; a Mollie key is `live_` in production and `test_`
 * elsewhere; and the R2 tokens come with `R2_ACCOUNT_ID` and
 * `MEDIA_BUCKET` (phase 6 rulings 2, 10 and 12).
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
  )
  .refine(
    (env) =>
      env.ENVIRONMENT === "dev" ||
      env.MUX_API_URL.replace(TRAILING_SLASHES, "") === MUX_DEFAULT_API_URL,
    {
      message:
        "must be the real Mux API outside dev (the token is sent there; only the e2e fake changes it)",
      path: ["MUX_API_URL"],
    }
  )
  .refine(
    (env) =>
      env.MOLLIE_API_KEY === undefined ||
      env.MOLLIE_API_KEY.startsWith(
        env.ENVIRONMENT === "production" ? "live_" : "test_"
      ),
    {
      message:
        "production takes a live_ key only, dev and staging a test_ key only",
      path: ["MOLLIE_API_KEY"],
    }
  )
  .refine(
    (env) =>
      env.ENVIRONMENT === "dev" ||
      env.MOLLIE_API_URL.replace(TRAILING_SLASHES, "") ===
        MOLLIE_DEFAULT_API_URL,
    {
      message:
        "must be the real Mollie API outside dev (the key is sent there; only the dev fake changes it)",
      path: ["MOLLIE_API_URL"],
    }
  )
  .superRefine((env, context) => {
    // The presigned PUT needs the whole S3 identity, or none of it.
    if (
      env.R2_ACCESS_KEY_ID === undefined &&
      env.R2_SECRET_ACCESS_KEY === undefined
    ) {
      return;
    }
    for (const key of [
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_ACCOUNT_ID",
      "MEDIA_BUCKET",
    ] as const) {
      if (env[key] === undefined) {
        context.addIssue({
          code: "custom",
          message: "is required with the R2 tokens (the presigned logo upload)",
          path: [key],
        });
      }
    }
  });

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

type SecretKey = keyof z.infer<typeof workerSecretsSchema>;
type VarKey = keyof z.infer<typeof workerVarsSchema>;

/**
 * What a deploy of each env needs set (ruling 12): its secrets
 * (`wrangler secret put`) and its vars (`wrangler.jsonc` `env.<env>.vars`).
 * `scripts/release-config-check.ts` asserts each key is in the schema and
 * in `.dev.vars.example` or `wrangler.jsonc`; phase 8 makes the deploy
 * check the real values (`wrangler secret list`). Everything else is
 * optional and degrades cleanly when unset.
 */
export const REQUIRED_WORKER_CONFIG: Record<
  Environment,
  { secrets: readonly SecretKey[]; vars: readonly VarKey[] }
> = {
  dev: { secrets: [], vars: [] },
  production: {
    secrets: [
      "BETTER_AUTH_SECRET",
      "TURNSTILE_SECRET_KEY",
      "MOLLIE_API_KEY",
      "MUX_TOKEN_ID",
      "MUX_TOKEN_SECRET",
      "MUX_WEBHOOK_SECRET",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
    ],
    vars: ["TURNSTILE_SITE_KEY", "R2_ACCOUNT_ID"],
  },
  staging: {
    secrets: ["BETTER_AUTH_SECRET", "TURNSTILE_SECRET_KEY"],
    vars: [],
  },
};

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

/**
 * The queue and R2 bindings every env declares in `wrangler.jsonc`
 * (Phase 6 fix wave, jobs M-4). They are validated once per isolate with
 * the vars and secrets (the site's `siteEnv()`), so a missing binding
 * fails at the first request instead of after a cron committed its state.
 * Only the shape the code calls is checked (`send`; R2's object methods):
 * the platform types stay the site's.
 */
export const WORKER_BINDINGS = [
  "EMAIL_QUEUE",
  "EVENTS_QUEUE",
  "MEDIA",
] as const;
export type WorkerBinding = (typeof WORKER_BINDINGS)[number];

function hasMethods(value: unknown, methods: readonly string[]): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    methods.every(
      (method) =>
        typeof (value as Record<string, unknown>)[method] === "function"
    )
  );
}

const queueBinding = z.custom<object>(
  (value) => hasMethods(value, ["send"]),
  "a Queue producer binding (send)"
);
const bucketBinding = z.custom<object>(
  (value) => hasMethods(value, ["head", "get", "put", "delete", "list"]),
  "an R2 bucket binding"
);

export const workerBindingsSchema = z.object({
  EMAIL_QUEUE: queueBinding,
  EVENTS_QUEUE: queueBinding,
  MEDIA: bucketBinding,
} satisfies Record<WorkerBinding, z.ZodType>);

/**
 * Validates the queue and R2 bindings once per isolate and answers them
 * as given (typed by the caller's env); names every missing one.
 */
export function parseWorkerBindings<
  Env extends Partial<Record<WorkerBinding, unknown>>,
>(env: Env): { [K in WorkerBinding]: NonNullable<Env[K]> } {
  const result = workerBindingsSchema.safeParse(env);
  if (!result.success) {
    throw new Error(
      `[config] Invalid worker bindings:\n${z.prettifyError(result.error)}`
    );
  }
  return {
    EMAIL_QUEUE: env.EMAIL_QUEUE as NonNullable<Env["EMAIL_QUEUE"]>,
    EVENTS_QUEUE: env.EVENTS_QUEUE as NonNullable<Env["EVENTS_QUEUE"]>,
    MEDIA: env.MEDIA as NonNullable<Env["MEDIA"]>,
  };
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
