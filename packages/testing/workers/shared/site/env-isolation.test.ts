import { env } from "cloudflare:workers";
import { workerSecretsSchema } from "@smog/config/env/worker";
import { describe, expect, it } from "vitest";
import { MUX_WEBHOOK_TEST_SECRET } from "./mux-secret";

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

  it("has every secret off, except the test auth and Mux webhook secrets", () => {
    const pinned: Record<string, string> = {
      BETTER_AUTH_SECRET: "site-test-secret-at-least-32-characters",
      MUX_WEBHOOK_SECRET: MUX_WEBHOOK_TEST_SECRET,
    };
    for (const key of Object.keys(workerSecretsSchema.shape)) {
      expect(bindings[key], key).toBe(pinned[key] ?? "");
    }
  });
});
