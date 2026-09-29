import { describe, expect, test } from "bun:test";
import { parseWorkerVars, workerSecretsSchema } from "./worker";

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
