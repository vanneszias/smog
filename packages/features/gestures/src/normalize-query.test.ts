import { describe, expect, test } from "bun:test";
import { buildFtsQuery, normalizeQuery, searchTokens } from "./normalize-query";

/** A quoted FTS5 string (`""` escapes a quote inside it). */
const QUOTED = /"(?:[^"]|"")*"/g;

/**
 * What is left of an FTS query outside its quoted strings, minus the only
 * syntax it may use: the prefix `*` and the ` AND ` between terms.
 */
function bareSyntax(query: string): string {
  return query
    .replaceAll(QUOTED, "")
    .replaceAll("*", "")
    .replaceAll(" AND ", "");
}

describe("searchTokens", () => {
  test("lowercases, strips accents and splits on non-letters", () => {
    expect(searchTokens("  Café-au-LAIT, s'il vous plaît! ")).toEqual([
      "cafe",
      "au",
      "lait",
      "s",
      "il",
      "vous",
      "plait",
    ]);
  });

  test("keeps digits and letters of any script", () => {
    expect(searchTokens("3D Ølstue ß")).toEqual(["3d", "ølstue", "ß"]);
  });
});

describe("normalizeQuery", () => {
  test("joins the tokens with one space", () => {
    expect(normalizeQuery("  Goede\tMORGEN!!")).toBe("goede morgen");
  });

  test("is empty for whitespace and punctuation only", () => {
    expect(normalizeQuery("")).toBe("");
    expect(normalizeQuery(' " * - ( ) ')).toBe("");
  });
});

describe("buildFtsQuery", () => {
  test("prefix-matches every token, joined by AND", () => {
    expect(buildFtsQuery("goede mor")).toBe('"goede"* AND "mor"*');
  });

  test("normalises accents like the unicode61 tokenizer", () => {
    expect(buildFtsQuery("CAFÉ")).toBe('"cafe"*');
  });

  test('turns "hond" OR -kat* into plain terms, no operators', () => {
    const query = buildFtsQuery('"hond" OR -kat*');
    expect(query).toBe('"hond"* AND "or"* AND "kat"*');
    expect(bareSyntax(query ?? "")).toBe("");
  });

  test("never lets FTS syntax through", () => {
    for (const input of [
      '"',
      '""',
      "*",
      "-hond",
      "(hond",
      "hond)",
      "NEAR(a b)",
      "name:hond",
      "^hond",
      "{name}: x",
      "a + b",
      "NOT kat",
    ]) {
      const query = buildFtsQuery(input);
      if (query !== null) {
        expect(bareSyntax(query)).toBe("");
      }
    }
  });

  test("is null when nothing searchable is left", () => {
    expect(buildFtsQuery("")).toBeNull();
    expect(buildFtsQuery('  " * - (  ')).toBeNull();
  });
});
