import { describe, expect, test } from "bun:test";
import {
  EXPORT_SCHEMAS,
  EXPORT_TABLES,
  type ExportFiles,
  validateExport,
} from "../src/core/export-schema";
import type { ReportIssue } from "../src/core/report";
import { fixtureExport, jsonl } from "./helpers";

function issues(result: ReturnType<typeof validateExport>): ReportIssue[] {
  return result.sections.flatMap((part) => part.issues);
}

function withTable(
  files: ExportFiles,
  table: string,
  text: string
): ExportFiles {
  return { ...files, [table]: text };
}

describe("the export schemas", () => {
  test("cover the nine Convex tables", () => {
    expect(EXPORT_TABLES).toEqual([
      "adminLogs",
      "categories",
      "gesture_list_items",
      "gesture_lists",
      "gestures",
      "sponsorships",
      "user_consents",
      "user_favorites",
      "users",
    ]);
    for (const schema of Object.values(EXPORT_SCHEMAS)) {
      expect(Object.keys(schema.shape)).toContain("_id");
      expect(Object.keys(schema.shape)).toContain("_creationTime");
    }
  });

  test("accept the fixture's row of every table with no issue", async () => {
    const result = validateExport(await fixtureExport());
    expect(issues(result)).toEqual([]);
    for (const table of EXPORT_TABLES) {
      expect(result.tables[table]).toBe(1);
      expect(result.data[table]).toHaveLength(1);
    }
    expect(result.unknownTables).toEqual([]);
    expect(result.data.sponsorships[0]?.status).toBe("active");
    expect(result.data.gestures[0]?.categoryIds).toEqual([
      "kc7cat000000000000000000000fam1",
    ]);
  });

  test("warn about an unknown field and drop it", async () => {
    const files = await fixtureExport();
    const [line] = String(files.categories).split("\n");
    const row = { ...JSON.parse(line ?? "{}"), colour: "red", sortKey: 3 };
    const result = validateExport(withTable(files, "categories", jsonl([row])));
    expect(issues(result)).toEqual([
      {
        code: "unknownField",
        count: 1,
        ids: ["kc7cat000000000000000000000fam1"],
        message:
          "categories: the field `colour` is not in the schema; it is ignored.",
        severity: "warning",
      },
      {
        code: "unknownField",
        count: 1,
        ids: ["kc7cat000000000000000000000fam1"],
        message:
          "categories: the field `sortKey` is not in the schema; it is ignored.",
        severity: "warning",
      },
    ]);
    expect(
      result.sections.find((part) => part.domain === "catalog")
    ).toBeDefined();
    expect(result.data.categories[0]).not.toHaveProperty("colour");
  });

  test("list and ignore an unknown table", async () => {
    const files = withTable(
      await fixtureExport(),
      "sessions",
      jsonl([{ _id: "x" }])
    );
    const result = validateExport(files);
    expect(result.unknownTables).toEqual(["sessions"]);
    expect(issues(result)).toEqual([
      {
        code: "unknownTable",
        ids: ["sessions"],
        message:
          "1 table(s) are not among the nine Convex tables; they are ignored.",
        severity: "warning",
      },
    ]);
    expect(result.data).not.toHaveProperty("sessions");
  });

  test("make a malformed row a blocker naming its table and _id, with no value", async () => {
    const files = await fixtureExport();
    const bad = {
      _creationTime: 1,
      _id: "jd7bad",
      createdAt: 1,
      email: "secret.person@example.test",
      lastActiveAt: "yesterday",
      role: "owner",
    };
    const result = validateExport(withTable(files, "users", jsonl([bad])));
    const [issue] = issues(result);
    expect(issue?.severity).toBe("blocker");
    expect(issue?.code).toBe("malformedRow");
    expect(issue?.ids).toEqual(["jd7bad"]);
    expect(issue?.message).toStartWith(
      "users: row jd7bad does not match the schema ("
    );
    expect(issue?.message).toContain("lastActiveAt");
    expect(issue?.message).toContain("role");
    expect(issue?.message).not.toContain("secret.person");
    expect(issue?.message).not.toContain("yesterday");
    expect(
      result.sections.find((part) => part.domain === "users")?.issues
    ).toHaveLength(1);
    expect(result.data.users).toEqual([]);
  });

  test("make a line that is not JSON, a row without an _id and a repeated _id blockers", async () => {
    const files = await fixtureExport();
    const row = { _creationTime: 5, _id: "kc7dup", isActive: true, name: "A" };
    const text = `${jsonl([row, row])}{not json\n${jsonl([{ isActive: true, name: "B" }])}`;
    const found = issues(validateExport(withTable(files, "categories", text)));
    expect(
      found.map((issue) => [issue.code, issue.severity, issue.ids])
    ).toEqual([
      ["unparsableLine", "blocker", undefined],
      ["malformedRow", "blocker", []],
      ["duplicateId", "blocker", ["kc7dup"]],
    ]);
    expect(found[0]?.message).toBe("categories: line 3 is not JSON.");
    expect(found[1]?.message).toStartWith("categories: line 4 does not match");
  });

  test("refuse an unknown sponsorship status", async () => {
    const files = await fixtureExport();
    const row = JSON.parse(String(files.sponsorships).trim());
    const result = validateExport(
      withTable(files, "sponsorships", jsonl([{ ...row, status: "paused" }]))
    );
    expect(issues(result).map((issue) => issue.code)).toEqual(["malformedRow"]);
  });

  test("read an absent table as empty with a warning, and an empty export as a blocker", async () => {
    const files = Object.fromEntries(
      Object.entries(await fixtureExport()).filter(
        ([table]) => table !== "adminLogs"
      )
    );
    const result = validateExport(files);
    expect(result.data.adminLogs).toEqual([]);
    expect(issues(result).map((issue) => [issue.code, issue.severity])).toEqual(
      [["absentTable", "warning"]]
    );
    const empty = issues(validateExport({}));
    expect(empty[0]?.code).toBe("emptyExport");
    expect(empty[0]?.severity).toBe("blocker");
  });

  test("sort rows by _creationTime, then _id, whatever the line order", () => {
    const rows = [
      { _creationTime: 2, _id: "b", isActive: true, name: "B" },
      { _creationTime: 1, _id: "z", isActive: true, name: "Z" },
      { _creationTime: 2, _id: "a", isActive: true, name: "A" },
    ];
    const result = validateExport({ categories: jsonl(rows) });
    expect(result.data.categories.map((row) => row._id)).toEqual([
      "z",
      "a",
      "b",
    ]);
  });
});
