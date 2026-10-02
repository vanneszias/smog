import type { APIRequestContext } from "@playwright/test";
import { ORIGIN } from "./helpers";

/*
 * Maintenance helpers for the e2e (no `expect`, so `globalSetup` can use
 * them too). Maintenance is one site-wide KV flag on the shared dev
 * server: only the `maintenance` project (`admin-settings.spec.ts`, one
 * worker, after every other spec) turns it on, and `globalSetup` turns it
 * off before a run.
 */

/** The dev seed's admin (packages/db/seed/dev.sql); a dev-only password. */
const SEED_ADMIN = {
  email: "admin@smog.test",
  password: "smog-dev-admin",
} as const;

/**
 * The gate's 30 s isolate cache plus slack for the dev server (KV itself
 * is local here, so there is no cross-region delay).
 */
export const PROPAGATION_MS = 45_000;

const POLL_MS = 500;
const SAME_ORIGIN = { origin: ORIGIN };

async function ok(
  run: Promise<{ ok: () => boolean; status: () => number }>,
  what: string
): Promise<void> {
  const response = await run;
  if (!response.ok()) {
    throw new Error(`[e2e] ${what} answered ${response.status()}`);
  }
}

export async function signInAsAdmin(request: APIRequestContext): Promise<void> {
  await ok(
    request.post("/api/auth/sign-in/email", {
      data: SEED_ADMIN,
      headers: SAME_ORIGIN,
    }),
    "The admin sign-in"
  );
}

/** A bypass cookie for the current version, in `request`'s cookie jar. */
export async function getBypass(request: APIRequestContext): Promise<void> {
  await ok(
    request.post("/api/maintenance/bypass", { headers: SAME_ORIGIN }),
    "The bypass request"
  );
}

/**
 * Turns maintenance off as a signed-in admin (a bypass cookie first, in
 * case it is on), then gets a cookie for the new version, so this request
 * context passes even while an isolate still caches the window.
 */
export async function maintenanceOff(
  request: APIRequestContext
): Promise<void> {
  await getBypass(request);
  await ok(
    request.post("/api/rpc/admin/maintenance/set", {
      data: { json: { enabled: false } },
      headers: SAME_ORIGIN,
    }),
    "Turning maintenance off"
  );
  await getBypass(request);
}

export async function statusOf(
  request: APIRequestContext,
  path: string
): Promise<number> {
  const response = await request.get(path, { maxRedirects: 0 });
  const status = response.status();
  await response.dispose();
  return status;
}

/** Waits until `path` answers `status` for `request` (the isolate cache). */
export async function waitForStatus(
  request: APIRequestContext,
  path: string,
  status: number,
  timeoutMs: number = PROPAGATION_MS
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = await statusOf(request, path);
  while (last !== status) {
    if (Date.now() > deadline) {
      throw new Error(`[e2e] ${path} still answers ${last}, not ${status}`);
    }
    // biome-ignore lint/performance/noAwaitInLoops: polling, one request at a time.
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    last = await statusOf(request, path);
  }
}
