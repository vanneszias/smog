import { env, exports } from "cloudflare:workers";
import {
  MAINTENANCE_KV_KEY,
  type MaintenanceSetting,
} from "@smog/admin/schema";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  BYPASS_COOKIE,
  bypassCookieStatus,
  clearMaintenanceCache,
  signBypassCookie,
} from "../src/worker/maintenance";
import { ORIGIN, signedUp } from "./helpers";

/*
 * The admin toggle end to end through the Worker (ruling 9): the bypass
 * cookie first, then `admin.maintenance.set` over `/api/rpc`; turning it
 * off starts a new `bypassVersion`, so the old cookie stops working when
 * maintenance comes back. `bypassCookieStatus` backs the settings page's
 * bypass card (the cookie is HttpOnly).
 */

const SECRET = "site-test-secret-at-least-32-characters";
const HOUR_S = 3600;
const kv = env.KV as KVNamespace;
const nowS = (): number => Math.floor(Date.now() / 1000);

function ip(): string {
  return `198.51.100.${Math.floor(Math.random() * 250) + 1}-${crypto.randomUUID()}`;
}

function fetchSite(path: string, init?: RequestInit): Promise<Response> {
  return exports.default.fetch(`${ORIGIN}${path}`, init);
}

async function status(path: string, cookie?: string): Promise<number> {
  const response = await fetchSite(path, {
    headers: cookie ? { cookie } : {},
  });
  await response.body?.cancel();
  return response.status;
}

let admin = "";

beforeAll(async () => {
  const signed = await signedUp({ password: "correct horse battery" });
  await (env.DB as D1Database)
    .prepare("UPDATE user SET role = 'admin' WHERE email = ?")
    .bind(signed.email)
    .run();
  admin = signed.cookie;
});

afterEach(async () => {
  await kv.delete(MAINTENANCE_KV_KEY);
  clearMaintenanceCache();
});

async function bypassCookie(session: string): Promise<string> {
  const response = await fetchSite("/api/maintenance/bypass", {
    headers: { "cf-connecting-ip": ip(), cookie: session, origin: ORIGIN },
    method: "POST",
  });
  expect(response.status).toBe(200);
  return response.headers.getSetCookie()[0]?.split(";")[0] ?? "";
}

async function setMaintenance(
  cookie: string,
  input: { enabled: boolean; message?: string }
): Promise<Response> {
  const response = await fetchSite("/api/rpc/admin/maintenance/set", {
    body: JSON.stringify({ json: input }),
    headers: {
      "content-type": "application/json",
      cookie,
      origin: ORIGIN,
    },
    method: "POST",
  });
  // The gate's 30 s isolate cache is the other isolates' delay; here it
  // would hide the change from this test's next guest request.
  clearMaintenanceCache();
  return response;
}

describe("the admin maintenance toggle through the Worker", () => {
  it("enable keeps the admin in; disable revokes the cookie for the next window", async () => {
    const mx = await bypassCookie(admin);
    const both = `${admin}; ${mx}`;
    expect((await setMaintenance(both, { enabled: true })).status).toBe(200);
    expect(await status("/")).toBe(503);
    expect(await status("/admin", both)).toBe(200);
    // The bypass endpoint and health stay reachable during the window.
    expect(await status("/api/health")).toBe(200);
    expect((await bypassCookie(admin)).startsWith(`${BYPASS_COOKIE}=`)).toBe(
      true
    );

    expect((await setMaintenance(both, { enabled: false })).status).toBe(200);
    expect(await status("/")).toBe(200);
    const stored = JSON.parse(
      (await kv.get(MAINTENANCE_KV_KEY)) ?? "null"
    ) as MaintenanceSetting;
    expect(stored.enabled).toBe(false);

    // A new window (from the CLI, say): the old cookie no longer bypasses.
    await kv.put(
      MAINTENANCE_KV_KEY,
      JSON.stringify({ ...stored, enabled: true })
    );
    clearMaintenanceCache();
    expect(await status("/", both)).toBe(503);
  });

  it("answers an invalid input with VALIDATION over HTTP", async () => {
    const response = await setMaintenance(
      `${admin}; ${await bypassCookie(admin)}`,
      {
        enabled: false,
        message: "only with enabled",
      }
    );
    expect(response.status).toBe(422);
    const body = (await response.json()) as { json: { code: string } };
    expect(body.json.code).toBe("VALIDATION");
  });
});

describe("bypassCookieStatus", () => {
  it("is inactive without a cookie, or with a foreign, expired or old one", async () => {
    await kv.put(
      MAINTENANCE_KV_KEY,
      JSON.stringify({ bypassVersion: 5, enabled: true })
    );
    expect(await bypassCookieStatus(undefined)).toEqual({ active: false });
    expect(await bypassCookieStatus("garbage")).toEqual({ active: false });
    expect(
      await bypassCookieStatus(
        await signBypassCookie(SECRET, 5, nowS() - 13 * HOUR_S)
      )
    ).toEqual({ active: false });
    expect(
      await bypassCookieStatus(await signBypassCookie(SECRET, 4, nowS()))
    ).toEqual({ active: false });
  });

  it("is active with the expiry for a cookie of the current version (read fresh)", async () => {
    await kv.put(
      MAINTENANCE_KV_KEY,
      JSON.stringify({ bypassVersion: 5, enabled: false })
    );
    const signedAt = nowS();
    const value = await signBypassCookie(SECRET, 5, signedAt);
    expect(await bypassCookieStatus(value)).toEqual({
      active: true,
      expiresAt: new Date((signedAt + 12 * HOUR_S) * 1000).toISOString(),
    });
  });

  it("reads a missing setting as the first version", async () => {
    const value = await signBypassCookie(SECRET, 0, nowS());
    expect((await bypassCookieStatus(value)).active).toBe(true);
  });
});
