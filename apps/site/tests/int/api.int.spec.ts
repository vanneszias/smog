// @vitest-environment node
import type { Payload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";

let payload: Payload;

// Skipped: this suite needs a real PAYLOAD_SECRET, which is not set in this
// environment (no .env is committed here, and none is exported for test
// runs). With that secret set, this suite passes outright in the "node"
// environment declared above — it does NOT need a provisioned remote D1
// database: payload.config.ts's getCloudflareContextFromWrangler() emulates
// D1 locally when not running in production, ignoring the placeholder
// `database_id: "DATABASE_ID"` in wrangler.jsonc.
//
// The original reason recorded here (before this comment was corrected) was
// wrong: the failure was never about D1. It was jsdom's TextEncoder realm
// invariant, which broke wrangler's bundled esbuild during Payload's boot;
// jsdom is Vitest's default test environment for this project, but this file
// no longer uses it, having opted into "node" via the directive above, which
// fixes that specific crash. Unskip once a real PAYLOAD_SECRET is available
// wherever this suite runs; it does not depend on Task 3's D1 provisioning.
//
// The config import stays dynamic (rather than static) so that a skipped
// beforeAll never evaluates payload.config.ts's module-level requireEnv and
// Cloudflare/wrangler bootstrapping — a static import would run both during
// test collection regardless of describe.skip and fail there instead.
// biome-ignore lint/suspicious/noSkippedTests: intentionally disabled until a real PAYLOAD_SECRET is available in the test environment (see comment above)
describe.skip("API", () => {
  beforeAll(async () => {
    const { getPayload } = await import("payload");
    const { default: config } = await import("@/payload.config");
    const payloadConfig = await config;
    payload = await getPayload({ config: payloadConfig });
  });

  it("fetches users", async () => {
    const users = await payload.find({
      collection: "users",
    });
    expect(users).toBeDefined();
  });
});
