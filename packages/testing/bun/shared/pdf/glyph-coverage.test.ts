import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import fontkit from "@pdf-lib/fontkit";
import {
  figtreeHas,
  unsupportedCharacterCount,
} from "../../../../pdf/src/glyph-coverage";

const ASSETS = new URL("../../../../pdf/assets/", import.meta.url).pathname;

interface Face {
  hasGlyphForCodePoint: (codePoint: number) => boolean;
}

function face(file: string): Face {
  return fontkit.create(readFileSync(`${ASSETS}${file}`)) as unknown as Face;
}

describe("glyph coverage", () => {
  test("the ranges are exactly what both shipped Figtree files hold", () => {
    const regular = face("Figtree-Regular.ttf");
    const bold = face("Figtree-Bold.ttf");
    const wrong: string[] = [];
    for (let codePoint = 0x20; codePoint < 0x1_00_00; codePoint += 1) {
      const real =
        regular.hasGlyphForCodePoint(codePoint) &&
        bold.hasGlyphForCodePoint(codePoint);
      if (real !== figtreeHas(codePoint)) {
        wrong.push(codePoint.toString(16));
      }
    }
    expect(wrong).toEqual([]);
  });

  test("counts what the PDF would print as a question mark", () => {
    expect(unsupportedCharacterCount("Hallo, œuf, straße, « ça »")).toBe(0);
    expect(unsupportedCharacterCount("Quoi ? a b​")).toBe(0);
    expect(unsupportedCharacterCount("مرحبا")).toBe(5);
    expect(unsupportedCharacterCount("hi 😀 привет")).toBe(7);
  });
});
