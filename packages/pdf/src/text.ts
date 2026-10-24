/**
 * Text helpers of the engine: replacing what the font cannot draw, and
 * wrapping to a width with the font's own metrics (no guessing).
 */
import type { PDFFont } from "pdf-lib";

/** What a font can draw plus the width of a string. */
export interface Measurer {
  /** Whether the font has a glyph for this code point. */
  has: (codePoint: number) => boolean;
  width: (text: string, size: number) => number;
}

/** A measurer over an embedded pdf-lib font. */
export function measurerFor(font: PDFFont): Measurer {
  const set = new Set(font.getCharacterSet());
  return {
    has: (codePoint) => set.has(codePoint),
    width: (text, size) => font.widthOfTextAtSize(text, size),
  };
}

/** The glyph that stands in for a character the font lacks. */
const REPLACEMENT_CHAR = "?";

/** Zero-width and invisible format characters and controls (not the line feed). */
function isDropped(codePoint: number): boolean {
  return (
    (codePoint < 0x20 && codePoint !== 0x0a) ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    codePoint === 0xad ||
    (codePoint >= 0x20_0b && codePoint <= 0x20_0f) ||
    (codePoint >= 0x20_28 && codePoint <= 0x20_2e) ||
    (codePoint >= 0x20_60 && codePoint <= 0x20_64) ||
    codePoint === 0xfe_ff
  );
}

/** The Unicode space separators other than the plain and no-break space. */
function isSpaceLike(codePoint: number): boolean {
  return (
    (codePoint >= 0x20_00 && codePoint <= 0x20_0a) ||
    codePoint === 0x20_2f ||
    codePoint === 0x20_5f ||
    codePoint === 0x30_00
  );
}

/** The spaces that must not break a line: figure space, narrow no-break. */
function keepsTogether(codePoint: number): boolean {
  return codePoint === 0x20_07 || codePoint === 0x20_2f;
}

export interface Sanitized {
  /** How many characters were replaced by the question mark. */
  replaced: number;
  text: string;
}

/**
 * Makes a string safe to draw with `measurer`: line breaks become `\n`,
 * tabs a space, invisible characters and controls vanish, and every code
 * point the font lacks (an emoji, a script Figtree does not cover) becomes
 * a question mark, so the export never throws on an unencodable glyph.
 */
export function sanitize(value: string, measurer: Measurer): Sanitized {
  const cleaned = value.replace(/\r\n?/gu, "\n").replace(/\t/gu, " ");
  let replaced = 0;
  let out = "";
  for (const char of cleaned) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (isDropped(codePoint)) {
      continue;
    }
    if (char === "\n" || measurer.has(codePoint)) {
      out += char;
    } else if (isSpaceLike(codePoint)) {
      // Figtree has no narrow no-break space (French typography wants one
      // before "?" and ":"): a space of its own kind stands in, not a "?".
      out += keepsTogether(codePoint) ? "\u00A0" : " ";
    } else {
      out += REPLACEMENT_CHAR;
      replaced += 1;
    }
  }
  return { replaced, text: out };
}

/** Splits a word wider than `maxWidth` into pieces that each fit. */
function breakWord(
  word: string,
  measurer: Measurer,
  size: number,
  maxWidth: number
): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const char of word) {
    if (current && measurer.width(current + char, size) > maxWidth) {
      pieces.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  if (current) {
    pieces.push(current);
  }
  return pieces;
}

/**
 * Wraps `text` (already sanitized) to `maxWidth`: at spaces, at line feeds
 * (a blank line is kept), and inside a word that is wider than the column
 * (a long URL, a German compound). Never returns an empty array.
 */
export function wrapText(
  text: string,
  measurer: Measurer,
  size: number,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      if (word === "") {
        continue;
      }
      const candidate = line ? `${line} ${word}` : word;
      if (measurer.width(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) {
        lines.push(line);
        line = "";
      }
      if (measurer.width(word, size) <= maxWidth) {
        line = word;
        continue;
      }
      const pieces = breakWord(word, measurer, size, maxWidth);
      line = pieces.pop() ?? "";
      lines.push(...pieces);
    }
    lines.push(line);
  }
  return lines.length > 0 ? lines : [""];
}

/** Shortens `line` so that `line + ellipsis` fits `maxWidth`. */
export function withEllipsis(
  line: string,
  measurer: Measurer,
  size: number,
  maxWidth: number
): string {
  const mark = measurer.has(0x20_26) ? "…" : "...";
  let kept = line.trimEnd();
  while (kept && measurer.width(`${kept}${mark}`, size) > maxWidth) {
    kept = kept.slice(0, -1).trimEnd();
  }
  return `${kept}${mark}`;
}
