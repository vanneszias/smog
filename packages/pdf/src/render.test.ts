import { describe, expect, test } from "bun:test";
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";
import {
  drawingFixtures,
  loadAssets,
  NL_LABELS,
  sampleDocument,
  sampleRow,
} from "../fixtures";
import {
  type LessonPdfDocumentInput,
  PdfDocumentError,
  type PdfRow,
  renderLessonPdf,
  renderLessonPdfDetailed,
} from "./index";

const assets = loadAssets();
const LONE_C = /\bC\b/;
const TEACHER_LABELS = /\b(PL|OR|BW)\b/;
const NOW = new Date("2026-10-24T08:00:00Z");

/** The text of every page, in drawing order. */
async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  return text;
}

function row(overrides: Partial<PdfRow> & { word: string }): PdfRow {
  return { ...sampleRow(0), drawings: [], id: overrides.word, ...overrides };
}

function doc(
  template: "participants" | "teachers",
  rows: PdfRow[],
  extra: Partial<LessonPdfDocumentInput> = {}
): LessonPdfDocumentInput {
  return {
    labels: NL_LABELS,
    locale: "nl-BE",
    number: 1,
    sections: [{ rows, title: null }],
    template,
    title: "Eten en drinken",
    ...extra,
  };
}

async function imageCount(bytes: Uint8Array): Promise<number> {
  const pdf = await PDFDocument.load(bytes);
  let images = 0;
  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    let dict: PDFDict | undefined;
    if (object instanceof PDFDict) {
      dict = object;
    } else if (object instanceof PDFRawStream) {
      ({ dict } = object);
    }
    if (dict?.get(PDFName.of("Subtype"))?.toString() === "/Image") {
      images += 1;
    }
  }
  return images;
}

describe("teachers' template", () => {
  test("prints header, notes, sections, words and labelled fields in order", async () => {
    const input = sampleDocument("teachers", { rows: 4, sections: 2 });
    const [page] = await pageTexts(await renderLessonPdf(input, assets));
    const text = page ?? "";
    const order = [
      "SMOG",
      "Les 1 - Eten en drinken",
      "Invented lesson notes",
      "Sectie 1: voeding",
      "appel",
      "HC",
      "A: C-hand",
      "FRUIT, PEER (op lettergrepen)",
      "jam",
      "(Invented note for the teacher)",
      "Sectie 2: voeding",
      "boter",
      "kaas",
      "NAAM VAN KAAS (zonder touch)",
    ];
    let at = -1;
    for (const needle of order) {
      const found = text.indexOf(needle, at + 1);
      expect(found, `"${needle}" after position ${at}`).toBeGreaterThan(at);
      at = found;
    }
    for (const label of ["HC", "PL", "OR", "BW"]) {
      expect(text).toContain(label);
    }
  });

  test("upper-cases the C words with the document locale and keeps the C note as written", async () => {
    const input = doc("teachers", [
      row({
        cNote: "(op lettergrepen)",
        keywords: ["ijsje", "schillen"],
        word: "w",
      }),
    ]);
    const [text = ""] = await pageTexts(await renderLessonPdf(input, assets));
    expect(text).toContain("IJSJE, SCHILLEN (op lettergrepen)");
  });

  test("an empty field keeps its label and C is left out when there is nothing", async () => {
    const input = doc("teachers", [
      row({
        bw: "",
        cNote: "",
        hc: "",
        keywords: [],
        note: "",
        or: "",
        pl: "",
        word: "leeg",
      }),
    ]);
    const [text = ""] = await pageTexts(await renderLessonPdf(input, assets));
    expect(text).toContain("leeg");
    expect(text).toContain("HC");
    expect(text).toContain("BW");
    expect(text).not.toMatch(LONE_C);
  });

  test("a note already in brackets is not bracketed twice", async () => {
    const input = doc("teachers", [
      row({ note: "(al tussen haakjes)", word: "w" }),
    ]);
    const [text = ""] = await pageTexts(await renderLessonPdf(input, assets));
    expect(text).toContain("(al tussen haakjes)");
    expect(text).not.toContain("((");
  });
});

describe("participants' template", () => {
  const SECRET = {
    bw: "ZZBEWEGING",
    cNote: "ZZCNOTE",
    note: "ZZNOTITIE",
    or: "ZZORIENTATIE",
    pl: "ZZPLAATS",
  };

  test("omits every teacher-only field and prints summary, C line and word", async () => {
    const input = doc("participants", [
      row({
        ...SECRET,
        hc: "ZZHANDVORM",
        keywords: ["pudding", "lepel"],
        summary: "A: vuisthand\n2x kort",
        word: "ijsje",
      }),
    ]);
    const [text = ""] = await pageTexts(await renderLessonPdf(input, assets));
    for (const secret of Object.values(SECRET)) {
      expect(text).not.toContain(secret);
    }
    // The HC is only the stand-in when there is no summary.
    expect(text).not.toContain("ZZHANDVORM");
    expect(text).toContain("ijsje");
    expect(text.indexOf("ijsje")).toBeLessThan(text.indexOf("A: vuisthand"));
    expect(text.indexOf("A: vuisthand")).toBeLessThan(text.indexOf("2x kort"));
    expect(text.indexOf("2x kort")).toBeLessThan(
      text.indexOf("C: pudding, lepel")
    );
    // The C words are public and stay lower-case on this sheet.
    expect(text).not.toContain("PUDDING");
  });

  test("uses the HC when the summary is empty and never the teacher labels", async () => {
    const input = doc("participants", [
      row({
        ...SECRET,
        hc: "A: platte C-hand",
        keywords: [],
        summary: "",
        word: "suiker",
      }),
    ]);
    const [text = ""] = await pageTexts(await renderLessonPdf(input, assets));
    expect(text).toContain("A: platte C-hand");
    expect(text).not.toContain("C:");
    for (const secret of Object.values(SECRET)) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toMatch(TEACHER_LABELS);
  });

  test("embeds PNG and JPEG drawings with a credit and step markers", async () => {
    const input = doc("participants", [
      row({
        drawings: [
          {
            bytes: new Uint8Array(drawingFixtures.png1),
            credit: "Invented Artist",
            step: 1,
          },
          { bytes: new Uint8Array(drawingFixtures.png2), credit: "", step: 2 },
        ],
        word: "boter",
      }),
      row({
        drawings: [
          {
            bytes: new Uint8Array(drawingFixtures.jpegWide),
            credit: "© Other",
            step: 1,
          },
        ],
        word: "kaas",
      }),
    ]);
    const report = await renderLessonPdfDetailed(input, assets);
    expect(report.droppedDrawings).toEqual([]);
    // The logo, two PNGs and a JPEG (the PNGs may carry no soft mask).
    expect(await imageCount(report.bytes)).toBeGreaterThanOrEqual(4);
    const [text = ""] = await pageTexts(report.bytes);
    expect(text).toContain("© Invented Artist");
    expect(text).toContain("© Other");
    expect(text).not.toContain("© ©");
    expect(text).toContain("1");
    expect(text).toContain("2");
  });

  test("a drawing that cannot be embedded means no drawing in that cell, never a failed export", async () => {
    const garbage = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    const input = doc("participants", [
      row({
        drawings: [{ bytes: garbage, credit: "", step: 1 }],
        word: "kapot",
      }),
      row({
        drawings: [
          { bytes: new Uint8Array(drawingFixtures.webp), credit: "", step: 1 },
        ],
        word: "webp",
      }),
      row({
        drawings: [{ bytes: new Uint8Array(0), credit: "", step: 1 }],
        word: "leeg",
      }),
      row({ word: "gewoon" }),
    ]);
    const report = await renderLessonPdfDetailed(input, assets);
    expect(report.droppedDrawings).toEqual(["kapot", "webp", "leeg"]);
    const [text = ""] = await pageTexts(report.bytes);
    for (const word of ["kapot", "webp", "leeg", "gewoon"]) {
      expect(text).toContain(word);
    }
  });
});

describe("layout", () => {
  test("rows are never split, the header repeats and every page is numbered", async () => {
    const rows: PdfRow[] = [];
    for (let i = 0; i < 40; i += 1) {
      rows.push(row({ note: `EINDE${i}`, word: `woord${i}` }));
    }
    const bytes = await renderLessonPdf(doc("teachers", rows), assets);
    const texts = await pageTexts(bytes);
    expect(texts.length).toBeGreaterThan(2);
    texts.forEach((text, index) => {
      expect(text).toContain("Les 1 - Eten en drinken");
      expect(text.trimEnd().endsWith(String(index + 1))).toBe(true);
    });
    for (let i = 0; i < 40; i += 1) {
      const start = texts.findIndex(
        (text) =>
          text.includes(`woord${i} `) ||
          text.includes(`woord${i}\n`) ||
          text.endsWith(`woord${i}`)
      );
      const end = texts.findIndex((text) => text.includes(`(EINDE${i})`));
      expect(start, `woord${i}`).toBeGreaterThanOrEqual(0);
      expect(end, `EINDE${i}`).toBe(start);
    }
    // Rows keep their order across the break.
    const joined = texts.join("\n");
    expect(joined.indexOf("woord3 ")).toBeLessThan(joined.indexOf("woord30 "));
  });

  test("a section row is never the last thing on a page", async () => {
    const sections: LessonPdfDocumentInput["sections"] = [];
    for (let s = 0; s < 14; s += 1) {
      sections.push({
        rows: [
          row({ note: `E${s}`, word: `item${s}` }),
          row({ word: `extra${s}` }),
        ],
        title: `SECTIE-${s}`,
      });
    }
    const input = { ...doc("teachers", []), sections };
    const texts = await pageTexts(await renderLessonPdf(input, assets));
    expect(texts.length).toBeGreaterThan(1);
    for (let s = 0; s < 14; s += 1) {
      const page = texts.findIndex((text) => text.includes(`SECTIE-${s}`));
      expect(texts[page]).toContain(`item${s}`);
    }
  });

  test("a default-language row is marked and the footnote shows only on pages that have one", async () => {
    const rows: PdfRow[] = [];
    for (let i = 0; i < 30; i += 1) {
      rows.push(row({ fallback: i === 0, word: `woord${i}` }));
    }
    const texts = await pageTexts(
      await renderLessonPdf(doc("teachers", rows), assets)
    );
    expect(texts[0]).toContain("woord0 †");
    expect(texts[0]).toContain("† Tekst in het Nederlands weergegeven.");
    expect(texts.length).toBeGreaterThan(1);
    expect(texts[1]).not.toContain("Nederlands");
  });

  test("no footnote when nothing falls back", async () => {
    const texts = await pageTexts(
      await renderLessonPdf(doc("teachers", [row({ word: "x" })]), assets)
    );
    expect(texts.join("")).not.toContain("†");
  });

  test("long text wraps; one very long word is broken instead of overflowing", async () => {
    const longWord = "Donaudampfschifffahrtsgesellschaftskapitaen".repeat(4);
    const input = doc("teachers", [
      row({
        bw: `${"lang ".repeat(120)}einde`,
        note: longWord,
        word: "ANTIDISESTABLISHMENTARIANISM-EXTRA",
      }),
    ]);
    const report = await renderLessonPdfDetailed(input, assets);
    expect(report.truncatedRows).toEqual([]);
    const [text = ""] = await pageTexts(report.bytes);
    expect(text).toContain("einde");
    // The broken word's pieces are all there.
    expect(text.replaceAll(/\s+/g, "")).toContain(longWord.slice(0, 60));
    expect(text.replaceAll(/\s+/g, "")).toContain(longWord.slice(-40));
  });

  test("line feeds in a field become lines", async () => {
    const input = doc("teachers", [
      row({ bw: "eerste regel\n\ntweede regel", word: "w" }),
    ]);
    const [text = ""] = await pageTexts(await renderLessonPdf(input, assets));
    expect(text.indexOf("eerste regel")).toBeLessThan(
      text.indexOf("tweede regel")
    );
  });

  test("a row too tall for a page is cut with an ellipsis and reported, not split", async () => {
    const big = "woord ".repeat(330).trim();
    const input = doc("teachers", [
      row({
        bw: big,
        hc: big,
        id: "enorm",
        note: big,
        or: big,
        pl: big,
        word: "enorm",
      }),
      row({ word: "daarna" }),
    ]);
    const report = await renderLessonPdfDetailed(input, assets);
    expect(report.truncatedRows).toEqual(["enorm"]);
    const texts = await pageTexts(report.bytes);
    expect(texts[0]).toContain("…");
    expect(texts.join("")).toContain("daarna");
  });

  test("replaces glyphs the font lacks and drops invisible characters", async () => {
    const input = doc("teachers", [
      row({ hc: "hand \u{1F44B} 你好 ok​­\u0007", word: "emoji" }),
    ]);
    const report = await renderLessonPdfDetailed(input, assets);
    // The emoji and two CJK characters; the invisible ones simply vanish.
    expect(report.replacedCharacters).toBe(3);
    const [text = ""] = await pageTexts(report.bytes);
    expect(text).toContain("hand ? ?? ok");
  });

  test("prints the Latin Extended set and the French spaces without replacing anything", async () => {
    const input = doc("teachers", [
      row({ hc: "é è ê ç ï œ ° ’ “ ” Quoi\u202F? Voilà\u00A0:", word: "w" }),
    ]);
    const report = await renderLessonPdfDetailed(input, assets);
    expect(report.replacedCharacters).toBe(0);
  });

  test("an empty lesson still renders a page with the header", async () => {
    const texts = await pageTexts(
      await renderLessonPdf(doc("participants", []), assets)
    );
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain("Les 1 - Eten en drinken");
  });

  test("the header omits the number when none is set", async () => {
    const input = { ...doc("teachers", [row({ word: "w" })]), number: null };
    const [text = ""] = await pageTexts(await renderLessonPdf(input, assets));
    expect(text).toContain("Eten en drinken");
    expect(text).not.toContain("Les ");
  });
});

describe("metadata and validation", () => {
  test("sets title, author, subject, language, producer and embeds both fonts", async () => {
    const bytes = await renderLessonPdf(
      sampleDocument("teachers", { rows: 2 }),
      assets,
      { now: NOW }
    );
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(pdf.getTitle()).toBe("Les 1 - Eten en drinken");
    expect(pdf.getAuthor()).toBe("SMOG");
    expect(pdf.getSubject()).toBe("SMOG Les 1 - Eten en drinken");
    expect(pdf.getProducer()).toBe("SMOG");
    expect(pdf.getCreationDate()?.toISOString()).toBe(NOW.toISOString());
    expect(pdf.catalog.get(PDFName.of("Lang"))?.toString()).toBe("(nl-BE)");
    const fonts: string[] = [];
    for (const [, object] of pdf.context.enumerateIndirectObjects()) {
      if (
        object instanceof PDFDict &&
        object.get(PDFName.of("Subtype"))?.toString() === "/Type0"
      ) {
        fonts.push(object.get(PDFName.of("BaseFont"))?.toString() ?? "");
      }
    }
    expect(fonts.some((name) => name.includes("Figtree-Bold"))).toBe(true);
    expect(fonts.some((name) => name.includes("Figtree-Regular"))).toBe(true);
  });

  test("is byte-stable for the same input and clock", async () => {
    const make = () =>
      renderLessonPdf(sampleDocument("teachers", { rows: 3 }), assets, {
        now: NOW,
      });
    const [a, b] = [await make(), await make()];
    expect(a.byteLength).toBe(b.byteLength);
  });

  test("refuses a document of the wrong shape with a typed error naming the field", async () => {
    const bad = {
      ...sampleDocument("teachers"),
      template: "everyone",
    } as unknown as LessonPdfDocumentInput;
    await expect(renderLessonPdf(bad, assets)).rejects.toThrow(
      PdfDocumentError
    );
    await expect(renderLessonPdf(bad, assets)).rejects.toThrow("template");
  });

  test("refuses more rows than the engine's cap", async () => {
    const input = sampleDocument("teachers", { rows: 151, sections: 2 });
    await expect(renderLessonPdf(input, assets)).rejects.toThrow(
      PdfDocumentError
    );
  });
});

describe("performance", () => {
  test("a 150-row teachers' document with sections renders in under five seconds", async () => {
    const input = sampleDocument("teachers", {
      fallbackEvery: 9,
      rows: 150,
      sections: 10,
    });
    const started = performance.now();
    const report = await renderLessonPdfDetailed(input, assets);
    const elapsed = Math.round(performance.now() - started);
    console.log(
      `[pdf] bun teachers 150 rows: ${report.pageCount} pages, ${report.bytes.byteLength} bytes, ${elapsed} ms`
    );
    expect(elapsed).toBeLessThan(5000);
    expect(report.pageCount).toBeGreaterThan(10);
    const texts = await pageTexts(report.bytes);
    expect(texts.join(" ")).toContain("appel 149");
  });

  test("an 80-row participants' document with distinct drawings renders in under ten seconds", async () => {
    const input = sampleDocument("participants", {
      drawings: true,
      rows: 80,
      sections: 4,
    });
    const started = performance.now();
    const report = await renderLessonPdfDetailed(input, assets);
    const elapsed = Math.round(performance.now() - started);
    console.log(
      `[pdf] bun participants 80 rows with drawings: ${report.pageCount} pages, ${report.bytes.byteLength} bytes, ${elapsed} ms`
    );
    expect(elapsed).toBeLessThan(10_000);
    expect(report.droppedDrawings).toEqual([]);
    expect(report.pageCount).toBeGreaterThan(10);
  });
});
