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
  [0xae, 0x1_13],
  [0x1_16, 0x1_27],
  [0x1_2a, 0x1_2b],
  [0x1_2e, 0x1_37],
  [0x1_39, 0x1_3e],
  [0x1_41, 0x1_48],
  [0x1_4a, 0x1_4d],
  [0x1_50, 0x1_61],
  [0x1_64, 0x1_65],
  [0x1_6a, 0x1_7e],
  [0x1_cd, 0x1_ce],
  [0x2_18, 0x2_1b],
  [0x2_37, 0x2_37],
  [0x2_c6, 0x2_c7],
  [0x2_d8, 0x2_dd],
  [0x3_00, 0x3_04],
  [0x3_06, 0x3_08],
  [0x3_0a, 0x3_0c],
  [0x3_12, 0x3_12],
  [0x3_26, 0x3_28],
  [0x1e_80, 0x1e_85],
  [0x1e_9e, 0x1e_9e],
  [0x1e_f2, 0x1e_f3],
  [0x20_13, 0x20_14],
  [0x20_18, 0x20_1a],
  [0x20_1c, 0x20_1e],
  [0x20_20, 0x20_22],
  [0x20_26, 0x20_26],
  [0x20_39, 0x20_3a],
  [0x20_44, 0x20_44],
  [0x20_70, 0x20_70],
  [0x20_74, 0x20_79],
  [0x20_80, 0x20_89],
  [0x20_ac, 0x20_ac],
  [0x20_b9, 0x20_b9],
  [0x21_22, 0x21_22],
  [0x21_5b, 0x21_5e],
  [0x21_90, 0x21_93],
  [0x21_96, 0x21_99],
  [0x22_12, 0x22_12],
  [0x22_15, 0x22_15],
  [0x22_60, 0x22_60],
  [0x22_64, 0x22_65],
];

/** Whether Figtree has a glyph for the code point. */
export function figtreeHas(codePoint: number): boolean {
  return RANGES.some(([from, to]) => codePoint >= from && codePoint <= to);
}

/** How many characters of `text` the PDF would print as a question mark (the engine's own rule: spaces and invisible characters are not counted). */
export function unsupportedCharacterCount(text: string): number {
  return sanitize(text, { has: figtreeHas, width: () => 0 }).replaced;
}
