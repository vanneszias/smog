import { describe, expect, test } from "bun:test";
import { AUDIT_TARGET_TYPES } from "@smog/db/enums";
import {
  e2eSeedEnabled,
  e2eSeedSchema,
  seedStatement,
  seedStatements,
} from "./e2e-seed";

const STATUS_UPDATE = /UPDATE\s+sponsorship/i;
const SELECT_ONLY =
  /^SELECT g\.slug, s\.status FROM sponsorship AS s JOIN gesture AS g/;

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

  test("seeds a render_failed sponsorship with its failed first job and its trail, all bound", () => {
    const { db, seen } = recordingDb();
    const statements = seedStatements(db, {
      displayName: "Bakkerij Jansen",
      gestureSlug: "dankjewel",
      id: "e2e-render-failed",
      op: "sponsorship",
      status: "render_failed",
    });
    expect(statements).toHaveLength(4);
    expect(seen[2]?.sql).toContain("INSERT INTO render_job ");
    expect(seen[2]?.sql).toContain("'failed'");
    expect(seen[2]?.values).toEqual([
      "e2e-render-failed-job-1",
      "e2e-render-failed",
      "e2e-render-failed-job-1",
      '{"v":1}',
      "renderer answered 500",
    ]);
    expect(seen[3]?.sql).toContain("'render_started'");
    expect(seen[3]?.sql).toContain("'render_failed'");
    expect(seen[3]?.values).toEqual([
      "e2e-render-failed-job-1-started",
      "e2e-render-failed",
      '{"attempt":1,"renderJobId":"e2e-render-failed-job-1"}',
      "e2e-render-failed-job-1-failed",
      "e2e-render-failed",
      '{"error":"renderer answered 500","renderJobId":"e2e-render-failed-job-1"}',
    ]);
    expect(seen.some((entry) => STATUS_UPDATE.test(entry.sql))).toBe(false);
  });

  test("reads the sponsorship statuses of named gestures, never writing (review I-7)", () => {
    const { db, seen } = recordingDb();
    const statements = seedStatements(db, {
      op: "sponsorshipStatus",
      slugs: ["broer", "zus"],
    });
    expect(statements).toHaveLength(1);
    expect(seen[0]?.sql).toMatch(SELECT_ONLY);
    expect(seen[0]?.values).toEqual(['["broer","zus"]']);
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

  test("seeds a checkout as the money path writes it, all bound (phase 6 task 7)", () => {
    const { db, seen } = recordingDb();
    const statements = seedStatements(db, {
      displayName: "Bakkerij Zon",
      gestureSlugs: ["vogel", "eten"],
      id: "e2e-adm-paid",
      invoice: true,
      logo: true,
      logoKey: "logos/0b5c9c3e-6d1f-4c39-a7d2-2f7e5d1c9a10",
      op: "sponsorshipCheckout",
      paymentStatus: "paid",
      status: "in_review",
      videoPlaybackId: "VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU",
    });
    // The sponsor, the invoice request, the payment, then per gesture the
    // sponsorship, its item and its `created` event.
    expect(statements).toHaveLength(3 + 2 * 3);
    const sql = seen.map((entry) => entry.sql);
    expect(sql[0]).toContain("INSERT INTO sponsor ");
    expect(sql[1]).toContain("INSERT INTO invoice_request");
    expect(sql[2]).toContain("INSERT INTO payment ");
    expect(seen[2]?.values).toContain(12_000);
    expect(seen[2]?.values).toContain("paid");
    expect(sql[3]).toContain("INSERT INTO sponsorship ");
    expect(seen[3]?.values).toEqual(
      expect.arrayContaining([
        "e2e-adm-paid-0",
        "vogel",
        "in_review",
        "logos/0b5c9c3e-6d1f-4c39-a7d2-2f7e5d1c9a10",
        "VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU",
      ])
    );
    expect(sql[4]).toContain("INSERT INTO payment_item");
    expect(seen[4]?.values).toEqual([
      "e2e-adm-paid",
      "e2e-adm-paid-0",
      6000,
      1,
    ]);
    expect(sql[5]).toContain("INSERT INTO sponsorship_event");
    expect(seen[6]?.values).toEqual(
      expect.arrayContaining(["e2e-adm-paid-1", "eten"])
    );
    for (const entry of seen) {
      expect(entry.sql).not.toContain("vogel");
      expect(entry.sql).not.toContain("Bakkerij");
    }
    // Inserted in a state, never updated.
    expect(seen.some((entry) => STATUS_UPDATE.test(entry.sql))).toBe(false);
  });

  test("a checkout seed refuses ids, keys and amounts it does not own", () => {
    const base = {
      displayName: "x",
      gestureSlugs: ["vogel"],
      id: "e2e-adm",
      op: "sponsorshipCheckout",
      paymentStatus: "open",
      status: "awaiting_payment",
    };
    expect(e2eSeedSchema.safeParse(base).success).toBe(true);
    expect(e2eSeedSchema.safeParse({ ...base, id: "real-id" }).success).toBe(
      false
    );
    expect(
      e2eSeedSchema.safeParse({ ...base, logoKey: "../secrets" }).success
    ).toBe(false);
    expect(e2eSeedSchema.safeParse({ ...base, gestureSlugs: [] }).success).toBe(
      false
    );
    expect(
      e2eSeedSchema.safeParse({ ...base, paymentStatus: "bogus" }).success
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
