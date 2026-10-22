import { describe, expect, test } from "bun:test";
import { isLocalizedQuery } from "./locale-queries";

describe("isLocalizedQuery", () => {
  test("the catalogue and what embeds its summaries are in the viewer's language", () => {
    for (const path of [
      ["gestures", "list"],
      ["gestures", "bySlug"],
      ["favorites", "list"],
      ["lists", "mine"],
    ]) {
      expect(
        isLocalizedQuery({ queryKey: [path, { input: {}, type: "query" }] })
      ).toBe(true);
    }
  });

  test("everything else keeps its cache", () => {
    for (const path of [
      ["system", "whoami"],
      ["account", "me"],
      ["admin", "gestures", "list"],
    ]) {
      expect(isLocalizedQuery({ queryKey: [path, { type: "query" }] })).toBe(
        false
      );
    }
    expect(isLocalizedQuery({ queryKey: ["unrelated"] })).toBe(false);
    expect(isLocalizedQuery({ queryKey: [] })).toBe(false);
  });
});
