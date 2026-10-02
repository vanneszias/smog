/**
 * The real deps, as `@smog/api` wires them, so these tests run the exact
 * code production composes. A feature may not depend on another feature's
 * `./server`, and `@smog/api` (the composition root) has no D1 in its
 * tests, so this test-only file reaches it by relative path (the account
 * tests do the same; docs/DECISIONS.md, Account).
 */
import { bumpCatalogVersion } from "../../gestures/src/server/catalog-cache";
import type { AdminDeps } from "../src/server";
import { testMux } from "./mux-fake";

export const adminDeps: AdminDeps = {
  bumpCatalogVersion,
  // Production leaves it unset (the Worker's fetch, to MUX_API_URL).
  muxFetch: testMux.fetch,
};
