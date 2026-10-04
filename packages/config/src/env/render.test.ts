import { describe, expect, test } from "bun:test";
import { parseRenderServerEnv, renderServerEnvSchema } from "./render";

describe("renderServerEnvSchema (phase 7 ruling 7)", () => {
  test("applies the image's defaults", () => {
    expect(parseRenderServerEnv({})).toEqual({
      PORT: 8080,
      RENDER_ALLOW_HTTP: false,
      RENDER_BUNDLE_DIR: "/app/bundle",
      RENDER_ENVIRONMENT: "production",
      RENDER_TMP_DIR: "/tmp/smog-render",
    });
  });

  test("reads every key, empty optionals as unset", () => {
    const env = parseRenderServerEnv({
      PORT: "3002",
      REMOTION_LICENSE_KEY: "rm_key",
      RENDER_ALLOW_HTTP: "1",
      RENDER_BROWSER_EXECUTABLE: "/opt/chrome/headless_shell",
      RENDER_BUNDLE_DIR: "/work/bundle",
      RENDER_ENVIRONMENT: "dev",
      RENDER_TMP_DIR: "/work/tmp",
    });
    expect(env).toEqual({
      PORT: 3002,
      REMOTION_LICENSE_KEY: "rm_key",
      RENDER_ALLOW_HTTP: true,
      RENDER_BROWSER_EXECUTABLE: "/opt/chrome/headless_shell",
      RENDER_BUNDLE_DIR: "/work/bundle",
      RENDER_ENVIRONMENT: "dev",
      RENDER_TMP_DIR: "/work/tmp",
    });
    const empty = parseRenderServerEnv({
      REMOTION_LICENSE_KEY: "",
      RENDER_ALLOW_HTTP: "",
      RENDER_BROWSER_EXECUTABLE: "",
    });
    expect(empty.REMOTION_LICENSE_KEY).toBeUndefined();
    expect(empty.RENDER_BROWSER_EXECUTABLE).toBeUndefined();
    expect(empty.RENDER_ALLOW_HTTP).toBe(false);
  });

  test("refuses a bad port, a relative directory and an unknown flag value", () => {
    for (const PORT of ["0", "65536", "http", "80.5"]) {
      expect(() => parseRenderServerEnv({ PORT })).toThrow("PORT");
    }
    expect(() => parseRenderServerEnv({ RENDER_TMP_DIR: "tmp" })).toThrow(
      "RENDER_TMP_DIR"
    );
    expect(() =>
      parseRenderServerEnv({ RENDER_BUNDLE_DIR: "./bundle" })
    ).toThrow("RENDER_BUNDLE_DIR");
    expect(() =>
      parseRenderServerEnv({
        RENDER_ALLOW_HTTP: "yes",
        RENDER_ENVIRONMENT: "dev",
      })
    ).toThrow("RENDER_ALLOW_HTTP");
    expect(() =>
      parseRenderServerEnv({ RENDER_ENVIRONMENT: "preview" })
    ).toThrow("RENDER_ENVIRONMENT");
  });

  test("RENDER_ALLOW_HTTP is dev only", () => {
    for (const RENDER_ENVIRONMENT of ["staging", "production"]) {
      expect(() =>
        parseRenderServerEnv({ RENDER_ALLOW_HTTP: "1", RENDER_ENVIRONMENT })
      ).toThrow("RENDER_ALLOW_HTTP");
      expect(
        parseRenderServerEnv({ RENDER_ALLOW_HTTP: "0", RENDER_ENVIRONMENT })
          .RENDER_ALLOW_HTTP
      ).toBe(false);
    }
    // Unset RENDER_ENVIRONMENT is production: the strictest reading.
    expect(() => parseRenderServerEnv({ RENDER_ALLOW_HTTP: "1" })).toThrow(
      "RENDER_ALLOW_HTTP"
    );
    expect(renderServerEnvSchema.safeParse({}).success).toBe(true);
  });
});
