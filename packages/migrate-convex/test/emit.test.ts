import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { category, gesture, gestureKeyword, user } from "@smog/db";
import { sql } from "drizzle-orm";
import {
  chunkStatements,
  emitPlan,
  FILE_BYTES_MAX,
  FILE_GROUPS,
  ftsRebuildStatements,
  insertRow,
  legacyIdRef,
  mergeResetKeys,
  rawSql,
  renderManifest,
  renderSql,
  resetStatements,
  sqlLiteral,
} from "../src/core/emit";

const FTS_INSERT = /^INSERT INTO gesture_fts /;
const NOW = new Date("2026-10-04T12:00:00.000Z");
const INPUTS = {
  export: "e".repeat(64),
  muxMap: null,
  overrides: null,
  workosUsers: null,
};

function sha(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

describe("sqlLiteral", () => {
  test("doubles quotes and renders NULL, numbers and booleans", () => {
    expect(sqlLiteral("O'Brien's")).toBe("'O''Brien''s'");
    expect(sqlLiteral("")).toBe("''");
    expect(sqlLiteral(null)).toBe("NULL");
    expect(sqlLiteral(42)).toBe("42");
    expect(sqlLiteral(-1.5)).toBe("-1.5");
    expect(sqlLiteral(true)).toBe("1");
    expect(sqlLiteral(false)).toBe("0");
    expect(sqlLiteral(10n)).toBe("10");
  });

  test("keeps a value with line breaks on one line", () => {
    expect(sqlLiteral("a\nb's\r\nc\rd")).toBe(
      "('a' || char(10) || 'b''s' || char(13, 10) || 'c' || char(13) || 'd')"
    );
    expect(sqlLiteral("\n")).toBe("(char(10))");
  });

  test("refuses NaN, Infinity and NUL", () => {
    expect(() => sqlLiteral(Number.NaN)).toThrow("Not a SQL number");
    expect(() => sqlLiteral(Number.POSITIVE_INFINITY)).toThrow(
      "Not a SQL number"
    );
    expect(() => sqlLiteral("a\0b")).toThrow("NUL");
  });
});

describe("renderSql and insertRow", () => {
  test("inline drizzle parameters, never a ? inside quotes", () => {
    expect(
      renderSql(
        sql`SELECT '?' AS q, ${"it's"} AS a, ${3} AS b, "x?" FROM ${user}`
      )
    ).toBe(`SELECT '?' AS q, 'it''s' AS a, 3 AS b, "x?" FROM "user";`);
  });

  test("insert a typed row with every conflict target named, in column order", () => {
    const statement = insertRow(
      user,
      {
        createdAt: new Date(1_735_689_600_000),
        email: "ada@example.test",
        emailVerified: true,
        id: "u-1",
        legacyId: "jd7",
        name: "Ada O'Fixture",
        role: "admin",
        updatedAt: new Date(1_738_368_000_000),
        welcomedAt: NOW,
      },
      [[user.legacyId], [user.email]]
    );
    expect(statement).toBe(
      `INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at", "role", "legacy_id", "welcomed_at") VALUES ('u-1', 'Ada O''Fixture', 'ada@example.test', 1, 1735689600000, 1738368000000, 'admin', 'jd7', 1791115200000) ON CONFLICT ("legacy_id") DO NOTHING ON CONFLICT ("email") DO NOTHING;`
    );
  });

  test("inline a legacy id subquery, NULLs and composite conflict targets", () => {
    expect(
      insertRow(
        gestureKeyword,
        {
          gestureId: legacyIdRef("gesture", "kg'1"),
          keyword: "moeder",
          position: 0,
        },
        [[gestureKeyword.gestureId, gestureKeyword.keyword]]
      )
    ).toBe(
      `INSERT INTO "gesture_keyword" ("gesture_id", "keyword", "position") VALUES ((SELECT "id" FROM "gesture" WHERE "legacy_id" = 'kg''1'), 'moeder', 0) ON CONFLICT ("gesture_id", "keyword") DO NOTHING;`
    );
    expect(
      insertRow(
        category,
        { id: "c1", name: "A", publishedAt: null, slug: "a", sortOrder: 0 },
        [[category.legacyId]]
      )
    ).toContain(`"published_at"`);
  });

  test("refuse no conflict target, a foreign conflict column and an unknown key", () => {
    expect(() => insertRow(category, { id: "c1" }, [])).toThrow(
      "needs a conflict target"
    );
    expect(() =>
      insertRow(category, { id: "c1" }, [[gesture.legacyId]])
    ).toThrow("names a column of another table");
    expect(() =>
      insertRow(category, { colour: "red", id: "c1" } as never, [[category.id]])
    ).toThrow("category has no column colour");
    expect(() => rawSql("a\nb")).toThrow("one line");
  });
});

describe("chunkStatements", () => {
  test("give an empty group one empty file", () => {
    expect(chunkStatements("10-users", [])).toEqual([
      { content: "", name: "10-users-001.sql", statements: 0 },
    ]);
  });

  test("split at 500 statements, one statement per line", () => {
    const statements = Array.from({ length: 1001 }, (_, i) => `SELECT ${i};`);
    const files = chunkStatements("30-learning", statements);
    expect(files.map((file) => [file.name, file.statements])).toEqual([
      ["30-learning-001.sql", 500],
      ["30-learning-002.sql", 500],
      ["30-learning-003.sql", 1],
    ]);
    expect(files[0]?.content.split("\n")).toHaveLength(501);
    expect(files[2]?.content).toBe("SELECT 1000;\n");
    expect(files.flatMap((file) => file.content.trim().split("\n"))).toEqual(
      statements
    );
  });

  test("split at 512 KiB", () => {
    const big = `SELECT '${"x".repeat(200 * 1024)}';`;
    const files = chunkStatements("20-catalog", [big, big, big]);
    expect(files.map((file) => file.statements)).toEqual([2, 1]);
    for (const file of files) {
      expect(new TextEncoder().encode(file.content).length).toBeLessThanOrEqual(
        FILE_BYTES_MAX
      );
    }
  });

  test("refuse a statement over the file size, over two lines, or without ;", () => {
    expect(() =>
      chunkStatements("x", [`SELECT '${"x".repeat(FILE_BYTES_MAX)}';`])
    ).toThrow("larger than");
    expect(() => chunkStatements("x", ["SELECT 1;\nSELECT 2;"])).toThrow(
      "one line"
    );
    expect(() => chunkStatements("x", ["SELECT 1"])).toThrow("end with ;");
  });
});

describe("the gesture_fts rebuild", () => {
  test("is two statements per 200 gestures, with the ids inlined", () => {
    const ids = Array.from(
      { length: 401 },
      (_, i) => `g-${String(i).padStart(3, "0")}`
    );
    const statements = ftsRebuildStatements(ids);
    expect(statements).toHaveLength(6);
    expect(statements[0]).toStartWith(
      "DELETE FROM gesture_fts WHERE gesture_id IN ('g-000'"
    );
    expect(statements[1]).toStartWith("INSERT INTO gesture_fts");
    expect(statements[4]).toBe(
      "DELETE FROM gesture_fts WHERE gesture_id IN ('g-400');"
    );
    expect(ftsRebuildStatements([])).toEqual([]);
  });
});

describe("reset-imported", () => {
  const keys = mergeResetKeys([
    {
      rows: {
        category: ["c1"],
        favorite: [["u1", "g1"]],
        gesture: ["g1"],
        gesture_category: [["g1", "c1"]],
      },
      users: [{ id: "u1", legacyId: "jd7a" }],
    },
    {
      rows: {
        invoice_request: ["sp1"],
        payment: ["p1"],
        payment_item: [["p1", "s1"]],
        sponsor: ["sp1"],
        sponsorship: ["s1"],
        sponsorship_event: ["e1"],
      },
    },
  ]);

  test("deletes in RESTRICT order, then the created users, then frees the claimed ones", () => {
    expect(resetStatements(keys)).toEqual([
      `DELETE FROM "payment_item" WHERE ("payment_id", "sponsorship_id") IN (SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each('[["p1","s1"]]'));`,
      `DELETE FROM "sponsorship_event" WHERE "id" IN (SELECT value FROM json_each('["e1"]'));`,
      `DELETE FROM "payment" WHERE "id" IN (SELECT value FROM json_each('["p1"]'));`,
      `DELETE FROM "sponsorship" WHERE "id" IN (SELECT value FROM json_each('["s1"]'));`,
      `DELETE FROM "invoice_request" WHERE "sponsor_id" IN (SELECT value FROM json_each('["sp1"]'));`,
      `DELETE FROM "sponsor" WHERE "id" IN (SELECT value FROM json_each('["sp1"]'));`,
      `DELETE FROM "favorite" WHERE ("user_id", "gesture_id") IN (SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each('[["u1","g1"]]'));`,
      `DELETE FROM "gesture_category" WHERE ("gesture_id", "category_id") IN (SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each('[["g1","c1"]]'));`,
      `DELETE FROM "gesture" WHERE "id" IN (SELECT value FROM json_each('["g1"]'));`,
      "DELETE FROM gesture_fts WHERE gesture_id IN ('g1');",
      expect.stringMatching(FTS_INSERT),
      `DELETE FROM "category" WHERE "id" IN (SELECT value FROM json_each('["c1"]'));`,
      `DELETE FROM "user" WHERE ("id", "legacy_id") IN (SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each('[["u1","jd7a"]]')) AND ("role" <> 'admin' OR EXISTS (SELECT 1 FROM "user" AS "other" WHERE "other"."role" = 'admin' AND NOT (coalesce("other"."banned", 0) = 1 AND ("other"."ban_expires" IS NULL OR "other"."ban_expires" > CAST(strftime('%s', 'now') AS INTEGER) * 1000)) AND "other"."id" NOT IN (SELECT value FROM json_each('["u1"]'))));`,
      `UPDATE "user" SET "legacy_id" = NULL WHERE "legacy_id" IN (SELECT value FROM json_each('["jd7a"]'));`,
    ]);
  });

  test("quotes keys, chunks them, and refuses a key of the wrong width", () => {
    const many = Array.from({ length: 251 }, (_, i) => `k${i}`);
    expect(resetStatements({ rows: { list: many } })).toHaveLength(2);
    expect(
      resetStatements({ rows: { gesture_keyword: [["g1", "it's"]] } })[0]
    ).toContain(`'[["g1","it''s"]]'`);
    expect(() => resetStatements({ rows: { favorite: ["u1"] } })).toThrow(
      "needs 2 part(s)"
    );
  });

  test("merges keys distinct and sorted", () => {
    const merged = mergeResetKeys([
      { rows: { list: ["b", "a"] }, users: [{ id: "u2", legacyId: "y" }] },
      {
        rows: { list: ["a"] },
        users: [
          { id: "u1", legacyId: "x" },
          { id: "u2", legacyId: "y" },
        ],
      },
    ]);
    expect(merged.rows?.list).toEqual(["a", "b"]);
    expect(merged.users).toEqual([
      { id: "u1", legacyId: "x" },
      { id: "u2", legacyId: "y" },
    ]);
  });
});

describe("emitPlan and the manifest", () => {
  test("lists every group in order with each file's SHA-256, then the reset", async () => {
    const emitted = await emitPlan({
      ftsGestureIds: ["g1"],
      groups: {
        "20-catalog": [
          `INSERT INTO "category" ("id") VALUES ('c1') ON CONFLICT ("id") DO NOTHING;`,
        ],
      },
      inputs: INPUTS,
      now: NOW,
      report: { blockers: 0, warnings: 1 },
      resetKeys: { rows: { category: ["c1"] } },
      target: "staging",
    });
    const { manifest } = emitted;
    expect(manifest.files.map((file) => file.group)).toEqual([...FILE_GROUPS]);
    expect(manifest.files.map((file) => [file.name, file.statements])).toEqual([
      ["10-users-001.sql", 0],
      ["20-catalog-001.sql", 1],
      ["30-learning-001.sql", 0],
      ["40-account-001.sql", 0],
      ["50-sponsorships-001.sql", 0],
      ["90-fts-001.sql", 2],
    ]);
    expect(manifest.reset.map((file) => [file.name, file.statements])).toEqual([
      ["reset-imported-001.sql", 1],
    ]);
    for (const file of emitted.files) {
      const entry = [...manifest.files, ...manifest.reset].find(
        (item) => item.name === file.name
      );
      expect(entry?.sha256).toBe(sha(file.content));
      expect(entry?.bytes).toBe(Buffer.byteLength(file.content));
    }
    expect(manifest.files[0]?.sha256).toBe(sha(""));
    expect(manifest).toMatchObject({
      inputs: INPUTS,
      now: "2026-10-04T12:00:00.000Z",
      report: { blockers: 0, warnings: 1 },
      target: "staging",
      version: 1,
    });
    expect(renderManifest(manifest)).toEndWith("}\n");
  });
});
