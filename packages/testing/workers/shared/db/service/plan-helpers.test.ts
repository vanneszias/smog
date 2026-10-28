import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  explain,
  fullScans,
  recordingD1,
  scanReport,
} from "../../../../support/db/index";

/*
 * The plan helpers themselves (phase 9 task 6): a bare scan is found, an
 * index seek, an ordered index scan, a virtual table and a co-routine are
 * not, and a recorded statement is explained with its own bound values.
 */

const row = (detail: string, parent = 0) => ({ detail, parent });

describe("fullScans", () => {
  it("flags a bare SCAN and a covering-index SCAN", () => {
    expect(
      fullScans([
        row("SCAN sponsorship"),
        row("SCAN payment USING COVERING INDEX payment_status_created_idx"),
      ])
    ).toEqual([
      "SCAN sponsorship",
      "SCAN payment USING COVERING INDEX payment_status_created_idx",
    ]);
  });

  it("lets seeks, ordered index scans, virtual tables and derived tables through", () => {
    expect(
      fullScans([
        row("SEARCH gesture USING INDEX gesture_slug_unique (slug=?)"),
        row("SCAN gesture USING INDEX gesture_published_sort_name_idx"),
        row("SCAN gesture_fts VIRTUAL TABLE INDEX 0:M5"),
        row("SCAN json_each VIRTUAL TABLE INDEX 1:"),
        row("CO-ROUTINE o"),
        row("SCAN o"),
        row("SCAN CONSTANT ROW"),
        row("SCAN (subquery-2)"),
      ])
    ).toEqual([]);
  });
});

describe("an ordered index scan needs a LIMIT", () => {
  const detail = "SCAN gesture USING INDEX gesture_published_sort_name_idx";
  const ordered = [row(detail)];

  it("passes with a LIMIT and fails without one", () => {
    expect(fullScans(ordered)).toEqual([]);
    expect(fullScans(ordered, { limited: false })).toEqual([detail]);
  });

  it("scanReport reads the LIMIT from the statement", async () => {
    const { d1, statements } = recordingD1(env.DB);
    await d1.prepare("SELECT * FROM gesture ORDER BY sort_name LIMIT 5").all();
    expect((await scanReport(env.DB, statements)).scans).toEqual([]);
    const unbounded = recordingD1(env.DB);
    await unbounded.d1
      .prepare("SELECT * FROM gesture ORDER BY sort_name")
      .all();
    expect((await scanReport(env.DB, unbounded.statements)).scans).toHaveLength(
      1
    );
  });
});

describe("recordingD1 and scanReport", () => {
  it("explains each statement with its own values and reports a scan", async () => {
    const { d1, statements } = recordingD1(env.DB);
    await d1.prepare("SELECT id FROM gesture WHERE slug = ?").bind("x").all();
    await d1
      .prepare("SELECT id FROM gesture WHERE lower(name) = ?")
      .bind("x")
      .all();
    await d1.batch([
      d1.prepare("SELECT 1 WHERE ? = 1").bind(1),
      d1.prepare("SELECT id FROM category WHERE slug = ?").bind("y"),
    ]);
    expect(statements.map((statement) => statement.params)).toEqual([
      ["x"],
      ["x"],
      [1],
      ["y"],
    ]);
    const [seek] = statements;
    expect(
      (await explain(env.DB, seek as (typeof statements)[number])).map(
        (plan) => plan.detail
      )
    ).toEqual(["SEARCH gesture USING INDEX gesture_slug_unique (slug=?)"]);
    const report = await scanReport(env.DB, statements);
    expect(report.scans).toHaveLength(1);
    expect(report.scans[0]).toContain("SCAN gesture");
  });
});
