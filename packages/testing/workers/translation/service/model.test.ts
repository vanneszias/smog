import { describe, expect, it } from "vitest";
import {
  parseCsv,
  toCsvCell,
} from "../../../../features/translation/src/server/csv";
import {
  buildExport,
  ImportFileError,
  parseImport,
  planImport,
} from "../../../../features/translation/src/server/import-export";
import {
  catalogueKeys,
  cellOf,
  coverageOf,
  isApplicable,
  type ModelLanguage,
  type Overrides,
  rowOf,
  sourceHash,
  sourceOf,
} from "../../../../features/translation/src/server/model";

const NL: ModelLanguage = { code: "nl", isDefault: true, name: "Nederlands" };
const EN: ModelLanguage = { code: "en", isDefault: false, name: "English" };
const FR: ModelLanguage = { code: "fr", isDefault: false, name: "Francais" };
const DE: ModelLanguage = { code: "de", isDefault: false, name: "Deutsch" };
const LANGUAGES = [NL, EN, FR];
const NONE: Overrides = new Map();

function overrides(
  rows: Record<string, Record<string, [string, string | null]>>
): Overrides {
  return new Map(
    Object.entries(rows).map(([locale, keys]) => [
      locale,
      new Map(
        Object.entries(keys).map(([key, [value, hash]]) => [
          key,
          { sourceHash: hash, updatedAt: 1000, value },
        ])
      ),
    ])
  );
}

function infoOf(key: string, languages = LANGUAGES) {
  const info = catalogueKeys(languages.map((item) => item.code)).find(
    (item) => item.key === key
  );
  if (!info) {
    throw new Error(`[test] No key ${key}`);
  }
  return info;
}

describe("the key universe", () => {
  it("holds every shipped key and the plural forms each language needs", () => {
    const keys = catalogueKeys(["nl", "en", "fr"]);
    expect(keys.length).toBeGreaterThan(1700);
    const names = new Set(keys.map((info) => info.key));
    expect(names.has("auth.errors.generic")).toBe(true);
    // French has `_many` plurals that Dutch and English do not use.
    const many = keys.find((info) => info.key.endsWith("_many"));
    expect(many).toBeDefined();
    if (many) {
      expect(isApplicable(many, "fr")).toBe(true);
      expect(isApplicable(many, "nl")).toBe(false);
    }
  });

  it("adds the forms of a language that is added later", () => {
    const withArabic = catalogueKeys(["nl", "en", "fr", "ar"]);
    expect(withArabic.some((info) => info.key.endsWith("_zero"))).toBe(true);
    expect(withArabic.length).toBeGreaterThan(
      catalogueKeys(["nl", "en", "fr"]).length
    );
  });
});

describe("cells", () => {
  const key = "auth.errors.generic";

  it("shows the shipped text, and a language without one as missing", () => {
    const info = infoOf(key, [NL, EN, FR, DE]);
    const source = sourceOf(NONE, "nl", info);
    expect(source).not.toBe("");
    expect(cellOf(NONE, EN, info, source)).toMatchObject({
      missing: false,
      overridden: false,
      stale: false,
    });
    expect(cellOf(NONE, DE, info, source)).toMatchObject({
      applicable: true,
      missing: true,
      value: null,
    });
  });

  it("flags a translation whose source changed as stale, and a placeholder mismatch", () => {
    const info = infoOf("kit.stepOf");
    const base = overrides({});
    const source = sourceOf(base, "nl", info);
    const row = overrides({
      en: {
        [info.key]: [
          "Edited {{current}} {{total}}",
          sourceHash("an older source"),
        ],
      },
    });
    const cell = cellOf(row, EN, info, source);
    expect(cell.overridden).toBe(true);
    expect(cell.stale).toBe(true);
    // The source has placeholders the edit lacks (or has others).
    const wrong = overrides({ en: { [info.key]: ["No placeholders", null] } });
    expect(cellOf(wrong, EN, info, source).issues.length).toBeGreaterThan(0);
  });

  it("is not stale when the stored hash is the source's", () => {
    const info = infoOf(key);
    const source = sourceOf(NONE, "nl", info);
    const row = overrides({
      en: { [key]: ["Something else", sourceHash(source)] },
    });
    expect(cellOf(row, EN, info, source).stale).toBe(false);
  });

  it("does not count a plural form a language does not use", () => {
    const many = catalogueKeys(["nl", "en", "fr"]).find((info) =>
      info.key.endsWith("_many")
    );
    if (!many) {
      throw new Error("[test] No _many key");
    }
    const source = sourceOf(NONE, "nl", many);
    expect(source).not.toBe("");
    expect(cellOf(NONE, NL, many, source).applicable).toBe(false);
    expect(cellOf(NONE, FR, many, source).applicable).toBe(true);
  });

  it("hashes a source the same way twice and differently for another", () => {
    expect(sourceHash("abc")).toBe(sourceHash("abc"));
    expect(sourceHash("abc")).not.toBe(sourceHash("abd"));
    expect(sourceHash("abc")).toHaveLength(16);
  });
});

describe("coverage", () => {
  it("counts a language without texts as missing everything and the shipped ones as complete", () => {
    const rows = coverageOf(NONE, [NL, EN, FR, DE], "nl");
    const de = rows.find((row) => row.code === "de");
    const en = rows.find((row) => row.code === "en");
    expect(de?.translated).toBe(0);
    expect(de?.missing).toBe(de?.total);
    expect(en?.missing).toBe(0);
    expect(en?.translated).toBe(en?.total);
  });
});

describe("csv", () => {
  it("round-trips quotes, commas, newlines and a formula-looking cell", () => {
    const cells = [
      'a "quoted" word',
      "one, two",
      "line\nbreak",
      "=SUM(A1)",
      "-5",
    ];
    const line = cells.map(toCsvCell).join(",");
    expect(parseCsv(`${line}\r\n`)).toEqual([
      ['a "quoted" word', "one, two", "line\nbreak", "'=SUM(A1)", "'-5"],
    ]);
  });

  it("refuses an unclosed quote and text after a closing quote", () => {
    expect(() => parseCsv('a,"b')).toThrow();
    expect(() => parseCsv('"a"b,c')).toThrow();
  });

  it("reads a file with a BOM, blank lines and a trailing comma", () => {
    expect(parseCsv("﻿key,nl\n\nx,y\nz,\n")).toEqual([
      ["key", "nl"],
      ["x", "y"],
      ["z", ""],
    ]);
  });
});

describe("export and import", () => {
  const context = { defaultCode: "nl", languages: LANGUAGES, overrides: NONE };
  const enabled = new Set(["nl", "en", "fr"]);

  it("exports one language as flat JSON and all as sections", () => {
    const one = buildExport("json", "en", context);
    const flat = JSON.parse(one.content) as Record<string, string>;
    expect(flat["auth.errors.generic"]).toBeTypeOf("string");
    expect(one.rows).toBe(Object.keys(flat).length);
    const all = JSON.parse(buildExport("json", undefined, context).content);
    expect(Object.keys(all)).toEqual(["nl", "en", "fr"]);
  });

  it("exports CSV with a source column for one non-default language", () => {
    const file = buildExport("csv", "fr", context);
    const [header] = parseCsv(file.content);
    expect(header).toEqual(["key", "source", "fr"]);
    const all = parseCsv(buildExport("csv", undefined, context).content);
    expect(all[0]).toEqual(["key", "nl", "en", "fr"]);
  });

  it("turns an export back into an import with nothing to change", () => {
    for (const format of ["json", "csv"] as const) {
      const file = buildExport(format, "fr", context);
      const entries = parseImport(format, file.content, "fr", enabled);
      const { plan, writes } = planImport(entries, context);
      expect(plan.problemCount, format).toBe(0);
      expect(plan.added + plan.changed, format).toBe(0);
      expect(writes, format).toHaveLength(0);
      expect(plan.unchanged, format).toBeGreaterThan(1000);
    }
  });

  it("plans a change, an addition, and refuses the rest with a reason", () => {
    const entries = [
      { key: "auth.errors.generic", locale: "en", value: "Changed text" },
      { key: "no.such.key", locale: "en", value: "x" },
      { key: "auth.errors.generic", locale: "xx", value: "x" },
      { key: "auth.errors.generic", locale: "en", value: "again" },
      { key: "auth.errors.generic", locale: "fr", value: "" },
    ];
    const { plan, skipped, writes } = planImport(entries, context);
    expect(plan.changed).toBe(1);
    expect(plan.changes[0]).toMatchObject({
      after: "Changed text",
      key: "auth.errors.generic",
      locale: "en",
    });
    expect(plan.problems.map((row) => row.problem).sort()).toEqual([
      "duplicate",
      "unknownKey",
      "unknownLanguage",
    ]);
    expect(skipped).toBe(3);
    expect(writes).toHaveLength(1);
    // The write carries the source hash it was translated from.
    const source = sourceOf(NONE, "nl", infoOf("auth.errors.generic"));
    expect(writes[0]?.sourceHash).toBe(sourceHash(source));
  });

  it("refuses a default-language text that changes the shipped placeholders", () => {
    const { plan, writes } = planImport(
      [
        { key: "kit.stepOf", locale: "nl", value: "Stap" },
        {
          key: "auth.errors.generic",
          locale: "nl",
          value: "Er ging iets mis.",
        },
      ],
      context
    );
    expect(plan.problems.map((row) => row.problem)).toEqual(["placeholders"]);
    expect(writes.map((write) => write.value)).toEqual(["Er ging iets mis."]);
  });

  it("refuses a placeholder mismatch and a too long text", () => {
    const key = "kit.stepOf";
    const { plan, writes } = planImport(
      [
        { key, locale: "en", value: "No placeholders here" },
        { key: "auth.errors.generic", locale: "en", value: "x".repeat(4001) },
      ],
      context
    );
    expect(plan.problems.map((row) => row.problem).sort()).toEqual([
      "placeholders",
      "tooLong",
    ]);
    expect(writes).toHaveLength(0);
  });

  it("refuses files that cannot be read, with a code", () => {
    const code = (run: () => unknown): string => {
      try {
        run();
      } catch (error) {
        if (error instanceof ImportFileError) {
          return error.code;
        }
        throw error;
      }
      return "none";
    };
    expect(code(() => parseImport("json", "{nope", "en", enabled))).toBe(
      "invalidJson"
    );
    expect(code(() => parseImport("json", "[]", "en", enabled))).toBe(
      "invalidJson"
    );
    expect(
      code(() => parseImport("json", '{"a":"b"}', undefined, enabled))
    ).toBe("needsLanguage");
    expect(code(() => parseImport("json", '{"a":1}', "en", enabled))).toBe(
      "unsupportedShape"
    );
    expect(
      code(() => parseImport("json", '{"de":{"a":"b"}}', undefined, enabled))
    ).toBe("unknownLanguage");
    expect(code(() => parseImport("csv", "nl,en\na,b", "en", enabled))).toBe(
      "noKeyColumn"
    );
    expect(
      code(() => parseImport("csv", "key,de\na,b", undefined, enabled))
    ).toBe("unknownLanguage");
    expect(
      code(() => parseImport("csv", "key,source\na,b", undefined, enabled))
    ).toBe("noLanguageColumn");
    expect(code(() => parseImport("csv", 'key,en\na,"b', "en", enabled))).toBe(
      "invalidCsv"
    );
    expect(code(() => parseImport("csv", "key,en\na,b", "de", enabled))).toBe(
      "unknownLanguage"
    );
  });

  it("reads the nested shape of the shipped catalogue", () => {
    const entries = parseImport(
      "json",
      JSON.stringify({ auth: { errors: { generic: "Nested" } } }),
      "en",
      enabled
    );
    expect(entries).toEqual([
      { key: "auth.errors.generic", locale: "en", value: "Nested" },
    ]);
  });

  it("builds a row per key with a cell per language", () => {
    const row = rowOf(NONE, LANGUAGES, "nl", infoOf("auth.errors.generic"));
    expect(Object.keys(row.cells)).toEqual(["nl", "en", "fr"]);
    expect(row.namespace).toBe("auth");
    expect(row.source).not.toBe("");
  });
});
