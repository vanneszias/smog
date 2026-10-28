/**
 * Writes a teachers' and a participants' sample PDF from invented fixtures
 * for visual review: `bun packages/pdf/scripts/sample-lesson-pdf.ts <dir>`
 * (an absolute directory; it is created when missing).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { renderLessonPdfDetailed } from "@smog/pdf";
import {
  drawingFixtures,
  loadAssets,
  sampleDocument,
} from "../support/pdf/fixtures/index";

const [, , dir] = process.argv;
if (!(dir && isAbsolute(dir))) {
  console.error(
    "Usage: bun packages/pdf/scripts/sample-lesson-pdf.ts <absolute directory>"
  );
  process.exit(2);
}
mkdirSync(dir, { recursive: true });

const assets = loadAssets();
for (const template of ["teachers", "participants"] as const) {
  const doc = sampleDocument(template, {
    drawings: template === "participants",
    fallbackEvery: 7,
    rows: 14,
    sections: 2,
  });
  // One webp (not embeddable) and one wide JPEG, to show both paths.
  const first = doc.sections[0]?.rows[3];
  if (template === "participants" && first) {
    first.drawings = [{ bytes: drawingFixtures.webp, credit: "", step: 1 }];
  }
  const second = doc.sections[0]?.rows[4];
  if (template === "participants" && second) {
    second.drawings = [
      { bytes: drawingFixtures.jpegWide, credit: "Invented Artist", step: 1 },
    ];
  }
  // biome-ignore lint/performance/noAwaitInLoops: two documents, one after the other.
  const report = await renderLessonPdfDetailed(doc, assets, {
    now: new Date("2026-10-24T08:00:00Z"),
  });
  const path = `${dir}/sample-${template}.pdf`;
  writeFileSync(path, report.bytes);
  console.log(
    `[sample-lesson-pdf] ${path}: ${report.pageCount} pages, ${report.bytes.byteLength} bytes, dropped drawings: ${report.droppedDrawings.length}`
  );
}
