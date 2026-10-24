/**
 * The layout engine of the lesson PDFs (phase 10c, spec 5.4): A4 portrait,
 * a repeated header (logo, "SMOG", the title), the lesson notes, a bordered
 * two-column table (38 / 62) whose rows are never split across pages, shaded
 * section rows, and centred page numbers. Two templates share the geometry:
 * the teachers' (the long fields with their labels) and the participants'
 * (the drawings, a short summary, the C words).
 *
 * Pure: `pdf-lib` and `@pdf-lib/fontkit` only. No file system, no D1, no R2.
 */
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  rgb,
} from "pdf-lib";
import { pngInflatesWithin } from "./png-guard";
import {
  type LessonPdfDocument,
  type LessonPdfDocumentInput,
  lessonPdfDocumentSchema,
  PDF_ENGINE_LIMITS,
  type PdfAssets,
  PdfDocumentError,
  type PdfRenderReport,
  type PdfRow,
} from "./schema";
import {
  type Measurer,
  measurerFor,
  sanitize,
  withEllipsis,
  wrapText,
} from "./text";

// ---------------------------------------------------------------- geometry

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 50;
const TABLE_W = PAGE_W - 2 * MARGIN_X;
const LEFT_W = Math.round(TABLE_W * 0.38 * 100) / 100;
const RIGHT_W = TABLE_W - LEFT_W;
const PAD = 6;
const HEADER_TOP = 34;
const LOGO_H = 30;
const FOOTER_H = 70;
const BODY_BOTTOM = PAGE_H - FOOTER_H;
const LABEL_W = 24;
const DRAWING_MAX_H = 80;
const DRAWING_GAP = 10;

const GREEN = rgb(0, 0.502, 0.373);
const INK = rgb(0.1, 0.1, 0.1);
const GREY = rgb(0.45, 0.45, 0.45);
const RULE = rgb(0.35, 0.35, 0.35);
const SHADE = rgb(0.86, 0.93, 0.9);

// ------------------------------------------------------------------- types

interface Fonts {
  bold: PDFFont;
  boldM: Measurer;
  regular: PDFFont;
  regularM: Measurer;
}

/** One block of the flow: a text line, a section row or a table row. */
interface Item {
  draw: (page: PDFPage, top: number) => void;
  /** True for a row that prints default-language text (the footnote). */
  fallback: boolean;
  height: number;
  /** A section row stays with the row that follows it. */
  keepWithNext: boolean;
}

interface Tally {
  dropped: string[];
  replaced: number;
  truncated: string[];
}

interface Build {
  bodyH: number;
  dagger: string;
  fonts: Fonts;
  labels: LessonPdfDocument["labels"];
  locale: string;
  tally: Tally;
}

// ----------------------------------------------------------------- drawing

/** Draws one line of text whose line box starts `top` points below the page top. */
function drawLine(
  page: PDFPage,
  value: string,
  options: {
    color?: ReturnType<typeof rgb>;
    font: PDFFont;
    lineHeight: number;
    size: number;
    top: number;
    x: number;
  }
): void {
  if (value === "") {
    return;
  }
  const baseline =
    options.top + (options.lineHeight - options.size) / 2 + options.size * 0.8;
  page.drawText(value, {
    color: options.color ?? INK,
    font: options.font,
    size: options.size,
    x: options.x,
    y: PAGE_H - baseline,
  });
}

function strokeRect(
  page: PDFPage,
  x: number,
  top: number,
  width: number,
  height: number,
  fill?: ReturnType<typeof rgb>
): void {
  page.drawRectangle({
    borderColor: RULE,
    borderWidth: 0.5,
    height,
    width,
    x,
    y: PAGE_H - top - height,
    ...(fill ? { color: fill } : {}),
  });
}

function upper(value: string, locale: string): string {
  try {
    return value.toLocaleUpperCase(locale);
  } catch {
    return value.toUpperCase();
  }
}

function clean(value: string, build: Build, bold = false): string {
  const result = sanitize(
    value,
    bold ? build.fonts.boldM : build.fonts.regularM
  );
  build.tally.replaced += result.replaced;
  return result.text;
}

// ------------------------------------------------------------ visual lines

/** A line of the right-hand cell, with the label that opens its field. */
interface VLine {
  bold: boolean;
  /** Extra space above the line. */
  gap: number;
  label: string;
  text: string;
}

function vlinesHeight(lines: VLine[], lineHeight: number): number {
  return lines.reduce((sum, line) => sum + line.gap + lineHeight, 0);
}

/** Keeps the lines that fit `maxHeight`; the last one ends in an ellipsis. */
function clampLines(
  lines: VLine[],
  options: {
    build: Build;
    lineHeight: number;
    maxHeight: number;
    size: number;
    textWidth: number;
  }
): { lines: VLine[]; truncated: boolean } {
  if (vlinesHeight(lines, options.lineHeight) <= options.maxHeight) {
    return { lines, truncated: false };
  }
  const kept = [...lines];
  while (
    kept.length > 1 &&
    vlinesHeight(kept, options.lineHeight) > options.maxHeight
  ) {
    kept.pop();
  }
  const last = kept.at(-1);
  if (last) {
    const measurer = last.bold
      ? options.build.fonts.boldM
      : options.build.fonts.regularM;
    kept[kept.length - 1] = {
      ...last,
      text: withEllipsis(last.text, measurer, options.size, options.textWidth),
    };
  }
  return { lines: kept, truncated: true };
}

function field(
  value: string,
  options: {
    bold?: boolean;
    build: Build;
    gap?: number;
    label: string;
    size: number;
    width: number;
  }
): VLine[] {
  const bold = options.bold ?? false;
  const text = clean(value, options.build, bold);
  const wrapped = wrapText(
    text,
    bold ? options.build.fonts.boldM : options.build.fonts.regularM,
    options.size,
    options.width
  );
  return wrapped.map((line, index) => ({
    bold,
    gap: index === 0 ? (options.gap ?? 0) : 0,
    label: index === 0 ? options.label : "",
    text: line,
  }));
}

// -------------------------------------------------------------- left cells

function wordLines(row: PdfRow, build: Build, size: number): string[] {
  const word = clean(row.word, build, true);
  const withMark = row.fallback ? `${word} ${build.dagger}` : word;
  return wrapText(withMark, build.fonts.boldM, size, LEFT_W - 2 * PAD);
}

// ------------------------------------------------------------------- items

function rowItem(
  row: PdfRow,
  parts: {
    leftHeight: number;
    drawLeft: (page: PDFPage, top: number) => void;
    drawRight: (page: PDFPage, top: number) => void;
    rightHeight: number;
  }
): Item {
  const height = Math.max(parts.leftHeight, parts.rightHeight) + 2 * PAD;
  return {
    draw: (page, top) => {
      strokeRect(page, MARGIN_X, top, LEFT_W, height);
      strokeRect(page, MARGIN_X + LEFT_W, top, RIGHT_W, height);
      parts.drawLeft(page, top + PAD);
      parts.drawRight(page, top + PAD);
    },
    fallback: row.fallback,
    height,
    keepWithNext: false,
  };
}

const T_WORD = 14;
const T_WORD_LH = 17;
const T_SIZE = 9;
const T_LH = 11.5;

function teachersRow(row: PdfRow, build: Build): Item {
  const color = row.fallback ? GREY : INK;
  const textWidth = RIGHT_W - 2 * PAD - LABEL_W;
  const maxContent = build.bodyH - 2 * PAD;
  const { labels } = build;

  // Left: the word, large and bold.
  const word = clampWord(
    wordLines(row, build, T_WORD),
    build,
    T_WORD,
    maxContent,
    T_WORD_LH
  );

  // Right: HC PL OR BW always (an empty field keeps its label and line, as
  // in the owner's sheet), then C when there is something, then the note.
  const lines: VLine[] = [
    ...field(row.hc, {
      bold: true,
      build,
      label: labels.fields.hc,
      size: T_SIZE,
      width: textWidth,
    }),
    ...field(row.pl, {
      build,
      label: labels.fields.pl,
      size: T_SIZE,
      width: textWidth,
    }),
    ...field(row.or, {
      build,
      label: labels.fields.or,
      size: T_SIZE,
      width: textWidth,
    }),
    ...field(row.bw, {
      build,
      label: labels.fields.bw,
      size: T_SIZE,
      width: textWidth,
    }),
  ];
  const keywords = row.keywords
    .map((keyword) => upper(keyword.trim(), build.locale))
    .filter((keyword) => keyword !== "")
    .join(", ");
  const cText = [keywords, row.cNote.trim()].filter(Boolean).join(" ");
  if (cText) {
    lines.push(
      ...field(cText, {
        build,
        gap: 4,
        label: labels.fields.c,
        size: T_SIZE,
        width: textWidth,
      })
    );
  }
  const note = row.note.trim();
  if (note) {
    const bracketed =
      note.startsWith("(") && note.endsWith(")") ? note : `(${note})`;
    lines.push(
      ...field(bracketed, {
        build,
        gap: 4,
        label: "",
        size: T_SIZE,
        width: textWidth,
      })
    );
  }
  const clamped = clampLines(lines, {
    build,
    lineHeight: T_LH,
    maxHeight: maxContent,
    size: T_SIZE,
    textWidth,
  });
  if (clamped.truncated) {
    build.tally.truncated.push(row.id || row.word);
  }
  const { fonts } = build;
  return rowItem(row, {
    drawLeft: (page, top) => {
      word.forEach((line, index) => {
        drawLine(page, line, {
          color,
          font: fonts.bold,
          lineHeight: T_WORD_LH,
          size: T_WORD,
          top: top + index * T_WORD_LH,
          x: MARGIN_X + PAD,
        });
      });
    },
    drawRight: (page, top) => {
      let y = top;
      for (const line of clamped.lines) {
        y += line.gap;
        drawLine(page, line.label, {
          color,
          font: fonts.regular,
          lineHeight: T_LH,
          size: T_SIZE,
          top: y,
          x: MARGIN_X + LEFT_W + PAD,
        });
        drawLine(page, line.text, {
          color,
          font: line.bold ? fonts.bold : fonts.regular,
          lineHeight: T_LH,
          size: T_SIZE,
          top: y,
          x: MARGIN_X + LEFT_W + PAD + LABEL_W,
        });
        y += T_LH;
      }
    },
    leftHeight: word.length * T_WORD_LH,
    rightHeight: vlinesHeight(clamped.lines, T_LH),
  });
}

/** Cuts a word that would not fit a page (an absurd length) with an ellipsis. */
function clampWord(
  lines: string[],
  build: Build,
  size: number,
  maxHeight: number,
  lineHeight: number
): string[] {
  const max = Math.max(1, Math.floor(maxHeight / lineHeight));
  if (lines.length <= max) {
    return lines;
  }
  const kept = lines.slice(0, max);
  kept[max - 1] = withEllipsis(
    kept[max - 1] ?? "",
    build.fonts.boldM,
    size,
    LEFT_W - 2 * PAD
  );
  return kept;
}

const P_WORD = 12;
const P_WORD_LH = 15;
const P_SIZE = 9.5;
const P_LH = 12.5;
const CREDIT_SIZE = 6.5;
const CREDIT_LH = 8;
const BULLET_INDENT = 9;

/** A drawing that embedded, scaled into its slot. */
interface PlacedDrawing {
  credit: string[];
  height: number;
  image: PDFImage;
  width: number;
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function isJpeg(bytes: Uint8Array): boolean {
  return (
    bytes.length > 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
}

/** Embeds a drawing; `undefined` when the bytes are not a readable PNG or JPEG. */
async function embedDrawing(
  doc: PDFDocument,
  bytes: Uint8Array
): Promise<PDFImage | undefined> {
  try {
    if (isPng(bytes)) {
      // pdf-lib inflates synchronously: a stream that inflates past what its header implies is a bomb, no drawing.
      return (await pngInflatesWithin(bytes))
        ? await doc.embedPng(bytes)
        : undefined;
    }
    if (isJpeg(bytes)) {
      return await doc.embedJpg(bytes);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function participantsRow(
  row: PdfRow,
  build: Build,
  pdf: PDFDocument
): Promise<Item> {
  const color = row.fallback ? GREY : INK;
  const { fonts } = build;
  const { labels } = build;
  const maxContent = build.bodyH - 2 * PAD;
  const innerLeft = LEFT_W - 2 * PAD;

  const word = clampWord(
    wordLines(row, build, P_WORD),
    build,
    P_WORD,
    maxContent / 2,
    P_WORD_LH
  );

  // Drawings: each embeds or the cell simply has none (never a failed export).
  const steps = [...row.drawings].sort((a, b) => a.step - b.step);
  const embedded: { credit: string; image: PDFImage }[] = [];
  for (const drawing of steps) {
    // biome-ignore lint/performance/noAwaitInLoops: one embed at a time keeps the decoded PNG out of memory before the next.
    const image = await embedDrawing(pdf, drawing.bytes);
    if (image && image.width > 0 && image.height > 0) {
      embedded.push({ credit: drawing.credit.trim(), image });
    } else {
      build.tally.dropped.push(row.id || row.word);
    }
  }
  const slotW =
    embedded.length === 2 ? (innerLeft - DRAWING_GAP) / 2 : innerLeft;
  const placed: PlacedDrawing[] = embedded.map(({ credit, image }) => {
    const scale = Math.min(slotW / image.width, DRAWING_MAX_H / image.height);
    // A credit that already starts with the mark is not marked twice.
    const marked = credit.startsWith("©") ? credit : `© ${credit}`;
    const creditText = credit ? clean(marked, build) : "";
    return {
      credit: creditText
        ? wrapText(creditText, fonts.regularM, CREDIT_SIZE, slotW)
        : [],
      height: image.height * scale,
      image,
      width: image.width * scale,
    };
  });
  const drawingsH = placed.length
    ? Math.max(...placed.map((entry) => entry.height))
    : 0;
  const creditH = placed.length
    ? Math.max(...placed.map((entry) => entry.credit.length)) * CREDIT_LH
    : 0;
  const leftHeight =
    word.length * P_WORD_LH + (placed.length ? 4 + drawingsH + 2 + creditH : 0);

  // Right: the summary (HC when there is none) as bullets, then the C line.
  const textWidth = RIGHT_W - 2 * PAD - BULLET_INDENT;
  const source = row.summary.trim() === "" ? row.hc : row.summary;
  const bulletLines: VLine[] = [];
  for (const entry of clean(source, build).split("\n")) {
    if (entry.trim() === "") {
      continue;
    }
    bulletLines.push(
      ...field(entry, {
        build,
        label: "•",
        size: P_SIZE,
        width: textWidth,
      })
    );
  }
  const keywords = row.keywords
    .map((keyword) => keyword.trim())
    .filter(Boolean);
  if (keywords.length > 0) {
    bulletLines.push(
      ...field(`${labels.participantsC} ${keywords.join(", ")}`, {
        build,
        gap: 6,
        label: "\u2022",
        size: P_SIZE,
        width: textWidth,
      })
    );
  }
  const clamped = clampLines(bulletLines, {
    build,
    lineHeight: P_LH,
    maxHeight: maxContent,
    size: P_SIZE,
    textWidth,
  });
  if (clamped.truncated) {
    build.tally.truncated.push(row.id || row.word);
  }
  const bullet = fonts.regularM.has(0x20_22) ? "•" : "-";

  return rowItem(row, {
    drawLeft: (page, top) => {
      word.forEach((line, index) => {
        drawLine(page, line, {
          color,
          font: fonts.bold,
          lineHeight: P_WORD_LH,
          size: P_WORD,
          top: top + index * P_WORD_LH,
          x: MARGIN_X + PAD,
        });
      });
      const imageTop = top + word.length * P_WORD_LH + 4;
      placed.forEach((entry, index) => {
        const slotX = MARGIN_X + PAD + index * (slotW + DRAWING_GAP);
        const x = slotX + (slotW - entry.width) / 2;
        drawImageAt(page, entry, x, imageTop);
        if (placed.length === 2) {
          drawLine(page, String(index + 1), {
            color: GREY,
            font: fonts.regular,
            lineHeight: 9,
            size: 7,
            top: imageTop,
            x: slotX,
          });
        }
        entry.credit.forEach((line, creditIndex) => {
          drawLine(page, line, {
            color: GREY,
            font: fonts.regular,
            lineHeight: CREDIT_LH,
            size: CREDIT_SIZE,
            top: imageTop + drawingsH + 2 + creditIndex * CREDIT_LH,
            x: slotX,
          });
        });
      });
    },
    drawRight: (page, top) => {
      let y = top;
      for (const line of clamped.lines) {
        y += line.gap;
        if (line.label !== "") {
          drawLine(page, bullet, {
            color,
            font: fonts.regular,
            lineHeight: P_LH,
            size: P_SIZE,
            top: y,
            x: MARGIN_X + LEFT_W + PAD,
          });
        }
        drawLine(page, line.text, {
          color,
          font: fonts.regular,
          lineHeight: P_LH,
          size: P_SIZE,
          top: y,
          x: MARGIN_X + LEFT_W + PAD + BULLET_INDENT,
        });
        y += P_LH;
      }
    },
    leftHeight,
    rightHeight: vlinesHeight(clamped.lines, P_LH),
  });
}

function drawImageAt(
  page: PDFPage,
  entry: PlacedDrawing,
  x: number,
  top: number
): void {
  page.drawImage(entry.image, {
    height: entry.height,
    width: entry.width,
    x,
    y: PAGE_H - top - entry.height,
  });
}

function sectionItem(title: string, build: Build): Item {
  const { fonts } = build;
  const lines = wrapText(
    clean(title, build, true),
    fonts.boldM,
    10.5,
    TABLE_W - 2 * PAD
  ).slice(0, 3);
  const height = lines.length * 14 + 8;
  return {
    draw: (page, top) => {
      strokeRect(page, MARGIN_X, top, TABLE_W, height, SHADE);
      lines.forEach((line, index) => {
        drawLine(page, line, {
          color: GREEN,
          font: fonts.bold,
          lineHeight: 14,
          size: 10.5,
          top: top + 4 + index * 14,
          x: MARGIN_X + PAD,
        });
      });
    },
    fallback: false,
    height,
    keepWithNext: true,
  };
}

function noteItems(notes: string, build: Build): Item[] {
  const text = clean(notes, build);
  if (text.trim() === "") {
    return [];
  }
  const lines = wrapText(text, build.fonts.regularM, 9.5, TABLE_W);
  const items: Item[] = lines.map((line) => ({
    draw: (page, top) => {
      drawLine(page, line, {
        font: build.fonts.regular,
        lineHeight: 13,
        size: 9.5,
        top,
        x: MARGIN_X,
      });
    },
    fallback: false,
    height: 13,
    keepWithNext: false,
  }));
  items.push({
    draw: () => undefined,
    fallback: false,
    height: 8,
    keepWithNext: false,
  });
  return items;
}

// ------------------------------------------------------------------- header

interface Header {
  height: number;
  title: string[];
}

function headerTitle(doc: LessonPdfDocument): string {
  const lesson =
    doc.number === null ? "" : `${doc.labels.lesson} ${doc.number}`.trim();
  return [lesson, doc.title.trim()].filter(Boolean).join(" - ");
}

// -------------------------------------------------------------------- build

interface Placement {
  fallback: boolean;
  item: Item;
  top: number;
}

/** Assigns every item to a page: rows never split, sections keep with the next. */
function paginate(items: Item[], contentTop: number): Placement[][] {
  const pages: Placement[][] = [[]];
  let top = contentTop;
  items.forEach((item, index) => {
    const next = items[index + 1];
    const needed =
      item.keepWithNext && next ? item.height + next.height : item.height;
    const page = pages.at(-1) ?? [];
    if (top + needed > BODY_BOTTOM && page.length > 0) {
      pages.push([]);
      top = contentTop;
    }
    pages.at(-1)?.push({ fallback: item.fallback, item, top });
    top += item.height;
  });
  return pages;
}

/** Options of a render (the clock is injectable for byte-stable tests). */
export interface RenderOptions {
  now?: Date;
}

/**
 * Renders a lesson to PDF bytes, with a report of what the engine had to
 * work around (a drawing it could not embed, characters it replaced, a row
 * it cut). Throws `PdfDocumentError` for a document of the wrong shape.
 */
export async function renderLessonPdfDetailed(
  input: LessonPdfDocumentInput,
  assets: PdfAssets,
  options: RenderOptions = {}
): Promise<PdfRenderReport> {
  const parsed = lessonPdfDocumentSchema.safeParse(input);
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    throw new PdfDocumentError(
      `[pdf] Invalid document at ${issue?.path.join(".") ?? "?"}: ${issue?.message ?? "invalid"}`
    );
  }
  const doc = parsed.data;
  const rowCount = doc.sections.reduce((sum, s) => sum + s.rows.length, 0);
  if (rowCount > PDF_ENGINE_LIMITS.rows) {
    throw new PdfDocumentError(
      "[pdf] Invalid document at sections: too many rows"
    );
  }

  const pdf = await PDFDocument.create({ updateMetadata: false });
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(assets.regularFont, { subset: true });
  const bold = await pdf.embedFont(assets.boldFont, { subset: true });
  const logo = await pdf.embedPng(assets.logo);
  const fonts: Fonts = {
    bold,
    boldM: measurerFor(bold),
    regular,
    regularM: measurerFor(regular),
  };

  // The header is the same on every page: logo, "SMOG", the title.
  const logoW = (logo.width / logo.height) * LOGO_H;
  const titleX = MARGIN_X + logoW + 16;
  const title = headerTitle(doc);
  const tally: Tally = { dropped: [], replaced: 0, truncated: [] };
  const baseBuild: Omit<Build, "bodyH"> = {
    dagger: fonts.regularM.has(0x20_20) ? "†" : "*",
    fonts,
    labels: doc.labels,
    locale: doc.locale,
    tally,
  };
  const titleLines = wrapText(
    sanitize(title, fonts.boldM).text,
    fonts.boldM,
    15,
    PAGE_W - MARGIN_X - titleX
  ).slice(0, 2);
  const header: Header = {
    height: Math.max(LOGO_H, 12 + titleLines.length * 18),
    title: titleLines,
  };
  const contentTop = HEADER_TOP + header.height + 16;
  const build: Build = {
    ...baseBuild,
    bodyH: BODY_BOTTOM - contentTop,
  };

  const items: Item[] = noteItems(doc.notes, build);
  for (const section of doc.sections) {
    // The row after a title is clamped to what is left of a page below it, so the pair always fits one page.
    let rowBuild = build;
    if (section.title !== null && section.title.trim() !== "") {
      const titleItem = sectionItem(section.title, build);
      items.push(titleItem);
      rowBuild = { ...build, bodyH: build.bodyH - titleItem.height };
    }
    for (const row of section.rows) {
      if (doc.template === "teachers") {
        items.push(teachersRow(row, rowBuild));
      } else {
        // biome-ignore lint/performance/noAwaitInLoops: sequential on purpose, see embedDrawing.
        items.push(await participantsRow(row, rowBuild, pdf));
      }
      rowBuild = build;
    }
  }

  const pages = paginate(items, contentTop);
  const footnote = wrapText(
    sanitize(`${build.dagger} ${doc.labels.fallbackFootnote}`, fonts.regularM)
      .text,
    fonts.regularM,
    7.5,
    TABLE_W
  ).slice(0, 2);
  pages.forEach((placements, pageIndex) => {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    page.drawImage(logo, {
      height: LOGO_H,
      width: logoW,
      x: MARGIN_X,
      y: PAGE_H - HEADER_TOP - LOGO_H,
    });
    drawLine(page, "SMOG", {
      color: GREY,
      font: regular,
      lineHeight: 12,
      size: 8,
      top: HEADER_TOP,
      x: titleX,
    });
    header.title.forEach((line, index) => {
      drawLine(page, line, {
        color: INK,
        font: bold,
        lineHeight: 18,
        size: 15,
        top: HEADER_TOP + 12 + index * 18,
        x: titleX,
      });
    });
    for (const placement of placements) {
      placement.item.draw(page, placement.top);
    }
    if (placements.some((placement) => placement.fallback)) {
      footnote.forEach((line, index) => {
        drawLine(page, line, {
          color: GREY,
          font: regular,
          lineHeight: 10,
          size: 7.5,
          top: PAGE_H - 54 + index * 10,
          x: MARGIN_X,
        });
      });
    }
    const label = String(pageIndex + 1);
    drawLine(page, label, {
      color: INK,
      font: regular,
      lineHeight: 12,
      size: 9,
      top: PAGE_H - 34,
      x: (PAGE_W - regular.widthOfTextAtSize(label, 9)) / 2,
    });
  });

  const now = options.now ?? new Date();
  pdf.setTitle(sanitize(title || "SMOG", fonts.regularM).text, {
    showInWindowTitleBar: true,
  });
  pdf.setAuthor(sanitize(doc.author, fonts.regularM).text);
  pdf.setSubject(
    sanitize(`SMOG ${headerTitle(doc)}`.trim(), fonts.regularM).text
  );
  pdf.setProducer("SMOG");
  pdf.setCreator("SMOG");
  pdf.setLanguage(doc.locale);
  pdf.setCreationDate(now);
  pdf.setModificationDate(now);
  const bytes = await pdf.save();
  return {
    bytes,
    droppedDrawings: tally.dropped,
    pageCount: pages.length,
    replacedCharacters: tally.replaced,
    truncatedRows: tally.truncated,
  };
}

/** Renders a lesson to PDF bytes (see `renderLessonPdfDetailed`). */
export async function renderLessonPdf(
  input: LessonPdfDocumentInput,
  assets: PdfAssets,
  options: RenderOptions = {}
): Promise<Uint8Array> {
  return (await renderLessonPdfDetailed(input, assets, options)).bytes;
}
