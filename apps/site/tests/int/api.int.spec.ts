// @vitest-environment node
import type { Payload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";

let payload: Payload;

// Runs only when PAYLOAD_SECRET is set. vitest.setup.ts loads dotenv/config,
// so a local .env or an exported secret in CI lights this suite up on its own
// — there is no manual unskip step and no owner to remember one.
//
// It does NOT need a provisioned remote D1 database: payload.config.ts's
// getCloudflareContextFromWrangler() emulates D1 locally when not running in
// production, ignoring the placeholder `database_id: "DATABASE_ID"` in
// wrangler.jsonc.
//
// The original reason recorded here (before this comment was corrected) was
// An earlier version of this comment blamed D1. That was wrong: the failure
// was jsdom's TextEncoder realm
// invariant, which broke wrangler's bundled esbuild during Payload's boot;
// jsdom is Vitest's default test environment for this project, but this file
// no longer uses it, having opted into "node" via the directive above, which
// fixes that specific crash.
//
// The config import stays dynamic (rather than static) so that a skipped
// beforeAll never evaluates payload.config.ts's module-level requireEnv and
// Cloudflare/wrangler bootstrapping — a static import would run both during
// test collection regardless of describe.skip and fail there instead.
describe.skipIf(!process.env.PAYLOAD_SECRET)("API", () => {
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
