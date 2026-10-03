/**
 * The real deps, as `@smog/api` wires them, so these tests run the exact
 * code production composes. A feature may not depend on another feature's
 * `./server`, and `@smog/api` (the composition root) has no D1 in its
 * tests, so this test-only file reaches it by relative path (the account
 * tests do the same; docs/DECISIONS.md, Account).
 */
import { adminSponsorshipServices } from "../../../api/src/admin-deps";
import { bumpCatalogVersion } from "../../gestures/src/server/catalog-cache";
import type { AdminDeps } from "../src/server";
import {
  muxWithDeletes,
  recordingQueues,
  testMollie,
} from "./sponsorship-fakes";

export const adminDeps: AdminDeps = {
  bumpCatalogVersion,
  // Production leaves the fetches unset (the Worker's fetch, to
  // MOLLIE_API_URL and MUX_API_URL) and reads the Worker's queues.
  mollieFetch: testMollie.fetch,
  muxFetch: muxWithDeletes,
  queues: recordingQueues,
  sponsorships: adminSponsorshipServices,
};
