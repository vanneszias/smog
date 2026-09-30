/**
 * The typo tier's gate and fast path (phase 3 fix wave A, review I1): the
 * server scores the snapshot before the FTS read, so a query with 5 or more
 * in-memory direct matches must skip the Damerau–Levenshtein pass.
 */
import { describe, expect, test } from "bun:test";
import { normalizeQuery } from "./normalize-query";
import {
  countDirectMatches,
  type SearchableGesture,
  typoCandidates,
  typoMatches,
} from "./ranking";

const WORDS = [
  "hond",
  "kat",
  "paard",
  "vogel",
  "appel",
  "banaan",
  "drinken",
  "eten",
  "school",
  "juf",
  "mama",
  "papa",
  "blij",
  "boos",
  "bang",
  "slapen",
];

/** A normalised catalogue of `size` gestures, as the snapshot holds it. */
function catalogue(size: number): SearchableGesture[] {
  return Array.from({ length: size }, (_, index) => {
    const word = WORDS[index % WORDS.length] ?? "x";
    return {
      categories: [`categorie ${index % 40}`, "dieren en eten"],
      id: `g${index}`,
      keywords: [`${word} ${index}`, `woord${index % 97}`, "gebaar"],
      name: `${word} ${Math.floor(index / WORDS.length)}`,
    };
  });
}

/** The median of `runs` timings of `fn`, in ms. */
function median(fn: () => unknown, runs = 7): number {
  const times: number[] = [];
  for (let run = 0; run < runs; run += 1) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(runs / 2)] ?? 0;
}

describe("countDirectMatches", () => {
  test("counts name, keyword and category matches, up to stopAt", () => {
    const pool = catalogue(64);
    expect(countDirectMatches(pool, "hond", { normalized: true })).toBe(4);
    expect(
      countDirectMatches(pool, "gebaar", { normalized: true, stopAt: 5 })
    ).toBe(5);
    expect(countDirectMatches(pool, "hnd", { normalized: true })).toBe(0);
  });
});

describe("typoCandidates", () => {
  test("skips the typo scoring with 5 or more direct matches in the pool", () => {
    const pool = catalogue(64);
    // "kat" names 4 gestures: the tier runs.
    expect(typoCandidates(pool, "kta").length).toBeGreaterThan(0);
    // "dieren" is every gesture's category: at least 5 direct, no typo pass.
    expect(typoCandidates(pool, "dieren")).toEqual([]);
  });

  test("the normalised fast path ranks like the full path", () => {
    const pool = catalogue(300);
    const raw = pool.map((entry) => ({
      ...entry,
      name: entry.name.toUpperCase(),
    }));
    const fast = typoMatches(pool, "paadr", { normalized: true });
    const full = typoMatches(raw, "paadr");
    expect(fast.map((result) => [result.gesture.id, result.score])).toEqual(
      full.map((result) => [result.gesture.id, result.score])
    );
    expect(normalizeQuery(pool[0]?.name ?? "")).toBe(pool[0]?.name ?? "");
  });

  test("CPU budget on 5,000 gestures: the gated path costs a fraction of the typo pass", () => {
    const pool = catalogue(5000);
    // Baseline: the typo pass the server ran on every search before the gate.
    const baseline = median(() => typoMatches(pool, "dieren"));
    const gated = median(() => typoCandidates(pool, "dieren"));
    // Measured (bun, this container): baseline ~160 ms, gated < 1 ms.
    expect(gated).toBeLessThan(baseline / 5);
    // The normalised typo pass (few direct hits) beats the full one.
    const full = median(() => typoMatches(pool, "kta"));
    const fast = median(() => typoMatches(pool, "kta", { normalized: true }));
    expect(fast).toBeLessThan(full);
  });
});
