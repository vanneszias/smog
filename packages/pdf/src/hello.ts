/**
 * The phase 10c task 1 spike: the smallest document that needs everything
 * the lesson PDFs need from `pdf-lib` and `@pdf-lib/fontkit` (an embedded
 * subset TrueType font in two weights, a PNG with an alpha channel, text
 * metrics, several pages, document metadata). It proves the library runs in
 * workerd (the Worker) and in Bun (the tests, the sample generator); the
 * real layout engine replaces it in task 5.
 */
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";

export interface HelloAssets {
  boldFont: Uint8Array;
  image: Uint8Array;
  regularFont: Uint8Array;
}

export interface HelloOptions {
  /** How many lines of text to print (each page holds 40). */
  lines?: number;
  title?: string;
}

const PAGE = { height: 841.89, width: 595.28 } as const;
const MARGIN = 48;
const LINE_HEIGHT = 18;
const LINES_PER_PAGE = 40;

/** A hello document: a logo, a bold title and lines of body text, over pages. */
export async function renderHelloDocument(
  assets: HelloAssets,
  options: HelloOptions = {}
): Promise<Uint8Array> {
  const title = options.title ?? "SMOG Les 1";
  const lines = options.lines ?? 3;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // `subset: true` embeds only the glyphs used: the file stays small.
  const regular = await doc.embedFont(assets.regularFont, { subset: true });
  const bold = await doc.embedFont(assets.boldFont, { subset: true });
  const image = await doc.embedPng(assets.image);
  doc.setTitle(title);
  doc.setAuthor("SMOG");
  doc.setSubject("Spike");
  doc.setLanguage("nl-BE");
  doc.setCreationDate(new Date(0));
  doc.setModificationDate(new Date(0));

  const logoSize = 36;
  let page = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;
  page.drawImage(image, {
    height: logoSize,
    width: logoSize,
    x: MARGIN,
    y: y - logoSize,
  });
  page.drawText(title, {
    color: rgb(0.05, 0.3, 0.2),
    font: bold,
    size: 20,
    x: MARGIN + logoSize + 12,
    y: y - 26,
  });
  y -= logoSize + 24;
  for (let line = 0; line < lines; line += 1) {
    if (line > 0 && line % LINES_PER_PAGE === 0) {
      page = doc.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - MARGIN;
    }
    // Latin Extended on purpose: the lessons print French and Dutch.
    page.drawText(
      `${line + 1}. Beweging, geste, mains (é è ê ç ï) HC PL OR BW`,
      {
        font: line % 5 === 0 ? bold : regular,
        size: 12,
        x: MARGIN,
        y,
      }
    );
    y -= LINE_HEIGHT;
  }
  return await doc.save();
}
