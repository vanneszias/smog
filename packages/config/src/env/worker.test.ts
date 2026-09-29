import { describe, expect, test } from "bun:test";
import { parseWorkerVars } from "./worker";

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
