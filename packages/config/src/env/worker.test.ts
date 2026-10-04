import { describe, expect, test } from "bun:test";
import {
  ENVIRONMENTS,
  MOLLIE_DEFAULT_API_URL,
  parseWorkerBindings,
  parseWorkerEnv,
  parseWorkerVars,
  publicAuthConfig,
  RENDER_LOCAL_DEFAULT_URL,
  REQUIRED_WORKER_CONFIG,
  requiredWorkerConfig,
  WORKER_BINDINGS,
  workerEnvSchema,
  workerSecretsSchema,
  workerVarsSchema,
} from "./worker";

describe("parseWorkerVars", () => {
  test("applies defaults for optional vars", () => {
    const vars = parseWorkerVars({
      EMAIL_FROM: "SMOG <no-reply@example.com>",
      EMAIL_REPLY_TO: "info@smog.vlaanderen",
      ENVIRONMENT: "dev",
      SITE_URL: "http://localhost:5173",
    });

    expect(vars.OPENPANEL_API_URL).toBe("https://analytics.zias.be/api");
    expect(vars.RENDER_MODE).toBe("container");
    expect(vars.SITE_URL).toBe("http://localhost:5173");
    expect(vars.ENVIRONMENT).toBe("dev");
  });

  test("names the missing variable when invalid", () => {
    expect(() => parseWorkerVars({})).toThrow("SITE_URL");
  });

  test("rejects an unknown environment", () => {
    expect(() =>
      parseWorkerVars({
        EMAIL_FROM: "SMOG <no-reply@example.com>",
        EMAIL_REPLY_TO: "info@smog.vlaanderen",
        ENVIRONMENT: "preview",
        SITE_URL: "http://localhost:5173",
      })
    ).toThrow("ENVIRONMENT");
  });
});

describe("workerSecretsSchema", () => {
  const secret = "x".repeat(32);

  test("requires a BETTER_AUTH_SECRET of at least 32 characters", () => {
    expect(workerSecretsSchema.safeParse({}).success).toBe(false);
    expect(
      workerSecretsSchema.safeParse({ BETTER_AUTH_SECRET: "short" }).success
    ).toBe(false);
    expect(
      workerSecretsSchema.parse({ BETTER_AUTH_SECRET: secret })
        .BETTER_AUTH_SECRET
    ).toBe(secret);
  });

  test("the OpenPanel relay credentials are optional", () => {
    const secrets = workerSecretsSchema.parse({
      BETTER_AUTH_SECRET: secret,
      OPENPANEL_CLIENT_ID: "id",
      OPENPANEL_CLIENT_SECRET: "",
    });
    expect(secrets.OPENPANEL_CLIENT_ID).toBe("id");
    expect(secrets.OPENPANEL_CLIENT_SECRET).toBeUndefined();
  });

  test("treats an empty optional secret as unset", () => {
    const secrets = workerSecretsSchema.parse({
      BETTER_AUTH_SECRET: secret,
      GOOGLE_CLIENT_ID: "",
      TURNSTILE_SECRET_KEY: "t",
    });
    expect(secrets.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(secrets.TURNSTILE_SECRET_KEY).toBe("t");
  });
});

describe("parseWorkerEnv", () => {
  test("returns the vars and secrets together", () => {
    const env = parseWorkerEnv({
      BETTER_AUTH_SECRET: "x".repeat(32),
      EMAIL_FROM: "SMOG <no-reply@example.com>",
      EMAIL_REPLY_TO: "info@smog.vlaanderen",
      ENVIRONMENT: "dev",
      SITE_URL: "https://smog.test",
      TURNSTILE_SECRET_KEY: "",
    });

    expect(env.ENVIRONMENT).toBe("dev");
    expect(env.BETTER_AUTH_SECRET).toHaveLength(32);
    expect(env.TURNSTILE_SECRET_KEY).toBeUndefined();
  });

  test("names every invalid key", () => {
    expect(() => parseWorkerEnv({})).toThrow("BETTER_AUTH_SECRET");
  });

  test("requires TURNSTILE_SECRET_KEY outside dev only", () => {
    const base = {
      BETTER_AUTH_SECRET: "x".repeat(32),
      EMAIL_FROM: "SMOG <no-reply@example.com>",
      EMAIL_REPLY_TO: "info@smog.vlaanderen",
      SITE_URL: "https://smog.test",
    };
    expect(parseWorkerEnv({ ...base, ENVIRONMENT: "dev" }).ENVIRONMENT).toBe(
      "dev"
    );
    for (const ENVIRONMENT of ["staging", "production"]) {
      expect(() => parseWorkerEnv({ ...base, ENVIRONMENT })).toThrow(
        "TURNSTILE_SECRET_KEY"
      );
    }
    const production = parseWorkerEnv({
      ...base,
      ENVIRONMENT: "production",
      TURNSTILE_SECRET_KEY: "t",
    });
    expect(production.TURNSTILE_SECRET_KEY).toBe("t");
  });
});

describe("publicAuthConfig", () => {
  const base = {
    BETTER_AUTH_SECRET: "x".repeat(32),
    EMAIL_FROM: "SMOG <no-reply@example.com>",
    EMAIL_REPLY_TO: "info@smog.vlaanderen",
    ENVIRONMENT: "dev",
    SITE_URL: "https://smog.test",
  };

  test("hides providers without a client id and secret", () => {
    expect(publicAuthConfig(parseWorkerEnv(base))).toEqual({
      apple: false,
      google: false,
      turnstileSiteKey: null,
    });
  });

  test("shows configured providers and the public Turnstile site key", () => {
    const env = parseWorkerEnv({
      ...base,
      APPLE_CLIENT_ID: "apple",
      APPLE_CLIENT_SECRET: "apple-secret",
      GOOGLE_CLIENT_ID: "google",
      TURNSTILE_SITE_KEY: "site-key",
    });
    expect(publicAuthConfig(env)).toEqual({
      apple: true,
      google: false,
      turnstileSiteKey: "site-key",
    });
  });

  test("treats an empty site key as unset", () => {
    expect(
      parseWorkerVars({ ...base, TURNSTILE_SITE_KEY: "" }).TURNSTILE_SITE_KEY
    ).toBeUndefined();
  });
});

describe("the Mux settings", () => {
  const base = {
    BETTER_AUTH_SECRET: "x".repeat(32),
    EMAIL_FROM: "SMOG <no-reply@example.com>",
    EMAIL_REPLY_TO: "info@smog.vlaanderen",
    ENVIRONMENT: "staging",
    SITE_URL: "https://smog.test",
    TURNSTILE_SECRET_KEY: "turnstile",
  };

  test("are optional everywhere (staging runs without Mux)", () => {
    const env = parseWorkerEnv({
      ...base,
      MUX_TOKEN_ID: "",
      MUX_TOKEN_SECRET: "",
      MUX_WEBHOOK_SECRET: "",
    });
    expect(env.MUX_TOKEN_ID).toBeUndefined();
    expect(env.MUX_TOKEN_SECRET).toBeUndefined();
    expect(env.MUX_WEBHOOK_SECRET).toBeUndefined();
    expect(env.MUX_API_URL).toBe("https://api.mux.com");
  });

  test("a MUX_API_URL other than the real API is dev only", () => {
    for (const ENVIRONMENT of ["staging", "production"]) {
      expect(() =>
        parseWorkerEnv({
          ...base,
          ENVIRONMENT,
          MUX_API_URL: "http://localhost:4010",
        })
      ).toThrow("MUX_API_URL");
    }
    expect(
      parseWorkerEnv({ ...base, MUX_API_URL: "https://api.mux.com" })
        .MUX_API_URL
    ).toBe("https://api.mux.com");
  });

  test("MUX_API_URL can point at the fake in dev", () => {
    const env = parseWorkerEnv({
      ...base,
      ENVIRONMENT: "dev",
      MUX_API_URL: "http://localhost:4010",
      MUX_TOKEN_ID: "id",
      MUX_TOKEN_SECRET: "secret",
      MUX_WEBHOOK_SECRET: "whsec",
    });
    expect(env.MUX_API_URL).toBe("http://localhost:4010");
    expect(env.MUX_TOKEN_ID).toBe("id");
    expect(env.MUX_WEBHOOK_SECRET).toBe("whsec");
  });
});

describe("the phase 6 settings (Mollie, R2, render)", () => {
  const base = {
    BETTER_AUTH_SECRET: "x".repeat(32),
    EMAIL_FROM: "SMOG <no-reply@example.com>",
    EMAIL_REPLY_TO: "info@smog.vlaanderen",
    SITE_URL: "https://smog.test",
    TURNSTILE_SECRET_KEY: "turnstile",
  };
  const TEST_KEY = "test_dHar4XY7LxsDOtmnkVtjNVWXLSlXsM";
  const LIVE_KEY = "live_dHar4XY7LxsDOtmnkVtjNVWXLSlXsM";

  test("everything new is optional, in every env (staging has no Mollie key or R2 tokens)", () => {
    for (const ENVIRONMENT of ENVIRONMENTS) {
      const env = parseWorkerEnv({
        ...base,
        ENVIRONMENT,
        MEDIA_BUCKET: "",
        MOLLIE_API_KEY: "",
        R2_ACCESS_KEY_ID: "",
        R2_ACCOUNT_ID: "",
        R2_SECRET_ACCESS_KEY: "",
      });
      expect(env.MOLLIE_API_KEY).toBeUndefined();
      expect(env.R2_ACCESS_KEY_ID).toBeUndefined();
      expect(env.R2_SECRET_ACCESS_KEY).toBeUndefined();
      expect(env.R2_ACCOUNT_ID).toBeUndefined();
      expect(env.MEDIA_BUCKET).toBeUndefined();
      expect(env.MOLLIE_API_URL).toBe(MOLLIE_DEFAULT_API_URL);
    }
    expect(MOLLIE_DEFAULT_API_URL).toBe("https://api.mollie.com");
  });

  test("MOLLIE_API_KEY must look like a Mollie key", () => {
    for (const bad of [
      "tr_123",
      "test_short",
      "live-abcdefghijklmnopqrstuvwxyz",
      "sk_test_abcdefghijklmnopqrstuvwxyz",
    ]) {
      expect(() =>
        parseWorkerEnv({ ...base, ENVIRONMENT: "dev", MOLLIE_API_KEY: bad })
      ).toThrow("MOLLIE_API_KEY");
    }
  });

  test("production refuses a test_ key and accepts a live_ key", () => {
    expect(() =>
      parseWorkerEnv({
        ...base,
        ENVIRONMENT: "production",
        MOLLIE_API_KEY: TEST_KEY,
      })
    ).toThrow("MOLLIE_API_KEY");
    expect(
      parseWorkerEnv({
        ...base,
        ENVIRONMENT: "production",
        MOLLIE_API_KEY: LIVE_KEY,
      }).MOLLIE_API_KEY
    ).toBe(LIVE_KEY);
  });

  test("dev and staging refuse a live_ key and accept a test_ key", () => {
    for (const ENVIRONMENT of ["dev", "staging"]) {
      expect(() =>
        parseWorkerEnv({ ...base, ENVIRONMENT, MOLLIE_API_KEY: LIVE_KEY })
      ).toThrow("MOLLIE_API_KEY");
      expect(
        parseWorkerEnv({ ...base, ENVIRONMENT, MOLLIE_API_KEY: TEST_KEY })
          .MOLLIE_API_KEY
      ).toBe(TEST_KEY);
    }
  });

  test("a MOLLIE_API_URL other than the real API is dev only (the fake)", () => {
    for (const ENVIRONMENT of ["staging", "production"]) {
      expect(() =>
        parseWorkerEnv({
          ...base,
          ENVIRONMENT,
          MOLLIE_API_URL: "http://localhost:4020",
        })
      ).toThrow("MOLLIE_API_URL");
    }
    expect(
      parseWorkerEnv({
        ...base,
        ENVIRONMENT: "staging",
        MOLLIE_API_URL: "https://api.mollie.com/",
      }).MOLLIE_API_URL
    ).toBe("https://api.mollie.com/");
    expect(
      parseWorkerEnv({
        ...base,
        ENVIRONMENT: "dev",
        MOLLIE_API_URL: "http://localhost:4020",
      }).MOLLIE_API_URL
    ).toBe("http://localhost:4020");
  });

  test("the R2 tokens come as a pair, with the account id and the bucket", () => {
    const r2 = {
      MEDIA_BUCKET: "smog-staging-media",
      R2_ACCESS_KEY_ID: "key-id",
      R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
      R2_SECRET_ACCESS_KEY: "key-secret",
    };
    const env = parseWorkerEnv({ ...base, ENVIRONMENT: "staging", ...r2 });
    expect(env.R2_ACCESS_KEY_ID).toBe("key-id");
    for (const missing of Object.keys(r2)) {
      expect(() =>
        parseWorkerEnv({
          ...base,
          ENVIRONMENT: "staging",
          ...r2,
          [missing]: "",
        })
      ).toThrow(missing);
    }
  });

  test("RENDER_MODE is one of the three modes", () => {
    expect(
      parseWorkerEnv({ ...base, ENVIRONMENT: "dev", RENDER_MODE: "fake" })
        .RENDER_MODE
    ).toBe("fake");
    expect(() =>
      parseWorkerEnv({ ...base, ENVIRONMENT: "dev", RENDER_MODE: "docker" })
    ).toThrow("RENDER_MODE");
  });
});

describe("the phase 7 render settings (ruling 11)", () => {
  const base = {
    BETTER_AUTH_SECRET: "x".repeat(32),
    EMAIL_FROM: "SMOG <no-reply@example.com>",
    EMAIL_REPLY_TO: "info@smog.vlaanderen",
    SITE_URL: "https://smog.test",
    TURNSTILE_SECRET_KEY: "turnstile",
  };

  test("RENDER_LOCAL_URL is unset by default and dev may set it", () => {
    expect(RENDER_LOCAL_DEFAULT_URL).toBe("http://127.0.0.1:3002");
    expect(
      parseWorkerEnv({ ...base, ENVIRONMENT: "dev" }).RENDER_LOCAL_URL
    ).toBeUndefined();
    expect(
      parseWorkerEnv({ ...base, ENVIRONMENT: "staging", RENDER_LOCAL_URL: "" })
        .RENDER_LOCAL_URL
    ).toBeUndefined();
    expect(
      parseWorkerEnv({
        ...base,
        ENVIRONMENT: "dev",
        RENDER_LOCAL_URL: "http://127.0.0.1:3003",
      }).RENDER_LOCAL_URL
    ).toBe("http://127.0.0.1:3003");
    expect(() =>
      parseWorkerEnv({
        ...base,
        ENVIRONMENT: "dev",
        RENDER_LOCAL_URL: "not a url",
      })
    ).toThrow("RENDER_LOCAL_URL");
    for (const RENDER_LOCAL_URL of [
      "ftp://127.0.0.1:3002",
      "file:///tmp/render",
      "javascript:alert(1)",
    ]) {
      expect(() =>
        parseWorkerEnv({ ...base, ENVIRONMENT: "dev", RENDER_LOCAL_URL })
      ).toThrow("RENDER_LOCAL_URL");
    }
  });

  test("RENDER_LOCAL_URL and RENDER_MODE=local are refused outside dev", () => {
    for (const ENVIRONMENT of ["staging", "production"]) {
      expect(() =>
        parseWorkerEnv({
          ...base,
          ENVIRONMENT,
          RENDER_LOCAL_URL: RENDER_LOCAL_DEFAULT_URL,
        })
      ).toThrow("RENDER_LOCAL_URL");
      expect(() =>
        parseWorkerEnv({ ...base, ENVIRONMENT, RENDER_MODE: "local" })
      ).toThrow("RENDER_MODE");
      for (const RENDER_MODE of ["fake", "container"] as const) {
        expect(
          parseWorkerEnv({ ...base, ENVIRONMENT, RENDER_MODE }).RENDER_MODE
        ).toBe(RENDER_MODE);
      }
    }
    expect(
      parseWorkerEnv({ ...base, ENVIRONMENT: "dev", RENDER_MODE: "local" })
        .RENDER_MODE
    ).toBe("local");
  });

  test("REMOTION_LICENSE_KEY is an optional secret (ruling 14)", () => {
    expect(
      parseWorkerEnv({
        ...base,
        ENVIRONMENT: "production",
        REMOTION_LICENSE_KEY: "",
      }).REMOTION_LICENSE_KEY
    ).toBeUndefined();
    expect(
      parseWorkerEnv({
        ...base,
        ENVIRONMENT: "production",
        REMOTION_LICENSE_KEY: "rm_key",
      }).REMOTION_LICENSE_KEY
    ).toBe("rm_key");
    expect(Object.keys(workerSecretsSchema.shape)).toContain(
      "REMOTION_LICENSE_KEY"
    );
  });
});

describe("requiredWorkerConfig (ruling 11)", () => {
  const MUX_TRIO = [
    "MUX_TOKEN_ID",
    "MUX_TOKEN_SECRET",
    "MUX_WEBHOOK_SECRET",
  ] as const;

  test("an env whose mode is container needs the Mux trio", () => {
    expect(requiredWorkerConfig("staging", "container")).toEqual({
      secrets: ["BETTER_AUTH_SECRET", "TURNSTILE_SECRET_KEY", ...MUX_TRIO],
      vars: [],
    });
    expect(requiredWorkerConfig("staging", "fake")).toEqual({
      secrets: ["BETTER_AUTH_SECRET", "TURNSTILE_SECRET_KEY"],
      vars: [],
    });
    expect(requiredWorkerConfig("dev", "container").secrets).toEqual(MUX_TRIO);
    expect(requiredWorkerConfig("dev", "local").secrets).toEqual([]);
  });

  test("production already lists the trio and gains no duplicate", () => {
    expect(requiredWorkerConfig("production", "container")).toEqual(
      REQUIRED_WORKER_CONFIG.production
    );
    const { secrets } = requiredWorkerConfig("production", "container");
    expect(new Set(secrets).size).toBe(secrets.length);
  });

  test("REQUIRED_WORKER_CONFIG is the view at each env's file mode", () => {
    expect(REQUIRED_WORKER_CONFIG).toEqual({
      dev: requiredWorkerConfig("dev", "fake"),
      production: requiredWorkerConfig("production", "container"),
      staging: requiredWorkerConfig("staging", "fake"),
    });
  });
});

describe("REQUIRED_WORKER_CONFIG (ruling 12)", () => {
  test("lists what a production and a staging deploy need", () => {
    expect(REQUIRED_WORKER_CONFIG.production).toEqual({
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
    });
    expect(REQUIRED_WORKER_CONFIG.staging).toEqual({
      secrets: ["BETTER_AUTH_SECRET", "TURNSTILE_SECRET_KEY"],
      vars: [],
    });
    expect(REQUIRED_WORKER_CONFIG.dev).toEqual({ secrets: [], vars: [] });
  });

  test("names only keys of the schemas, each in the right one", () => {
    for (const env of ENVIRONMENTS) {
      for (const key of REQUIRED_WORKER_CONFIG[env].secrets) {
        expect(Object.keys(workerSecretsSchema.shape)).toContain(key);
      }
      for (const key of REQUIRED_WORKER_CONFIG[env].vars) {
        expect(Object.keys(workerVarsSchema.shape)).toContain(key);
      }
    }
    expect(workerEnvSchema).toBeDefined();
  });
});

const ALL_BINDINGS = /EMAIL_QUEUE[\s\S]*EVENTS_QUEUE[\s\S]*MEDIA/;
const QUEUE_AND_BUCKET = /EMAIL_QUEUE[\s\S]*MEDIA/;

describe("parseWorkerBindings (Phase 6 fix wave, jobs M-4)", () => {
  const queue = { send: () => Promise.resolve() };
  const bucket = {
    delete: () => Promise.resolve(),
    get: () => Promise.resolve(null),
    head: () => Promise.resolve(null),
    list: () => Promise.resolve({ objects: [] }),
    put: () => Promise.resolve(null),
  };

  test("answers the queue and R2 bindings as given", () => {
    const env = { EMAIL_QUEUE: queue, EVENTS_QUEUE: queue, MEDIA: bucket };
    const bindings = parseWorkerBindings(env);
    expect(bindings.EMAIL_QUEUE).toBe(queue);
    expect(bindings.EVENTS_QUEUE).toBe(queue);
    expect(bindings.MEDIA).toBe(bucket);
    expect(WORKER_BINDINGS).toEqual(["EMAIL_QUEUE", "EVENTS_QUEUE", "MEDIA"]);
  });

  test("the two render bindings are optional (phase 7 ruling 11)", () => {
    const env = { EMAIL_QUEUE: queue, EVENTS_QUEUE: queue, MEDIA: bucket };
    const without = parseWorkerBindings(env);
    expect(without.RENDER_WORKFLOW).toBeUndefined();
    expect(without.RENDERER).toBeUndefined();
    const workflow = {
      create: () => Promise.resolve({}),
      createBatch: () => Promise.resolve([]),
      get: () => Promise.resolve({}),
    };
    const renderer = {
      get: () => ({}),
      getByName: () => ({}),
      idFromName: () => ({}),
    };
    const withBoth = parseWorkerBindings({
      ...env,
      RENDER_WORKFLOW: workflow,
      RENDERER: renderer,
    });
    expect(withBoth.RENDER_WORKFLOW).toBe(workflow);
    expect(withBoth.RENDERER).toBe(renderer);
  });

  test("a render binding that is present must have the right shape", () => {
    const env = { EMAIL_QUEUE: queue, EVENTS_QUEUE: queue, MEDIA: bucket };
    expect(() => parseWorkerBindings({ ...env, RENDER_WORKFLOW: {} })).toThrow(
      "RENDER_WORKFLOW"
    );
    expect(() => parseWorkerBindings({ ...env, RENDERER: queue })).toThrow(
      "RENDERER"
    );
  });

  test("names every missing or malformed binding", () => {
    expect(() => parseWorkerBindings({})).toThrow(ALL_BINDINGS);
    expect(() =>
      parseWorkerBindings({ EMAIL_QUEUE: {}, EVENTS_QUEUE: queue, MEDIA: {} })
    ).toThrow(QUEUE_AND_BUCKET);
  });
});
