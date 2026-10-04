import { describe, expect, test } from "bun:test";
import {
  EXPORT_SCHEMAS,
  EXPORT_TABLES,
  type ExportFiles,
  TABLE_LIST,
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
      expect(result.tables[table]).toBeGreaterThanOrEqual(1);
      expect(result.data[table]).toHaveLength(result.tables[table]);
    }
    expect(result.unknownTables).toEqual([]);
    expect(
      result.data.sponsorships.find(
        (row) => row._id === "ks7spn000000000000000000000spn1"
      )?.status
    ).toBe("active");
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
    const row = JSON.parse(String(files.sponsorships).split("\n")[0] ?? "{}");
    const result = validateExport(
      withTable(files, "sponsorships", jsonl([{ ...row, status: "paused" }]))
    );
    expect(issues(result).map((issue) => issue.code)).toEqual(["malformedRow"]);
  });

  test("make a table that _tables lists but the export lacks a blocker (M3)", async () => {
    const files = Object.fromEntries(
      Object.entries(await fixtureExport()).filter(
        ([table]) => table !== "adminLogs"
      )
    );
    const result = validateExport(files);
    expect(result.data.adminLogs).toEqual([]);
    expect(
      issues(result).map((issue) => [issue.code, issue.severity, issue.ids])
    ).toEqual([["missingTable", "blocker", ["adminLogs"]]]);
  });

  test("without _tables, read an absent table as empty with warnings; an empty export is a blocker", async () => {
    const files = Object.fromEntries(
      Object.entries(await fixtureExport()).filter(
        ([table]) => table !== "adminLogs" && table !== TABLE_LIST
      )
    );
    const result = validateExport(files);
    expect(result.data.adminLogs).toEqual([]);
    expect(issues(result).map((issue) => [issue.code, issue.severity])).toEqual(
      [
        ["noTableList", "warning"],
        ["absentTable", "warning"],
      ]
    );
    const empty = issues(validateExport({}));
    expect(empty[0]?.code).toBe("emptyExport");
    expect(empty[0]?.severity).toBe("blocker");
    // A table list that names nothing readable counts as none.
    const unreadable = validateExport({
      ...files,
      [TABLE_LIST]: "{}\nnot json\n",
    });
    expect(issues(unreadable).map((issue) => issue.code)).toEqual([
      "noTableList",
      "absentTable",
    ]);
    // A listed table that is not active (or a system table) is not required.
    const inactive = validateExport({
      ...files,
      [TABLE_LIST]: jsonl([
        { name: "users" },
        { name: "adminLogs", state: "deleting" },
        { name: "_storage" },
      ]),
    });
    expect(issues(inactive).map((issue) => issue.code)).toEqual([
      "absentTable",
    ]);
  });

  test("make a string D1 cannot store a row blocker naming the field (M4)", async () => {
    const files = await fixtureExport();
    const row = JSON.parse(String(files.gestures).trim());
    for (const [info, problem] of [
      ["a\u0000b", "a NUL byte"],
      ["a\ud800b", "a lone surrogate"],
    ] as const) {
      const text = jsonl([{ ...row, concept: ["ok", info] }]);
      const [issue] = issues(
        validateExport(withTable(files, "gestures", text))
      );
      expect(issue).toEqual({
        code: "unwritableString",
        ids: ["kg7ges000000000000000000000mam1"],
        message: `gestures: row kg7ges000000000000000000000mam1 has ${problem} in \`concept.1\`, which D1 cannot store as it is.`,
        severity: "blocker",
      });
    }
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
