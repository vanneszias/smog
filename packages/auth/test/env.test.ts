import { describe, expect, it } from "vitest";
import { DEV_BETTER_AUTH_SECRET, parseAuthEnv } from "../src/env";

const base = {
  EMAIL_FROM: "SMOG & Co <noreply@smog.vlaanderen>",
  EMAIL_REPLY_TO: "info@smog.vlaanderen",
  SITE_URL: "https://smog.test",
};

describe("parseAuthEnv", () => {
  it("accepts the public dev secret in dev only (M6)", () => {
    expect(
      parseAuthEnv({
        ...base,
        BETTER_AUTH_SECRET: DEV_BETTER_AUTH_SECRET,
        ENVIRONMENT: "dev",
      }).BETTER_AUTH_SECRET
    ).toBe(DEV_BETTER_AUTH_SECRET);
    for (const ENVIRONMENT of ["staging", "production"]) {
      expect(() =>
        parseAuthEnv({
          ...base,
          BETTER_AUTH_SECRET: DEV_BETTER_AUTH_SECRET,
          ENVIRONMENT,
        })
      ).toThrow("BETTER_AUTH_SECRET");
    }
  });
});
