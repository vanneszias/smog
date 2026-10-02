import { describe, expect, test } from "bun:test";
import {
  parseWorkerEnv,
  parseWorkerVars,
  publicAuthConfig,
  workerSecretsSchema,
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
