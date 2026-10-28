/**
 * Invented fixtures for the tests and the sample generator (Bun only: they
 * read files). Every word, text and credit here is made up.
 */
import { readFileSync } from "node:fs";
import type {
  LessonPdfDocumentInput,
  PdfAssets,
  PdfRow,
  PdfTemplate,
} from "../../../../pdf/src";

const HERE = new URL("./", import.meta.url).pathname;
const read = (path: string): Uint8Array => readFileSync(`${HERE}${path}`);

export function loadAssets(): PdfAssets {
  return {
    boldFont: read("../../../../pdf/assets/Figtree-Bold.ttf"),
    logo: read("../../../../pdf/assets/logo.png"),
    regularFont: read("../../../../pdf/assets/Figtree-Regular.ttf"),
  };
}

export const drawingFixtures = {
  jpegWide: read("drawing-wide.jpg"),
  png1: read("drawing-1.png"),
  png2: read("drawing-2.png"),
  webp: read("drawing.webp"),
};

export const NL_LABELS = {
  fallbackFootnote: "Tekst in het Nederlands weergegeven.",
  fields: { bw: "BW", c: "C", hc: "HC", or: "OR", pl: "PL" },
  lesson: "Les",
  participantsC: "C:",
} as const;

/** A copy, so that no two rows share a buffer (an honest timing). */
function copy(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

const WORDS = [
  [
    "appel",
    "A: C-hand",
    "bij de mondhoeken (geen touch)",
    "handpalm naar het gezicht",
    "de hand maakt een boog naar boven",
    ["fruit", "peer"],
    "(op lettergrepen)",
    "",
  ],
  [
    "jam",
    "A: gestrekte wijsvinger",
    "tussen neus en bovenlip",
    "handpalm naar beneden",
    "de vinger glijdt weg van de middellijn",
    ["confituur", "honing"],
    "",
    "Invented note for the teacher",
  ],
  [
    "boter",
    "beide handen: vlakke handen",
    "voor het lichaam",
    "handpalmen naar elkaar",
    "A glijdt over P naar de muis toe",
    ["smeren"],
    "",
    "",
  ],
  [
    "kaas",
    "beide handen: gestrekte aaneengesloten wijs- en middenvinger",
    "tegen de wangen",
    "handpalmen schuin naar voor",
    "de handen bewegen cirkelvormig naar voor",
    ["naam van kaas"],
    "(zonder touch)",
    "",
  ],
] as const;

/** A row of invented content; `index` varies the word so rows differ. */
export function sampleRow(
  index: number,
  options: { drawings?: boolean } = {}
): PdfRow {
  const base = WORDS[index % WORDS.length] as (typeof WORDS)[number];
  const [word, hc, pl, or, bw, keywords, cNote, note] = base;
  const drawings: PdfRow["drawings"] = [];
  if (options.drawings) {
    drawings.push({
      bytes: copy(drawingFixtures.png1),
      credit: "Invented Artist",
      step: 1,
    });
    if (index % 3 === 2) {
      drawings.push({ bytes: copy(drawingFixtures.png2), credit: "", step: 2 });
    }
  }
  return {
    bw,
    cNote,
    drawings,
    fallback: false,
    hc,
    id: `row-${index}`,
    keywords: [...keywords],
    note,
    or,
    pl,
    summary: `${hc}\n${bw}`,
    word: index < WORDS.length ? word : `${word} ${index + 1}`,
  };
}

export function sampleDocument(
  template: PdfTemplate,
  options: {
    drawings?: boolean;
    fallbackEvery?: number;
    rows?: number;
    sections?: number;
  } = {}
): LessonPdfDocumentInput {
  const rows = options.rows ?? 8;
  const sections = Math.max(1, options.sections ?? 1);
  const perSection = Math.ceil(rows / sections);
  const out: LessonPdfDocumentInput["sections"] = [];
  let made = 0;
  for (let s = 0; s < sections && made < rows; s += 1) {
    const list: PdfRow[] = [];
    for (let i = 0; i < perSection && made < rows; i += 1) {
      const row = sampleRow(made, { drawings: options.drawings });
      if (options.fallbackEvery && (made + 1) % options.fallbackEvery === 0) {
        row.fallback = true;
      }
      list.push(row);
      made += 1;
    }
    out.push({
      rows: list,
      title: sections > 1 ? `Sectie ${s + 1}: voeding` : null,
    });
  }
  return {
    labels: NL_LABELS,
    locale: "nl-BE",
    notes:
      "Invented lesson notes: practise the words in pairs, then repeat as a group.",
    number: 1,
    sections: out,
    template,
    title: "Eten en drinken",
  };
}
