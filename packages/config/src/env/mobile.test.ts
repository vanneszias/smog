import { describe, expect, test } from "bun:test";
import { parseMobileEnv } from "./mobile";

describe("parseMobileEnv", () => {
  test("accepts a valid env", () => {
    const env = parseMobileEnv({
      EXPO_PUBLIC_API_URL: "http://localhost:5173",
      EXPO_PUBLIC_ENVIRONMENT: "dev",
      EXPO_PUBLIC_SITE_HOST: "localhost",
    });

    expect(env.EXPO_PUBLIC_SITE_HOST).toBe("localhost");
  });

  test("OpenPanel: a default API URL, optional (empty = unset) credentials", () => {
    const env = parseMobileEnv({
      EXPO_PUBLIC_API_URL: "http://localhost:5173",
      EXPO_PUBLIC_ENVIRONMENT: "dev",
      EXPO_PUBLIC_OPENPANEL_CLIENT_ID: "id",
      EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET: "",
      EXPO_PUBLIC_SITE_HOST: "localhost",
    });
    expect(env.EXPO_PUBLIC_OPENPANEL_API_URL).toBe(
      "https://analytics.zias.be/api"
    );
    expect(env.EXPO_PUBLIC_OPENPANEL_CLIENT_ID).toBe("id");
    expect(env.EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET).toBeUndefined();
  });

  test("rejects a URL as site host", () => {
    expect(() =>
      parseMobileEnv({
        EXPO_PUBLIC_API_URL: "http://localhost:5173",
        EXPO_PUBLIC_ENVIRONMENT: "dev",
        EXPO_PUBLIC_SITE_HOST: "https://smog.vlaanderen",
      })
    ).toThrow("EXPO_PUBLIC_SITE_HOST");
  });
});
