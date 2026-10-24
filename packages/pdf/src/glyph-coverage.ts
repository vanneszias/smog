/**
 * Which characters the shipped Figtree covers, without loading the font
 * (phase 10c review fix wave, B-m2). The export dialog warns before the
 * download when a lesson prints text the PDF would replace by question marks
 * (an emoji, Arabic, Cyrillic, CJK: languages are data, an admin can add any).
 * The ranges are the code points both Figtree files have; `glyph-coverage.test.ts`
 * compares them with the real fonts, so a font update that changes coverage
 * fails there. Pure and free of `pdf-lib`: `@smog/lessons` imports it as
 * `@smog/pdf/coverage`.
 */
import { sanitize } from "./text";

/** Inclusive code point ranges both `Figtree-Regular.ttf` and `Figtree-Bold.ttf` hold (U+0020 up to U+FFFF). */
const RANGES: readonly (readonly [number, number])[] = [
  [0x20, 0x7e],
  [0xa0, 0xac],
  [0xae, 0x113],
  [0x116, 0x127],
  [0x12a, 0x12b],
  [0x12e, 0x137],
  [0x139, 0x13e],
  [0x141, 0x148],
  [0x14a, 0x14d],
  [0x150, 0x161],
  [0x164, 0x165],
  [0x16a, 0x17e],
  [0x1cd, 0x1ce],
  [0x218, 0x21b],
  [0x237, 0x237],
  [0x2c6, 0x2c7],
  [0x2d8, 0x2dd],
  [0x300, 0x304],
  [0x306, 0x308],
  [0x30a, 0x30c],
  [0x312, 0x312],
  [0x326, 0x328],
  [0x1e80, 0x1e85],
  [0x1e9e, 0x1e9e],
  [0x1ef2, 0x1ef3],
  [0x2013, 0x2014],
  [0x2018, 0x201a],
  [0x201c, 0x201e],
  [0x2020, 0x2022],
  [0x2026, 0x2026],
  [0x2039, 0x203a],
  [0x2044, 0x2044],
  [0x2070, 0x2070],
  [0x2074, 0x2079],
  [0x2080, 0x2089],
  [0x20ac, 0x20ac],
  [0x20b9, 0x20b9],
  [0x2122, 0x2122],
  [0x215b, 0x215e],
  [0x2190, 0x2193],
  [0x2196, 0x2199],
  [0x2212, 0x2212],
  [0x2215, 0x2215],
  [0x2260, 0x2260],
  [0x2264, 0x2265],
];

/** Whether Figtree has a glyph for the code point. */
export function figtreeHas(codePoint: number): boolean {
  return RANGES.some(([from, to]) => codePoint >= from && codePoint <= to);
}

/** How many characters of `text` the PDF would print as a question mark (the engine's own rule: spaces and invisible characters are not counted). */
export function unsupportedCharacterCount(text: string): number {
  return sanitize(text, { has: figtreeHas, width: () => 0 }).replaced;
}
