import { exports } from "cloudflare:workers";
import { beforeAll } from "vitest";

/**
 * The first request in a test file transforms the whole server entry
 * (Start, Better Auth, React Email, the app shell and the kit): ~25 s
 * alone, more while turbo runs every package's tests. It happens here,
 * under the long `hookTimeout`, so `testTimeout` stays short and a hung
 * test still fails fast.
 */
beforeAll(async () => {
  await exports.default.fetch("http://localhost:5173/");
});
