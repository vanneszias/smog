import { env } from "cloudflare:workers";
import { createDb } from "@smog/db/client";
import { makeCategory, makeGesture, makeUser } from "@smog/db/testing";
import { DAY_MS } from "@smog/utils";
import { describe, expect, it } from "vitest";
import type { Dashboard } from "../src/schema";
import { getDashboard } from "../src/server/dashboard";
import { callAs, signedUp, testDb } from "./helpers";

/**
 * A D1 binding that counts round trips: each `batch()` and each statement
 * run on its own. Statements handed to `batch` are unwrapped first (D1
 * needs its own objects).
 */
function countingD1(d1: D1Database) {
  const counter = { roundTrips: 0 };
  const originals = new WeakMap<object, D1PreparedStatement>();
  const RUNS = new Set(["all", "first", "raw", "run"]);
  const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
    const proxy = new Proxy(statement, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver);
        if (key === "bind") {
          return (...args: unknown[]) => wrap(target.bind(...args));
        }
        if (typeof key === "string" && RUNS.has(key)) {
          return (...args: unknown[]) => {
            counter.roundTrips += 1;
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    originals.set(proxy, statement);
    return proxy;
  };
  const proxy = new Proxy(d1, {
    get(target, key, receiver) {
      if (key === "prepare") {
        return (query: string) => wrap(target.prepare(query));
      }
      if (key === "batch") {
        return (statements: D1PreparedStatement[]) => {
          counter.roundTrips += 1;
          return target.batch(
            statements.map((statement) => originals.get(statement) ?? statement)
          );
        };
      }
      const value = Reflect.get(target, key, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { counter, d1: proxy };
}

async function direct(sql: string, ...params: unknown[]): Promise<number> {
  const row = await env.DB.prepare(sql)
    .bind(...params)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

describe("admin.dashboard", () => {
  it("counts the catalogue and the users on a seeded db", async () => {
    const admin = await signedUp("admin");
    const db = testDb();
    const before = await callAs<Dashboard>(admin, "dashboard");

    await makeGesture(db);
    await makeGesture(db);
    await makeGesture(db, { publishedAt: null });
    await makeCategory(db);
    await makeCategory(db, { publishedAt: null });
    await makeUser(db, { role: "admin" });
    await makeUser(db, { banned: true });
    // An expired ban no longer counts.
    await makeUser(db, {
      banExpires: new Date(Date.now() - 1000),
      banned: true,
    });
    await makeUser(db, { createdAt: new Date(Date.now() - 31 * DAY_MS) });

    const after = await callAs<Dashboard>(admin, "dashboard");
    expect(after.gestures.total - before.gestures.total).toBe(3);
    expect(after.gestures.published - before.gestures.published).toBe(2);
    expect(after.gestures.unpublished - before.gestures.unpublished).toBe(1);
    expect(after.categories.total - before.categories.total).toBe(2);
    expect(after.categories.published - before.categories.published).toBe(1);
    expect(after.users.total - before.users.total).toBe(4);
    expect(after.users.admins - before.users.admins).toBe(1);
    expect(after.users.banned - before.users.banned).toBe(1);
    // Three of the four new accounts were created within 30 days.
    expect(after.users.last30Days - before.users.last30Days).toBe(3);

    // And the absolute numbers are what D1 holds.
    expect(after.gestures.total).toBe(
      await direct("SELECT count(*) AS n FROM gesture")
    );
    expect(after.users.admins).toBe(
      await direct("SELECT count(*) AS n FROM user WHERE role = 'admin'")
    );
    expect(after.categories.published).toBe(
      await direct(
        "SELECT count(*) AS n FROM category WHERE published_at IS NOT NULL"
      )
    );
  });

  it("shows the five newest audit entries, with their actors", async () => {
    const admin = await signedUp("admin");
    const now = Date.now() + 60_000;
    const prefix = crypto.randomUUID();
    await env.DB.batch(
      [0, 1, 2, 3, 4, 5].map((index) =>
        env.DB.prepare(
          "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, data, created_at) VALUES (?, ?, 'legacy', 'gesture', ?, ?, ?)"
        ).bind(
          `${prefix}-${index}`,
          admin.user.id,
          `g-${index}`,
          JSON.stringify({ legacy: index }),
          now + index
        )
      )
    );
    const { recentAudit } = await callAs<Dashboard>(admin, "dashboard");
    expect(recentAudit.map((entry) => entry.id)).toEqual(
      [5, 4, 3, 2, 1].map((index) => `${prefix}-${index}`)
    );
    expect(recentAudit[0]).toMatchObject({
      actor: { id: admin.user.id, name: admin.user.name },
      data: { legacy: 5 },
    });
  });

  it("is one D1 round trip", async () => {
    const { counter, d1 } = countingD1(env.DB);
    const dashboard = await getDashboard(createDb(d1));
    expect(dashboard.gestures.total).toBeGreaterThanOrEqual(0);
    expect(counter.roundTrips).toBe(1);
  });
});
