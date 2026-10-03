import { describe, expect, test } from "bun:test";
import { AUDIT_TARGET_TYPES } from "@smog/db/enums";
import {
  e2eSeedEnabled,
  e2eSeedSchema,
  seedStatement,
  seedStatements,
} from "./e2e-seed";

const STATUS_UPDATE = /UPDATE\s+sponsorship/i;

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

  test("takes exactly the audit target types the database allows", () => {
    const entry = (targetType: string) =>
      e2eSeedSchema.safeParse({
        data: { legacy: {} },
        id: "e2e-target",
        op: "legacyAuditEntry",
        targetId: "maintenance",
        targetType,
      }).success;
    for (const targetType of AUDIT_TARGET_TYPES) {
      expect(entry(targetType)).toBe(true);
    }
    expect(entry("settings")).toBe(false);
  });

  test("seeds a sponsorship on a gesture, with a hashed token, all bound", () => {
    const { db, seen } = recordingDb();
    const hash = "a".repeat(64);
    const statements = seedStatements(db, {
      displayName: "Bakkerij Jansen",
      endsAt: 1_900_000_000_000,
      gestureSlug: "dankjewel",
      id: "e2e-reedit",
      op: "sponsorship",
      status: "changes_requested",
      token: { expiresAt: 1_800_000_000_000, hash, purpose: "reedit" },
    });
    expect(statements).toHaveLength(3);
    expect(seen.map((entry) => entry.values)).toEqual([
      ["e2e-reedit"],
      [
        "e2e-reedit",
        "e2e-reedit",
        "Bakkerij Jansen",
        "changes_requested",
        1_900_000_000_000,
        "dankjewel",
      ],
      ["e2e-reedit", "e2e-reedit", "reedit", hash, 1_800_000_000_000],
    ]);
    expect(seen.every((entry) => !entry.sql.includes("dankjewel"))).toBe(true);
    // No status is ever updated here: rows are inserted in a state.
    expect(seen.some((entry) => STATUS_UPDATE.test(entry.sql))).toBe(false);
  });

  test("resets the sponsorships of named gestures only, by one bound list", () => {
    const { db, seen } = recordingDb();
    seedStatements(db, {
      op: "resetSponsorships",
      slugs: ["broer", "zus"],
    });
    // The orphaned sponsors go last, without a parameter.
    expect(seen).toHaveLength(2);
    for (const entry of seen) {
      expect(entry.sql).toContain("json_each(?)");
      expect(entry.values).toEqual(['["broer","zus"]']);
    }
    expect(
      e2eSeedSchema.safeParse({ op: "resetSponsorships", slugs: ["x'--"] })
        .success
    ).toBe(false);
    expect(
      e2eSeedSchema.safeParse({
        displayName: "x",
        gestureSlug: "hond",
        id: "not-e2e",
        op: "sponsorship",
        status: "live",
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
