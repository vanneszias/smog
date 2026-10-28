import { env } from "cloudflare:workers";
import { PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  type LessonPdfDocumentInput,
  type PdfAssets,
  type PdfRow,
  renderLessonPdfDetailed,
} from "../../../../../pdf/src/index";

/*
 * The lesson engine in the Workers pool (workerd): the same renderer the
 * Bun tests exercise, proving it needs nothing Node-only (task 5a).
 */

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

const assets: PdfAssets = {
  boldFont: fromBase64(env.FONT_BOLD_B64),
  logo: fromBase64(env.LOGO_B64),
  regularFont: fromBase64(env.FONT_REGULAR_B64),
};

function makeRow(index: number, withDrawing: boolean): PdfRow {
  return {
    bw: "de hand beweegt naar boven",
    cNote: "(op lettergrepen)",
    drawings: withDrawing
      ? [{ bytes: fromBase64(env.DRAWING_B64), credit: "Invented", step: 1 }]
      : [],
    fallback: index % 10 === 9,
    hc: "A: C-hand",
    id: `row-${index}`,
    keywords: ["fruit", "peer"],
    note: "Invented note",
    or: "handpalm naar het gezicht",
    pl: "bij de mondhoeken",
    summary: "A: C-hand\nbeweegt naar boven",
    word: `woord ${index}`,
  };
}

function makeDocument(
  template: "participants" | "teachers",
  rows: number,
  drawings: boolean
): LessonPdfDocumentInput {
  return {
    labels: {
      fallbackFootnote: "Tekst in het Nederlands weergegeven.",
      fields: { bw: "BW", c: "C", hc: "HC", or: "OR", pl: "PL" },
      lesson: "Les",
      participantsC: "C:",
    },
    locale: "nl-BE",
    notes: "Invented notes.",
    number: 2,
    sections: [
      {
        rows: Array.from({ length: rows }, (_, i) => makeRow(i, drawings)),
        title: "Sectie 1",
      },
    ],
    template,
    title: "Eten en drinken",
  };
}

describe("the lesson engine in the Workers pool", () => {
  it("renders the teachers' template with metadata", async () => {
    const report = await renderLessonPdfDetailed(
      makeDocument("teachers", 12, false),
      assets
    );
    expect(new TextDecoder().decode(report.bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(report.bytes, { updateMetadata: false });
    expect(pdf.getPageCount()).toBe(report.pageCount);
    expect(pdf.getTitle()).toBe("Les 2 - Eten en drinken");
    expect(pdf.catalog.get(PDFName.of("Lang"))?.toString()).toBe("(nl-BE)");
    expect(report.replacedCharacters).toBe(0);
  });

  it("renders the participants' template with drawings and drops a bad one", async () => {
    const input = makeDocument("participants", 6, true);
    const bad = input.sections[0]?.rows[2];
    if (bad) {
      bad.drawings = [
        {
          bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2]),
          credit: "",
          step: 1,
        },
      ];
    }
    const report = await renderLessonPdfDetailed(input, assets);
    expect(report.droppedDrawings).toEqual(["row-2"]);
    expect(report.pageCount).toBeGreaterThanOrEqual(1);
  });

  it("renders 150 teachers' rows well inside the 25 second budget", async () => {
    const started = performance.now();
    const report = await renderLessonPdfDetailed(
      makeDocument("teachers", 150, false),
      assets
    );
    const elapsed = Math.round(performance.now() - started);
    console.log(
      `[pdf] workerd teachers 150 rows: ${report.pageCount} pages, ${report.bytes.byteLength} bytes, ${elapsed} ms`
    );
    expect(report.pageCount).toBeGreaterThan(10);
    expect(elapsed).toBeLessThan(10_000);
  });

  it("renders 80 participants' rows with drawings well inside the budget", async () => {
    const started = performance.now();
    const report = await renderLessonPdfDetailed(
      makeDocument("participants", 80, true),
      assets
    );
    const elapsed = Math.round(performance.now() - started);
    console.log(
      `[pdf] workerd participants 80 rows with drawings: ${report.pageCount} pages, ${report.bytes.byteLength} bytes, ${elapsed} ms`
    );
    expect(report.droppedDrawings).toEqual([]);
    expect(elapsed).toBeLessThan(15_000);
  });
});
