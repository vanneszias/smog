import { describe, expect, it } from "vitest";
import {
  categoryFixtures,
  gestureFixtures,
  SEED_PLAYBACK_ID,
} from "./fixtures";

describe("seed fixtures", () => {
  it("provides at least three categories", () => {
    expect(categoryFixtures.length).toBeGreaterThanOrEqual(3);
  });

  it("provides at least twenty gestures, enough to exercise pagination", () => {
    expect(gestureFixtures.length).toBeGreaterThanOrEqual(20);
  });

  it("gives every gesture a category that exists", () => {
    const names = new Set(categoryFixtures.map((c) => c.name));
    for (const gesture of gestureFixtures) {
      for (const category of gesture.categories) {
        expect(names).toContain(category);
      }
    }
  });

  it("gives every gesture a playback id", () => {
    for (const gesture of gestureFixtures) {
      expect(gesture.playbackId).toBeTruthy();
    }
  });

  it("includes at least one inactive gesture, so access control is exercised", () => {
    expect(gestureFixtures.some((g) => g.isActive === false)).toBe(true);
  });

  it("reuses one real Mux playback id everywhere, so seeded videos actually play", () => {
    for (const gesture of gestureFixtures) {
      expect(gesture.playbackId).toBe(SEED_PLAYBACK_ID);
    }
  });

  it("gives every gesture at least one concept synonym for search to match on", () => {
    for (const gesture of gestureFixtures) {
      expect(gesture.concepts.length).toBeGreaterThan(0);
    }
  });

  // The seed upserts on these names. Two fixtures sharing one would make the
  // second silently overwrite the first instead of adding a document, and the
  // count assertions in seed.int.test.ts would be the only thing to notice.
  it("keeps every gesture name unique, since the seed upserts on it", () => {
    const names = gestureFixtures.map((g) => g.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("keeps every category name unique, since the seed upserts on it", () => {
    const names = categoryFixtures.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("includes a deliberately long name to stress card layouts", () => {
    expect(gestureFixtures.some((g) => g.name.length >= 30)).toBe(true);
  });

  it("includes a gesture filed under more than one category", () => {
    expect(gestureFixtures.some((g) => g.categories.length > 1)).toBe(true);
  });

  it("translates at least one gesture into English and at least one into French", () => {
    expect(gestureFixtures.some((g) => g.translations?.en)).toBe(true);
    expect(gestureFixtures.some((g) => g.translations?.fr)).toBe(true);
  });

  it("leaves several gestures untranslated, so locale fallback is exercised too", () => {
    const untranslated = gestureFixtures.filter((g) => !g.translations);
    expect(untranslated.length).toBeGreaterThanOrEqual(5);
  });

  it("translates every category, since a category list is the first thing a locale switch shows", () => {
    for (const category of categoryFixtures) {
      expect(category.translations?.en?.name).toBeTruthy();
      expect(category.translations?.fr?.name).toBeTruthy();
    }
  });

  it("never leaves a Dutch name blank, which the defaultLocaleRequired validator would reject", () => {
    for (const gesture of gestureFixtures) {
      expect(gesture.name.trim()).not.toBe("");
    }
    for (const category of categoryFixtures) {
      expect(category.name.trim()).not.toBe("");
    }
  });
});
