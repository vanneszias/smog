import { env } from "cloudflare:workers";
import { workerSecretsSchema } from "@smog/config/env/worker";
import { describe, expect, it } from "vitest";

/*
 * The tests' env is the one vitest.config.ts pins: `env.dev.vars` from
 * wrangler.jsonc, every secret off except the test auth secret. A local
 * `.dev.vars` (or `.env`) must change nothing here (it did: a SITE_URL for
 * another e2e port broke the CSRF and SEO tests).
 */

const bindings = env as unknown as Record<string, unknown>;

describe("the test env", () => {
  it("has the dev vars of wrangler.jsonc", () => {
    expect(bindings.SITE_URL).toBe("http://localhost:5173");
    expect(bindings.ENVIRONMENT).toBe("dev");
  });

  it("has every secret off, except the test auth secret", () => {
    for (const key of Object.keys(workerSecretsSchema.shape)) {
      expect(bindings[key], key).toBe(
        key === "BETTER_AUTH_SECRET"
          ? "site-test-secret-at-least-32-characters"
          : ""
      );
    }
  });
});
