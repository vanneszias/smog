import { describe, expect, test } from "bun:test";
import {
  InputError,
  parseCsv,
  parseMuxMap,
  parseOverlayOverrides,
  parseWorkosUsers,
} from "../src/core/inputs";

describe("the WorkOS users file", () => {
  const expected = [
    {
      email: "ada@example.test",
      firstName: "Ada",
      id: "user_01",
      lastName: "Fixture",
    },
    { email: null, firstName: null, id: "user_02", lastName: null },
  ];

  test("reads a JSON array and a list response", () => {
    const rows = [
      {
        email: "ada@example.test",
        first_name: "Ada",
        id: "user_01",
        last_name: "Fixture",
        object: "user",
      },
      { email: null, first_name: "", id: "user_02" },
    ];
    expect(parseWorkosUsers(JSON.stringify(rows))).toEqual(expected);
    expect(
      parseWorkosUsers(JSON.stringify({ data: rows, list_metadata: {} }))
    ).toEqual(expected);
  });

  test("reads a CSV in any column order, with quotes, CRLF and a BOM", () => {
    const csv = `${String.fromCharCode(0xfe_ff)}email,id,last_name,first_name,created_at\r\nada@example.test,user_01,"Fixture",Ada,2025-01-01\r\n,user_02,,,\r\n\r\n`;
    expect(parseWorkosUsers(csv)).toEqual(expected);
  });

  test("refuses a CSV without a column, a ragged row and a repeated id", () => {
    expect(() =>
      parseWorkosUsers("id,email\nuser_01,a@example.test\n")
    ).toThrow("lacks the column(s) first_name, last_name");
    expect(() =>
      parseWorkosUsers(
        "id,email,first_name,last_name\nuser_01,a@example.test\n"
      )
    ).toThrow("row 2 has 2 fields");
    expect(() =>
      parseWorkosUsers(JSON.stringify([{ id: "user_01" }, { id: "user_01" }]))
    ).toThrow("repeats the id user_01");
    expect(() => parseWorkosUsers("[{]")).toThrow(InputError);
  });

  test("parseCsv handles quoted commas, quotes and line breaks", () => {
    expect(parseCsv('a,"b,c","d ""e""","f\ng"\n')).toEqual([
      ["a", "b,c", 'd "e"', "f\ng"],
    ]);
    expect(() => parseCsv('a,"b')).toThrow("ends inside a quoted field");
    expect(parseCsv("a,\r\nb,c")).toEqual([
      ["a", ""],
      ["b", "c"],
    ]);
    expect(parseCsv("a,")).toEqual([["a", ""]]);
    expect(parseCsv("")).toEqual([]);
  });
});

describe("mux-map.json", () => {
  test("maps playback ids to assets and rendition states, sorted", () => {
    const map = parseMuxMap(
      JSON.stringify({
        pbA: { assetId: "asset-a", renditions: "ready" },
        pbB: { assetId: "asset-b" },
      })
    );
    expect([...map]).toEqual([
      ["pbA", { assetId: "asset-a", renditions: "ready" }],
      ["pbB", { assetId: "asset-b" }],
    ]);
  });

  test("refuses an entry without an asset id or with an unknown state", () => {
    expect(() => parseMuxMap(JSON.stringify({ pb: {} }))).toThrow("pb.assetId");
    expect(() =>
      parseMuxMap(JSON.stringify({ pb: { assetId: "a", renditions: "done" } }))
    ).toThrow("pb.renditions");
    expect(() => parseMuxMap("nope")).toThrow(
      "mux-map.json is not valid JSON."
    );
  });
});

describe("overlay-overrides.json", () => {
  test("accepts 1..35 characters, trimmed", () => {
    const map = parseOverlayOverrides(
      JSON.stringify({ s1: "x".repeat(35), s2: "  Bakkerij  " })
    );
    expect([...map]).toEqual([
      ["s1", "x".repeat(35)],
      ["s2", "Bakkerij"],
    ]);
  });

  test("refuses an override over 35 characters, an empty one and a line break, naming the id only", () => {
    for (const value of ["y".repeat(36), "   ", "two\nlines"]) {
      let error: unknown;
      try {
        parseOverlayOverrides(JSON.stringify({ ks7long: value }));
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(InputError);
      expect((error as Error).message).toContain("ks7long");
      expect((error as Error).message).not.toContain(value.trim() || "\u0000");
    }
  });
});
