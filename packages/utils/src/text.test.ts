import { describe, expect, it } from "bun:test";
import { normalizeText, slugify } from "./text";

describe("normalizeText", () => {
  it("strips accents, lowercases and collapses whitespace", () => {
    expect(normalizeText("  Café  Crème ")).toBe("cafe creme");
  });

  it("collapses tabs and newlines", () => {
    expect(normalizeText("Hallo\n\t Wereld")).toBe("hallo wereld");
  });

  it("keeps non-Latin letters", () => {
    expect(normalizeText("Ça Ölçü")).toBe("ca olcu");
  });
});

describe("slugify", () => {
  it("joins words with dashes and drops punctuation", () => {
    expect(slugify("Goedemorgen!  Hoe gaat 't?")).toBe(
      "goedemorgen-hoe-gaat-t"
    );
  });

  it("strips accents", () => {
    expect(slugify("Crème brûlée")).toBe("creme-brulee");
  });

  it("trims leading and trailing dashes", () => {
    expect(slugify("--Hallo--")).toBe("hallo");
  });

  it("is at most 80 characters and does not end with a dash", () => {
    const slug = slugify(`${"a".repeat(79)} b`);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug).toBe("a".repeat(79));
  });

  it("returns an empty string for input without letters or digits", () => {
    expect(slugify("?!")).toBe("");
  });
});
