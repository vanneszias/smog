import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName } from "pdf-lib";
import { renderHelloDocument } from "./hello";

/** The same spike document as `test/hello.test.ts`, generated in Bun. */

const ROOT = new URL("../../../", import.meta.url).pathname;
const read = (path: string): Uint8Array => readFileSync(`${ROOT}${path}`);

const assets = {
  boldFont: read("apps/mobile/assets/fonts/Figtree-Bold.ttf"),
  image: read("packages/brand/src/art/icon.png"),
  regularFont: read("apps/mobile/assets/fonts/Figtree-Regular.ttf"),
};

describe("pdf-lib in Bun", () => {
  test("renders a document that loads back with its metadata", async () => {
    const started = performance.now();
    const bytes = await renderHelloDocument(assets, { lines: 150 });
    const elapsed = Math.round(performance.now() - started);
    console.log(
      `[pdf-spike] bun: 4 pages (150 lines), ${bytes.byteLength} bytes in ${elapsed} ms`
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(4);
    expect(doc.getTitle()).toBe("SMOG Les 1");
    expect(doc.catalog.get(PDFName.of("Lang"))?.toString()).toBe("(nl-BE)");
  });
});
