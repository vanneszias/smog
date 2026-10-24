/**
 * The cache guard of the lesson PDF (phase 10c review fix wave, B-M2). A
 * cached PDF is served for an unchanged lesson for up to 30 days, so a change
 * to what the engine prints must change `LESSON_PDF_LAYOUT_VERSION` (part of
 * every cache key). This test fingerprints the engine (its non-test sources,
 * its fonts and logo, the pinned `pdf-lib` and fontkit versions) and fails
 * when the fingerprint is not the one recorded for the current version.
 */
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LESSON_PDF_ENGINE_HASHES,
  LESSON_PDF_LAYOUT_VERSION,
} from "../packages/features/lessons/src/server/layout-version";

const PDF = join(import.meta.dir, "..", "packages", "pdf");

const SHA256_HEX = /^[0-9a-f]{64}$/;

function files(dir: string, keep: (name: string) => boolean): string[] {
  return readdirSync(dir)
    .filter(keep)
    .sort()
    .map((name) => join(dir, name));
}

/** The fingerprint of the engine that prints the lesson PDF. */
function engineFingerprint(): string {
  const hash = createHash("sha256");
  const manifest = JSON.parse(
    readFileSync(join(PDF, "package.json"), "utf8")
  ) as { dependencies: Record<string, string> };
  hash.update(
    `pdf-lib@${manifest.dependencies["pdf-lib"]}\n@pdf-lib/fontkit@${manifest.dependencies["@pdf-lib/fontkit"]}\n`
  );
  const sources = files(
    join(PDF, "src"),
    (name) => name.endsWith(".ts") && !name.endsWith(".test.ts")
  );
  for (const path of [...sources, ...files(join(PDF, "assets"), () => true)]) {
    hash.update(`${path.slice(PDF.length)}\n`);
    hash.update(readFileSync(path));
  }
  return hash.digest("hex");
}

describe("LESSON_PDF_LAYOUT_VERSION", () => {
  test("the engine is the one the current version was recorded for", () => {
    const recorded = LESSON_PDF_ENGINE_HASHES[LESSON_PDF_LAYOUT_VERSION];
    const actual = engineFingerprint();
    expect(
      actual,
      `The PDF engine (packages/pdf/src, its assets or the pinned pdf-lib or fontkit) changed without a new layout version. Bump LESSON_PDF_LAYOUT_VERSION in packages/features/lessons/src/server/layout-version.ts to ${LESSON_PDF_LAYOUT_VERSION + 1} and add the entry ${LESSON_PDF_LAYOUT_VERSION + 1}: "${actual}" to LESSON_PDF_ENGINE_HASHES.`
    ).toBe(recorded ?? "");
  });

  test("the history is sound: the current version is the newest and every version has its own engine", () => {
    const versions = Object.keys(LESSON_PDF_ENGINE_HASHES).map(Number);
    expect(Math.max(...versions)).toBe(LESSON_PDF_LAYOUT_VERSION);
    const hashes = Object.values(LESSON_PDF_ENGINE_HASHES);
    expect(new Set(hashes).size).toBe(hashes.length);
    for (const hash of hashes) {
      expect(hash).toMatch(SHA256_HEX);
    }
  });
});
