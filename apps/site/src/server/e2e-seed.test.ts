import { describe, expect, test } from "bun:test";
import { e2eSeedEnabled, e2eSeedSchema, seedStatement } from "./e2e-seed";

/** A D1 stand-in that records the SQL and the bound values. */
function recordingDb() {
  const seen: { sql: string; values: unknown[] }[] = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...values: unknown[]) => {
        seen.push({ sql, values });
        return {};
      },
    }),
  } as unknown as D1Database;
  return { db, seen };
}

describe("the e2e seed endpoint's operations", () => {
  test("runs in dev only", () => {
    expect(e2eSeedEnabled("dev")).toBe(true);
    expect(e2eSeedEnabled("staging")).toBe(false);
    expect(e2eSeedEnabled("production")).toBe(false);
  });

  test("takes only the fixed operations, never SQL", () => {
    expect(
      e2eSeedSchema.safeParse({ op: "sql", sql: "DROP TABLE user" }).success
    ).toBe(false);
    expect(
      e2eSeedSchema.safeParse({
        email: "a@smog.test",
        op: "setRole",
        role: "owner",
      }).success
    ).toBe(false);
    expect(
      e2eSeedSchema.safeParse({
        legacyId: "x'; DROP TABLE gesture; --",
        op: "legacyId",
        slug: "hond",
      }).success
    ).toBe(false);
  });

  test("binds every value", () => {
    const { db, seen } = recordingDb();
    seedStatement(db, {
      email: "a@smog.test",
      op: "setRole",
      role: "admin",
    });
    seedStatement(db, {
      legacyId: "k17abcdef0123",
      op: "legacyId",
      slug: "hond",
    });
    seedStatement(db, {
      data: { legacy: { note: "x" } },
      id: "e2e-long",
      op: "legacyAuditEntry",
      targetId: "gesture-1",
      targetType: "gesture",
    });
    expect(seen.map((entry) => entry.values)).toEqual([
      ["admin", "a@smog.test"],
      ["k17abcdef0123", "hond"],
      ["e2e-long", "gesture", "gesture-1", '{"legacy":{"note":"x"}}'],
    ]);
    expect(seen.every((entry) => !entry.sql.includes("a@smog.test"))).toBe(
      true
    );
  });
});
