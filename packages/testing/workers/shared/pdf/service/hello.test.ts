import { env } from "cloudflare:workers";
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { renderHelloDocument } from "../../../../../pdf/src/index";

/*
 * The spike of phase 10c task 1 (risk R1): pdf-lib and fontkit run in the
 * Workers pool (workerd), with an embedded TrueType font and a PNG. The same
 * document is generated in Bun by `src/hello.test.ts`.
 */

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

const assets = {
  boldFont: fromBase64(env.FONT_BOLD_B64),
  image: fromBase64(env.IMAGE_B64),
  regularFont: fromBase64(env.FONT_REGULAR_B64),
};

/** The `BaseFont` names and image XObject count of a saved PDF. */
async function inspect(bytes: Uint8Array): Promise<{
  fonts: string[];
  images: number;
  pages: number;
}> {
  const doc = await PDFDocument.load(bytes);
  const fonts: string[] = [];
  let images = 0;
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    let dict: PDFDict | undefined;
    if (object instanceof PDFDict) {
      dict = object;
    } else if (object instanceof PDFRawStream) {
      ({ dict } = object);
    }
    const subtype = dict?.get(PDFName.of("Subtype"))?.toString();
    const baseFont = dict?.get(PDFName.of("BaseFont"));
    if (baseFont && subtype === "/Type0") {
      fonts.push(baseFont.toString());
    }
    if (subtype === "/Image") {
      images += 1;
    }
  }
  return { fonts, images, pages: doc.getPageCount() };
}

describe("pdf-lib in the Workers pool", () => {
  it("renders a document with two embedded fonts and a PNG", async () => {
    const started = performance.now();
    const bytes = await renderHelloDocument(assets, { lines: 3 });
    const elapsed = Math.round(performance.now() - started);
    console.log(
      `[pdf-spike] workerd: 1 page, ${bytes.byteLength} bytes in ${elapsed} ms`
    );

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const info = await inspect(bytes);
    expect(info.pages).toBe(1);
    expect(info.fonts.some((name) => name.includes("Figtree-Bold"))).toBe(true);
    expect(info.fonts.some((name) => name.includes("Figtree-Regular"))).toBe(
      true
    );
    // The alpha channel is a second image (the soft mask).
    expect(info.images).toBeGreaterThanOrEqual(1);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toBe("SMOG Les 1");
    expect(doc.getAuthor()).toBe("SMOG");
  });

  it("renders 150 lines over four pages within five seconds", async () => {
    const started = performance.now();
    const bytes = await renderHelloDocument(assets, { lines: 150 });
    const elapsed = Math.round(performance.now() - started);
    console.log(
      `[pdf-spike] workerd: 4 pages (150 lines), ${bytes.byteLength} bytes in ${elapsed} ms`
    );
    expect((await inspect(bytes)).pages).toBe(4);
    expect(elapsed).toBeLessThan(5000);
  });
});
