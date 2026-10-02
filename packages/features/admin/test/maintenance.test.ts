import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import { createDb } from "@smog/db/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  BYPASS_VERSION_INITIAL,
  MAINTENANCE_KV_KEY,
  MAINTENANCE_MESSAGE_MAX,
  type MaintenanceSetting,
  maintenanceSetInputSchema,
  nextBypassVersion,
  parseMaintenanceSetting,
} from "../src/schema";
import {
  type Authed,
  auditMark,
  auditRowsSince,
  callAs,
  contextAs,
  expectAudit,
  procedureAt,
  signedUp,
} from "./helpers";

/*
 * `admin.maintenance.*` over the test KV and D1 (ruling 9): `set` writes
 * the KV setting first and then its audit entry (ruling 5, external
 * order), disabling starts a new `bypassVersion` (every bypass cookie of
 * the window dies), and asking for the stored state changes nothing.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 9, 2, 12, 0, 0);
const NOW_S = NOW / 1000;
const AUDIT_INSERT = /insert into "audit_log"/i;

let admin: Authed;

beforeAll(async () => {
  admin = await signedUp("admin");
});

afterEach(async () => {
  await env.KV.delete(MAINTENANCE_KV_KEY);
  vi.restoreAllMocks();
});

async function stored(): Promise<MaintenanceSetting | null> {
  return parseMaintenanceSetting(await env.KV.get(MAINTENANCE_KV_KEY));
}

async function store(setting: MaintenanceSetting): Promise<void> {
  await env.KV.put(MAINTENANCE_KV_KEY, JSON.stringify(setting));
}

function set(input: unknown): Promise<MaintenanceSetting> {
  return callAs<MaintenanceSetting>(admin, "maintenance.set", input);
}

async function failure(run: Promise<unknown>): Promise<{ code: string }> {
  try {
    await run;
  } catch (error) {
    return error as { code: string };
  }
  throw new Error("[test] expected the call to fail");
}

describe("the maintenance setting (schema)", () => {
  it("parses the KV value, and reads a malformed one as missing", () => {
    expect(
      parseMaintenanceSetting(
        JSON.stringify({ bypassVersion: 3, enabled: true, message: "x" })
      )
    ).toEqual({ bypassVersion: 3, enabled: true, message: "x" });
    expect(parseMaintenanceSetting(null)).toBeNull();
    expect(parseMaintenanceSetting("{nope")).toBeNull();
    expect(
      parseMaintenanceSetting(JSON.stringify({ enabled: "yes" }))
    ).toBeNull();
    expect(
      parseMaintenanceSetting(
        JSON.stringify({ bypassVersion: 1.5, enabled: true })
      )
    ).toBeNull();
    expect(
      parseMaintenanceSetting(
        JSON.stringify({ bypassVersion: 1, enabled: true, until: "later" })
      )
    ).toBeNull();
  });

  it("on keeps the version (cookies fetched before still work); off starts a new one", () => {
    expect(nextBypassVersion(true, 1234, NOW)).toBe(1234);
    // No key yet: the version the bypass endpoint signs with then.
    expect(nextBypassVersion(true, null, NOW)).toBe(BYPASS_VERSION_INITIAL);
    expect(nextBypassVersion(false, 1234, NOW)).toBe(NOW_S);
    // Always greater, even within the same second or with a clock behind.
    expect(nextBypassVersion(false, NOW_S, NOW)).toBe(NOW_S + 1);
    expect(nextBypassVersion(false, NOW_S + 50, NOW)).toBe(NOW_S + 51);
    expect(nextBypassVersion(false, null, NOW)).toBe(NOW_S);
  });

  it("takes a message of at most 280 characters, trimmed", () => {
    expect(
      maintenanceSetInputSchema.parse({ enabled: true, message: "  Update " })
    ).toEqual({ enabled: true, message: "Update" });
    expect(
      maintenanceSetInputSchema.safeParse({
        enabled: true,
        message: "x".repeat(MAINTENANCE_MESSAGE_MAX + 1),
      }).success
    ).toBe(false);
    expect(
      maintenanceSetInputSchema.safeParse({ enabled: true, message: "  " })
        .success
    ).toBe(false);
  });

  it("takes an `until` in the future and at most 7 days ahead", () => {
    const at = (ms: number) => new Date(Date.now() + ms).toISOString();
    const valid = (until: string) =>
      maintenanceSetInputSchema.safeParse({ enabled: true, until }).success;
    expect(valid(at(HOUR))).toBe(true);
    expect(valid(at(7 * DAY - HOUR))).toBe(true);
    expect(valid(at(-HOUR))).toBe(false);
    expect(valid(at(7 * DAY + HOUR))).toBe(false);
    expect(valid("tomorrow")).toBe(false);
  });

  it("takes a message and an end only when enabling", () => {
    expect(
      maintenanceSetInputSchema.safeParse({ enabled: false, message: "x" })
        .success
    ).toBe(false);
    expect(
      maintenanceSetInputSchema.safeParse({
        enabled: false,
        until: new Date(Date.now() + HOUR).toISOString(),
      }).success
    ).toBe(false);
  });
});

describe("admin.maintenance.get", () => {
  it("is off with the first version when nothing is stored", async () => {
    await expect(callAs(admin, "maintenance.get")).resolves.toEqual({
      bypassVersion: BYPASS_VERSION_INITIAL,
      enabled: false,
    });
  });

  it("reads KV without a cache, so it shows a write at once", async () => {
    await store({ bypassVersion: 7, enabled: true, message: "Een" });
    await expect(callAs(admin, "maintenance.get")).resolves.toEqual({
      bypassVersion: 7,
      enabled: true,
      message: "Een",
    });
    await store({ bypassVersion: 8, enabled: false });
    await expect(callAs(admin, "maintenance.get")).resolves.toEqual({
      bypassVersion: 8,
      enabled: false,
    });
  });

  it("reads a malformed value as off (as the site does)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {
      // Logged; asserted by the site's gate tests.
    });
    await env.KV.put(MAINTENANCE_KV_KEY, "{broken");
    await expect(callAs(admin, "maintenance.get")).resolves.toMatchObject({
      enabled: false,
    });
  });
});

describe("admin.maintenance.set", () => {
  it("enables: writes KV, keeps the version, then writes maintenance.enable", async () => {
    await store({ bypassVersion: 41, enabled: false });
    const until = new Date(Date.now() + 2 * HOUR).toISOString();
    const mark = await auditMark();
    const result = await set({ enabled: true, message: "Update", until });
    const expected = {
      bypassVersion: 41,
      enabled: true,
      message: "Update",
      until,
    };
    expect(result).toEqual(expected);
    expect(await stored()).toEqual(expected);
    await expectAudit("maintenance.set", {
      action: "maintenance.enable",
      actorId: admin.user.id,
      data: { message: "Update", until },
      mark,
      targetId: MAINTENANCE_KV_KEY,
      targetType: "setting",
    });
  });

  it("enables the first window with the version the bypass endpoint signs", async () => {
    await set({ enabled: true });
    expect(await stored()).toEqual({
      bypassVersion: BYPASS_VERSION_INITIAL,
      enabled: true,
    });
  });

  it("disables: a new version (old cookies die), then maintenance.disable with the window's text", async () => {
    const until = new Date(Date.now() + HOUR).toISOString();
    await store({ bypassVersion: 41, enabled: true, message: "Weg", until });
    const mark = await auditMark();
    const result = await set({ enabled: false });
    expect(result.enabled).toBe(false);
    expect(result.bypassVersion).toBeGreaterThan(41);
    expect(await stored()).toEqual({
      bypassVersion: result.bypassVersion,
      enabled: false,
    });
    await expectAudit("maintenance.set", {
      action: "maintenance.disable",
      actorId: admin.user.id,
      data: { message: "Weg", until },
      mark,
      targetId: MAINTENANCE_KV_KEY,
      targetType: "setting",
    });
  });

  it("an enable after a disable keeps the disable's version", async () => {
    await set({ enabled: true });
    const off = await set({ enabled: false });
    const on = await set({ enabled: true, message: "Weer" });
    expect(on.bypassVersion).toBe(off.bypassVersion);
  });

  it("changes nothing and writes no entry for the state it already has", async () => {
    await set({ enabled: true, message: "Zelfde" });
    const mark = await auditMark();
    await expect(set({ enabled: true, message: "Zelfde" })).resolves.toEqual({
      bypassVersion: BYPASS_VERSION_INITIAL,
      enabled: true,
      message: "Zelfde",
    });
    await set({ enabled: false });
    const offMark = await auditMark();
    const off = await stored();
    await expect(set({ enabled: false })).resolves.toEqual(off);
    expect(await stored()).toEqual(off);
    expect(await auditRowsSince(offMark)).toEqual([]);
    // Only the real disable in between was audited.
    expect((await auditRowsSince(mark)).map((row) => row.action)).toEqual([
      "maintenance.disable",
    ]);
  });

  it("audits a changed message or end while on as a new enable", async () => {
    await set({ enabled: true, message: "Een" });
    const mark = await auditMark();
    await set({ enabled: true, message: "Twee" });
    await expectAudit("maintenance.set", {
      action: "maintenance.enable",
      actorId: admin.user.id,
      data: { message: "Twee", until: null },
      mark,
      targetId: MAINTENANCE_KV_KEY,
      targetType: "setting",
    });
  });

  // In process an input error is `BAD_REQUEST`; the rpc handler answers it
  // as `VALIDATION` (`@smog/rpc` validation interceptor).
  it("refuses an `until` in the past or over 7 days ahead, writing nothing", async () => {
    const mark = await auditMark();
    for (const until of [
      new Date(Date.now() - HOUR).toISOString(),
      new Date(Date.now() + 8 * DAY).toISOString(),
    ]) {
      // biome-ignore lint/performance/noAwaitInLoops: one refused call at a time.
      expect(await failure(set({ enabled: true, until }))).toMatchObject({
        code: "BAD_REQUEST",
      });
    }
    expect(await stored()).toBeNull();
    expect(await auditRowsSince(mark)).toEqual([]);
  });

  it("logs and rethrows a failed audit write; the KV change stands", async () => {
    const context = await contextAs(admin);
    const failing = new Proxy(env.DB, {
      get(d1, key) {
        if (key === "prepare") {
          return (query: string) => {
            if (AUDIT_INSERT.test(query)) {
              throw new Error("audit_log is down");
            }
            return d1.prepare(query);
          };
        }
        const value: unknown = Reflect.get(d1, key, d1);
        return typeof value === "function" ? value.bind(d1) : value;
      },
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {
      // Asserted below.
    });
    await expect(
      call(
        procedureAt("maintenance.set"),
        { enabled: true },
        {
          context: { ...context, db: createDb(failing) },
          path: ["admin", "maintenance", "set"],
        }
      )
    ).rejects.toThrow();
    expect(await stored()).toMatchObject({ enabled: true });
    expect(
      logged.mock.calls.some(
        ([message]) =>
          typeof message === "string" &&
          message.startsWith(
            `[admin] Failed to write the audit entry maintenance.enable for setting:${MAINTENANCE_KV_KEY}`
          )
      )
    ).toBe(true);
  });
});
