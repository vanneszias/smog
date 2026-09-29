/**
 * The ranking rules (spec §7.1). The first block is the old
 * `gestureSearchRanking.test.ts` case list, on the new field names.
 */
import { describe, expect, test } from "bun:test";
import {
  damerauLevenshtein,
  FIELD_WEIGHTS,
  MATCH_MULTIPLIERS,
  type Ranked,
  rankGestures,
  type SearchableGesture,
  shouldRunTypoTier,
  similarity,
  typoMatches,
} from "./ranking";

const gestures: SearchableGesture[] = [
  {
    categories: [{ name: "Greetings" }],
    description: "A basic greeting gesture",
    id: "1",
    keywords: ["greeting", "hello"],
    name: "Hallo",
  },
  {
    categories: [{ name: "Polite" }],
    description: "Express gratitude",
    id: "2",
    keywords: ["thank you", "thanks", "gratitude"],
    name: "Bedankt",
  },
  {
    categories: [{ name: "Emergency" }],
    description: "Ask for help or assistance",
    id: "3",
    keywords: ["assistance", "aid"],
    name: "Help",
  },
  {
    categories: [{ name: "People" }],
    description: "Referring to family members",
    id: "4",
    keywords: ["family", "relatives"],
    name: "Familie",
  },
];

function names(results: { gesture: SearchableGesture }[]): string[] {
  return results.map((result) => result.gesture.name);
}

describe("rankGestures (the old case list)", () => {
  test("returns nothing for no candidates", () => {
    expect(rankGestures([], "hello")).toEqual([]);
  });

  test("returns nothing for an empty query (callers show the browse list)", () => {
    expect(rankGestures(gestures, "")).toEqual([]);
    expect(rankGestures(gestures, "   ")).toEqual([]);
  });

  test("finds an exact name match first", () => {
    const [first] = rankGestures(gestures, "Hallo");
    expect(first?.gesture.name).toBe("Hallo");
    expect(first?.matchType).toBe("exact");
    expect(first?.matchedField).toBe("name");
  });

  test("is case-insensitive", () => {
    expect(rankGestures(gestures, "HALLO")).toEqual(
      rankGestures(gestures, "hallo")
    );
  });

  test("finds keyword matches", () => {
    const [first] = rankGestures(gestures, "gratitude");
    expect(first?.gesture.name).toBe("Bedankt");
    expect(first?.matchedField).toBe("keyword");
  });

  test("finds description matches", () => {
    const results = rankGestures(gestures, "members");
    expect(names(results)).toEqual(["Familie"]);
    expect(results[0]?.matchedField).toBe("description");
    expect(results[0]?.matchType).toBe("wordBoundary");
  });

  test("ranks an exact name match above other matches", () => {
    // "help" is Help's name and a word in its description.
    expect(names(rankGestures(gestures, "help"))[0]).toBe("Help");
  });

  test("returns nothing when nothing matches", () => {
    expect(rankGestures(gestures, "zzzznonexistent")).toEqual([]);
    expect(
      rankGestures(gestures, "zzzznonexistent", { typoPool: gestures })
    ).toEqual([]);
  });

  test("finds a minor typo through the typo tier", () => {
    const results = rankGestures(gestures, "Halo", { typoPool: gestures });
    expect(names(results)).toContain("Hallo");
    expect(results.find((r) => r.gesture.name === "Hallo")?.matchType).toBe(
      "fuzzy"
    );
  });
});

describe("rankGestures (spec §7.1 scores)", () => {
  test("score = multiplier × field weight, best field wins", () => {
    const [hallo] = rankGestures(gestures, "hallo");
    expect(hallo?.score).toBe(MATCH_MULTIPLIERS.exact * FIELD_WEIGHTS.name);

    const [greeting] = rankGestures(gestures, "greet");
    // "greeting" (keyword) starts with it, and so does the description word;
    // the keyword weighs more.
    expect(greeting?.matchedField).toBe("keyword");
    expect(greeting?.matchType).toBe("startsWith");
    expect(greeting?.score).toBe(
      MATCH_MULTIPLIERS.startsWith * FIELD_WEIGHTS.keyword
    );

    const [polite] = rankGestures(gestures, "polite");
    expect(polite?.matchedField).toBe("category");
    expect(polite?.score).toBe(
      MATCH_MULTIPLIERS.exact * FIELD_WEIGHTS.category
    );
  });

  test("orders by the tiers: exact, startsWith, word boundary", () => {
    const pool: SearchableGesture[] = [
      { id: "a", name: "Een hond" },
      { id: "b", name: "Hondje" },
      { id: "c", name: "Hond" },
    ];
    const results = rankGestures(pool, "hond");
    expect(names(results)).toEqual(["Hond", "Hondje", "Een hond"]);
    expect(results.map((r) => r.matchType)).toEqual([
      "exact",
      "startsWith",
      "wordBoundary",
    ]);
  });

  test("a word boundary is the start of a word, not the middle", () => {
    expect(rankGestures([{ id: "a", name: "Kinderhond" }], "hond")).toEqual([]);
  });

  test("café and cafe are the same", () => {
    const pool: SearchableGesture[] = [
      { id: "k", keywords: ["café", "espresso"], name: "Koffie" },
    ];
    expect(rankGestures(pool, "cafe")).toEqual(rankGestures(pool, "café"));
    expect(rankGestures(pool, "CAFE")[0]?.matchType).toBe("exact");
  });

  test('ties are sorted by name with localeCompare("nl")', () => {
    const pool: SearchableGesture[] = [
      "Zus",
      "één",
      "Eend",
      "appel",
      "Bal",
    ].map((name, index) => ({ id: String(index), keywords: ["dier"], name }));
    const expected = pool
      .map((gesture) => gesture.name)
      .sort((a, b) => a.localeCompare(b, "nl"));
    expect(names(rankGestures(pool, "dier"))).toEqual(expected);
    // Not code-unit order, where "één" sorts after "Zus".
    expect(expected).not.toEqual(pool.map((g) => g.name).sort());
  });

  test("multi-word prefixes match within one value", () => {
    const pool: SearchableGesture[] = [
      { id: "d", keywords: ["tot ziens", "daag"], name: "Dag" },
    ];
    const [result] = rankGestures(pool, "tot zie");
    expect(result?.matchType).toBe("startsWith");
    expect(result?.matchedField).toBe("keyword");
  });

  test("words in any order or field still match, scored by the weakest", () => {
    const pool: SearchableGesture[] = [
      {
        description: "Een hond.",
        id: "h",
        keywords: ["huisdier"],
        name: "Hond",
      },
    ];
    const [spread] = rankGestures(pool, "huisdier hond");
    expect(spread?.matchType).toBe("wordBoundary");
    expect(spread?.matchedField).toBe("keyword");
    expect(spread?.score).toBe(
      MATCH_MULTIPLIERS.wordBoundary * FIELD_WEIGHTS.keyword
    );
    expect(rankGestures(pool, "hond kat")).toEqual([]);
  });

  test("category names may be strings or { name } objects", () => {
    const withoutGesture = ({ gesture: _, ...match }: Ranked<unknown>) => match;
    const asStrings = rankGestures(
      [{ categories: ["Dieren"], id: "x", name: "Hond" }],
      "dieren"
    ).map(withoutGesture);
    const asObjects = rankGestures(
      [{ categories: [{ name: "Dieren" }], id: "x", name: "Hond" }],
      "dieren"
    ).map(withoutGesture);
    expect(asStrings).toEqual(asObjects);
    expect(asStrings[0]?.matchedField).toBe("category");
  });

  test("returns the candidate objects themselves", () => {
    const pool = [{ extra: 1, id: "a", name: "Hond" }];
    expect(rankGestures(pool, "hond")[0]?.gesture).toBe(pool[0]);
  });
});

describe("typo tier", () => {
  const hond: SearchableGesture = {
    categories: ["Dieren"],
    id: "hond",
    keywords: ["hondje", "huisdier"],
    name: "Hond",
  };

  test("hnd finds hond at similarity ≥ 0.6", () => {
    expect(similarity("hnd", "hond")).toBeGreaterThanOrEqual(0.6);
    const [result] = typoMatches([hond], "hnd");
    expect(result?.gesture.id).toBe("hond");
    expect(result?.matchType).toBe("fuzzy");
    expect(result?.matchedField).toBe("name");
    expect(result?.score).toBe(
      MATCH_MULTIPLIERS.fuzzy * FIELD_WEIGHTS.name * similarity("hnd", "hond")
    );
  });

  test("compares against whole values and each of their words", () => {
    const [result] = typoMatches(
      [{ id: "d", keywords: ["tot ziens"], name: "Dag" }],
      "zeins"
    );
    expect(result?.matchedField).toBe("keyword");
  });

  test("does not run for queries under 3 characters", () => {
    expect(typoMatches([hond], "hn")).toEqual([]);
    expect(shouldRunTypoTier(0, "hn")).toBe(false);
    expect(shouldRunTypoTier(0, "hnd")).toBe(true);
    expect(rankGestures([hond], "hn", { typoPool: [hond] })).toEqual([]);
  });

  test("runs only with fewer than 5 direct results", () => {
    expect(shouldRunTypoTier(4, "hond")).toBe(true);
    expect(shouldRunTypoTier(5, "hond")).toBe(false);
    const pool: SearchableGesture[] = [
      ...["a", "b", "c", "d", "e"].map((id) => ({
        id,
        keywords: ["poes"],
        name: `Kat ${id}`,
      })),
      { id: "typo", name: "Poez" },
    ];
    expect(
      rankGestures(pool, "poes", { typoPool: pool }).map((r) => r.gesture.id)
    ).not.toContain("typo");
  });

  test("appends typo matches after direct ones, without duplicates", () => {
    const pool: SearchableGesture[] = [
      { id: "1", name: "Hond" },
      { id: "2", name: "Hont" },
    ];
    const results = rankGestures(pool, "hond", { typoPool: pool });
    expect(results.map((r) => [r.gesture.id, r.matchType])).toEqual([
      ["1", "exact"],
      ["2", "fuzzy"],
    ]);
  });

  test("ignores the description and values that are too far off", () => {
    expect(
      typoMatches([{ description: "hnod", id: "x", name: "Kat" }], "hond")
    ).toEqual([]);
    expect(typoMatches([{ id: "x", name: "Olifant" }], "hond")).toEqual([]);
  });

  test("skips excluded ids", () => {
    expect(typoMatches([hond], "hnd", { exclude: new Set(["hond"]) })).toEqual(
      []
    );
  });
});

describe("damerauLevenshtein", () => {
  test("counts insertions, deletions, substitutions and transpositions", () => {
    expect(damerauLevenshtein("hond", "hond")).toBe(0);
    expect(damerauLevenshtein("hnd", "hond")).toBe(1);
    expect(damerauLevenshtein("hondd", "hond")).toBe(1);
    expect(damerauLevenshtein("hont", "hond")).toBe(1);
    expect(damerauLevenshtein("hnod", "hond")).toBe(1);
    expect(damerauLevenshtein("", "abc")).toBe(3);
    expect(damerauLevenshtein("kat", "hond")).toBe(4);
  });

  test("similarity is 1 − distance / longest length", () => {
    expect(similarity("hnd", "hond")).toBe(0.75);
    expect(similarity("", "")).toBe(1);
  });
});
