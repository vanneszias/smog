import { env } from "cloudflare:workers";
import { makeGesture } from "@smog/db/testing";
import { DAY_MS, newId } from "@smog/utils";
import { beforeAll, describe, expect, it } from "vitest";
import { SPONSORSHIP_CSV_COLUMNS } from "../src/schema";
import { csvCell, csvFilename } from "../src/server/export";
import {
  type Authed,
  auditMark,
  callAs,
  expectAudit,
  signedUp,
  testDb,
} from "./helpers";
import { seedCheckout } from "./sponsorship-helpers";

/*
 * `admin.export.sponsorshipsCsv` (A-09, ruling 14): the 18 old columns in
 * order, every field quoted, the formula guard, no 10,000 row cap (bug
 * 11), the status and date filters, and the audit entry.
 */

/** UTF-8 byte order mark: Excel then reads the file (and the euro sign) as UTF-8 (M4). */
const BOM = "\ufeff";
const FILENAME = /^sponsorships-\d{4}-\d{2}-\d{2}\.csv$/;
const EXAMPLE_EMAIL = /@example\.com$/;
const FIRST_BULK = /-00000000$/;
const LAST_BULK = /-00010000$/;

let admin: Authed;

beforeAll(async () => {
  admin = await signedUp("admin");
});

interface Csv {
  csv: string;
  filename: string;
  rows: number;
}

async function failure(
  run: Promise<unknown>
): Promise<{ code: string; data?: unknown }> {
  try {
    await run;
  } catch (error) {
    return error as { code: string; data?: unknown };
  }
  throw new Error("[test] expected the call to fail");
}

/** The records of a CSV whose fields hold no line breaks. */
function records(csv: string): string[][] {
  expect(csv.startsWith(BOM)).toBe(true);
  return csv
    .slice(BOM.length)
    .split("\r\n")
    .filter((line) => line !== "")
    .map((line) =>
      // Every field is quoted: split on `","` and strip the outer quotes.
      line
        .slice(1, -1)
        .split('","')
        .map((field) => field.replaceAll('""', '"'))
    );
}

describe("csvCell", () => {
  it("quotes every field and doubles quotes", () => {
    expect(csvCell('Bakkerij "De Zon"')).toBe('"Bakkerij ""De Zon"""');
    expect(csvCell("")).toBe('""');
    expect(csvCell("a,b\nc")).toBe('"a,b\nc"');
  });

  it("prefixes a cell a spreadsheet would read as a formula", () => {
    for (const lead of ["=", "+", "-", "@", "\t", "\r"]) {
      expect(csvCell(`${lead}SUM(A1)`)).toBe(`"'${lead}SUM(A1)"`);
    }
    expect(csvCell("Acme = goed")).toBe('"Acme = goed"');
  });

  it("also guards a formula behind whitespace, a line break or a full-width sign (I3)", () => {
    const variants = [
      " =1+1",
      "  +1",
      "\n=1+1",
      "\r\n=1+1",
      " =1+1",
      "　-1",
      "﻿@SUM(A1)",
      "​=1",
      "＝1+1",
      "＋1",
      "－1",
      "＠A1",
      "﹢ 1",
      "− 1",
      "\t",
      "\n",
    ];
    for (const value of variants) {
      expect(csvCell(value), JSON.stringify(value)).toBe(
        `"'${value.replaceAll('"', '""')}"`
      );
    }
    for (const value of ["Acme = goed", "1+1", " Acme", "é=1", "a@b.be"]) {
      expect(csvCell(value), JSON.stringify(value)).toBe(`"${value}"`);
    }
  });
});

describe("csvFilename", () => {
  it("uses the Brussels date", () => {
    // 23:30 UTC on 31 March is already 1 April in Brussels (summer time).
    expect(csvFilename(new Date("2026-03-31T23:30:00Z"))).toBe(
      "sponsorships-2026-04-01.csv"
    );
    expect(csvFilename(new Date("2026-12-31T22:30:00Z"))).toBe(
      "sponsorships-2026-12-31.csv"
    );
  });
});

describe("admin.export.sponsorshipsCsv", () => {
  /** Rows of their own (2002), so other tests' rows stay out. */
  const BASE = Date.UTC(2002, 0, 1);
  const at = (day: number) => new Date(BASE + day * DAY_MS);

  it("writes the 18 columns in the old order, escaped and guarded, and audits", async () => {
    const gesture = await makeGesture(testDb(), { name: "Export gebaar" });
    const seeded = await seedCheckout({
      company: "=HYPERLINK(1)",
      createdAt: at(1),
      displayName: 'Bakkerij "De Zon"',
      endsAt: at(366),
      gestures: [gesture],
      invoice: true,
      logo: true,
      mollie: true,
      paymentStatus: "paid",
      startsAt: at(1),
      status: "live",
    });
    const filters = { from: at(1).getTime(), to: at(1).getTime() };
    const mark = await auditMark();
    const result = await callAs<Csv>(admin, "export.sponsorshipsCsv", filters);
    expect(result.rows).toBe(1);
    expect(result.filename).toMatch(FILENAME);
    const [header, row] = records(result.csv);
    expect(header).toEqual([...SPONSORSHIP_CSV_COLUMNS]);
    expect(header).toHaveLength(18);
    expect(row).toEqual([
      seeded.sponsorshipIds[0],
      "live",
      'Bakkerij "De Zon"',
      expect.stringMatching(EXAMPLE_EMAIL),
      "Alex Sponsor",
      "'=HYPERLINK(1)",
      "Acme Facturatie",
      "0123456749",
      "factuur@example.com",
      "Yes",
      "Yes",
      "60.00",
      seeded.mollieId,
      at(1).toISOString(),
      at(366).toISOString(),
      "1",
      gesture.id,
      at(1).toISOString(),
    ]);
    expect(result.csv).toContain('"Bakkerij ""De Zon"""');
    await expectAudit("export.sponsorshipsCsv", {
      actorId: admin.user.id,
      data: { filters, rows: 1 },
      mark,
      targetId: null,
      targetType: "system",
    });
  });

  it("filters by status and date, oldest first", async () => {
    const day = (n: number) => at(20 + n);
    const a = await seedCheckout({ createdAt: day(1), status: "in_review" });
    const b = await seedCheckout({ createdAt: day(2), status: "expired" });
    const c = await seedCheckout({ createdAt: day(3), status: "in_review" });
    await seedCheckout({ createdAt: day(5), status: "in_review" });
    const range = { from: day(1).getTime(), to: day(3).getTime() };
    const all = await callAs<Csv>(admin, "export.sponsorshipsCsv", range);
    expect(
      records(all.csv)
        .slice(1)
        .map((row) => row[0])
    ).toEqual([a.sponsorshipIds[0], b.sponsorshipIds[0], c.sponsorshipIds[0]]);
    const review = await callAs<Csv>(admin, "export.sponsorshipsCsv", {
      ...range,
      status: ["in_review"],
    });
    expect(review.rows).toBe(2);
    expect(
      records(review.csv)
        .slice(1)
        .map((row) => row[1])
    ).toEqual(["in_review", "in_review"]);
    const empty = await callAs<Csv>(admin, "export.sponsorshipsCsv", {
      from: day(30).getTime(),
      to: day(31).getTime(),
    });
    expect(empty.rows).toBe(0);
    expect(records(empty.csv)).toEqual([[...SPONSORSHIP_CSV_COLUMNS]]);
  });

  /** `n` expired sponsorships on one gesture, created one ms apart from `start`. */
  async function bulk(n: number, start: number): Promise<void> {
    const gesture = await makeGesture(testDb());
    const sponsorId = newId();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO sponsor (id, name, email, locale, created_at) VALUES (?, 'Bulk', 'bulk@example.com', 'nl', ?)"
      ).bind(sponsorId, start),
      env.DB.prepare(
        `WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i + 1 FROM n WHERE i + 1 < ?)
         INSERT INTO sponsorship (id, sponsor_id, gesture_id, display_name, status, created_at, updated_at)
         SELECT printf('bulk-%s-%08d', ?, i), ?, ?, 'Bulk BV', 'expired', ? + i, ? + i FROM n`
      ).bind(n, sponsorId, sponsorId, gesture.id, start, start),
    ]);
  }

  it("has no 10,000 row cap: 10,001 rows in pages", async () => {
    const start = at(100).getTime();
    await bulk(10_001, start);
    const result = await callAs<Csv>(admin, "export.sponsorshipsCsv", {
      from: start,
      to: start + 20_000,
    });
    expect(result.rows).toBe(10_001);
    const lines = records(result.csv);
    expect(lines).toHaveLength(10_002);
    // Oldest first across the page boundaries, none twice.
    const ids = lines.slice(1).map((row) => row[0]);
    expect(new Set(ids).size).toBe(10_001);
    expect(ids[0]).toMatch(FIRST_BULK);
    expect(ids.at(-1)).toMatch(LAST_BULK);
  });

  it("asks for a date range over 50,000 rows (INVALID_STATE tooMany)", async () => {
    const start = at(200).getTime();
    await bulk(50_001, start);
    const mark = await auditMark();
    expect(
      await failure(
        callAs(admin, "export.sponsorshipsCsv", {
          from: start,
          to: start + 60_000,
        })
      )
    ).toMatchObject({ code: "INVALID_STATE", data: { reason: "tooMany" } });
    const rows = await env.DB.prepare(
      "SELECT count(*) AS n FROM audit_log WHERE rowid > ?"
    )
      .bind(mark)
      .first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });
});
