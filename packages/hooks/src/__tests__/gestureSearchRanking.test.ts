/**
 * @fileoverview Tests for the gesture search ranking algorithm.
 *
 * Run with: bun -F @smog/hooks test (after adding vitest to the package)
 */

import { describe, expect, it } from "vitest";
import type { SearchableGesture } from "../gestureSearchRanking";
import { searchGestures } from "../gestureSearchRanking";

const gestures: SearchableGesture[] = [
  {
    _id: "1",
    name: "Hallo",
    concept: ["greeting", "hello"],
    info: "A basic greeting gesture",
    categories: [{ _id: "c1", name: "Greetings" }],
  },
  {
    _id: "2",
    name: "Bedankt",
    concept: ["thank you", "thanks", "gratitude"],
    info: "Express gratitude",
    categories: [{ _id: "c2", name: "Polite" }],
  },
  {
    _id: "3",
    name: "Help",
    concept: ["assistance", "aid"],
    info: "Ask for help or assistance",
    categories: [{ _id: "c3", name: "Emergency" }],
  },
  {
    _id: "4",
    name: "Familie",
    concept: ["family", "relatives"],
    info: "Referring to family members",
    categories: [{ _id: "c4", name: "People" }],
  },
];

describe("searchGestures", () => {
  it("returns empty array for empty gesture list", () => {
    expect(searchGestures([], "hello")).toEqual([]);
  });

  it("returns empty array for empty query (callers should show all gestures when query is empty)", () => {
    // searchGestures is only called when there's a query; callers handle the empty case
    expect(searchGestures(gestures, "")).toHaveLength(0);
  });

  it("finds exact name match", () => {
    const results = searchGestures(gestures, "Hallo");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.name).toBe("Hallo");
  });

  it("is case-insensitive", () => {
    const upper = searchGestures(gestures, "HALLO");
    const lower = searchGestures(gestures, "hallo");
    expect(upper.length).toBe(lower.length);
    expect(upper[0]?.name).toBe(lower[0]?.name);
  });

  it("finds matches by concept", () => {
    const results = searchGestures(gestures, "gratitude");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.name).toBe("Bedankt");
  });

  it("finds matches by info text", () => {
    const results = searchGestures(gestures, "assistance");
    expect(results.length).toBeGreaterThan(0);
    const names = results.map((r) => r.name);
    expect(names).toContain("Help");
  });

  it("ranks exact name match above concept match", () => {
    // "help" is both in the name and concept of different gestures
    const results = searchGestures(gestures, "help");
    expect(results[0]?.name).toBe("Help");
  });

  it("returns empty array for query with no matches", () => {
    const results = searchGestures(gestures, "zzzznonexistent");
    expect(results).toHaveLength(0);
  });

  it("supports fuzzy matching for minor typos", () => {
    // "Halo" vs "Hallo" — one missing character
    const results = searchGestures(gestures, "Halo");
    // Should still find "Hallo" via fuzzy
    const names = results.map((r) => r.name);
    expect(names).toContain("Hallo");
  });
});
