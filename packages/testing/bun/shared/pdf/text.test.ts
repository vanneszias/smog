import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import {
  type Measurer,
  measurerFor,
  sanitize,
  withEllipsis,
  wrapText,
} from "../../../../pdf/src/text";

/** A fixed-width measurer: every character is 10 points at size 10. */
const mono: Measurer = {
  has: (codePoint) => codePoint < 0x2_50 || codePoint === 0x20_26,
  width: (text, size) => [...text].length * size,
};

const ASSETS = new URL("../../../../pdf/assets/", import.meta.url).pathname;

describe("sanitize", () => {
  test("normalises line breaks and tabs, drops controls and invisible characters", () => {
    const result = sanitize("a\r\nb\rc\td\u0000e​f­g h", mono);
    expect(result).toEqual({ replaced: 0, text: "a\nb\nc defgh" });
  });

  test("a space Figtree lacks becomes a space, not a question mark", () => {
    const narrow = { ...mono, has: (codePoint: number) => codePoint < 0x2_50 };
    expect(sanitize("Quoi\u202F? a\u2009b", narrow)).toEqual({
      replaced: 0,
      text: "Quoi\u00A0? a b",
    });
  });

  test("replaces unavailable code points one for one, astral ones included", () => {
    const result = sanitize("a\u{1F600}b你", mono);
    expect(result).toEqual({ replaced: 2, text: "a?b?" });
  });
});

describe("wrapText", () => {
  test("wraps at spaces", () => {
    expect(wrapText("aa bb cc dd", mono, 10, 50)).toEqual(["aa bb", "cc dd"]);
  });

  test("keeps blank lines and never returns nothing", () => {
    expect(wrapText("a\n\nb", mono, 10, 100)).toEqual(["a", "", "b"]);
    expect(wrapText("", mono, 10, 100)).toEqual([""]);
  });

  test("breaks a word wider than the column", () => {
    expect(wrapText("abcdefgh", mono, 10, 30)).toEqual(["abc", "def", "gh"]);
  });

  test("a long word after text starts on its own line", () => {
    expect(wrapText("x abcdefg", mono, 10, 30)).toEqual([
      "x",
      "abc",
      "def",
      "g",
    ]);
  });

  test("collapses runs of spaces", () => {
    expect(wrapText("a   b", mono, 10, 100)).toEqual(["a b"]);
  });
});

describe("withEllipsis", () => {
  test("shortens until the line and the mark fit", () => {
    expect(withEllipsis("abcdef", mono, 10, 40)).toBe("abc…");
  });
});

describe("Figtree", () => {
  test("has every glyph the PDFs print", async () => {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(
      readFileSync(`${ASSETS}Figtree-Regular.ttf`),
      {
        subset: true,
      }
    );
    const measurer = measurerFor(font);
    const wanted = [
      0x20_20, 0xa9, 0x20_22, 0x20_26, 0xb0, 0x20_19, 0x20_1c, 0x20_1d, 0xe9,
      0xe8, 0xea, 0xe7, 0xef, 0x1_53, 0xa0, 0xab, 0xbb, 0x20_13, 0x20_14,
    ];
    for (const codePoint of wanted) {
      expect(measurer.has(codePoint), codePoint.toString(16)).toBe(true);
    }
  });
});

describe("bundled assets", () => {
  test("the logo is a PNG of at most 256 px on a side", () => {
    const bytes = readFileSync(`${ASSETS}logo.png`);
    expect(bytes.subarray(1, 4).toString("latin1")).toBe("PNG");
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    expect(Math.max(width, height)).toBeLessThanOrEqual(256);
    expect(bytes.byteLength).toBeLessThan(20_000);
  });

  test("the font licence ships next to the fonts", () => {
    expect(readFileSync(`${ASSETS}OFL.txt`, "utf8")).toContain(
      "SIL OPEN FONT LICENSE"
    );
  });
});
