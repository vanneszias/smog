/**
 * The layout version of the lesson PDF and the record that guards it (phase
 * 10c review fix wave, B-M2). The version is part of every cache key
 * (`export-plan.ts`), so a deploy that prints differently must change it, or
 * a file cached for an unchanged lesson is served for up to 30 days.
 *
 * `LESSON_PDF_ENGINE_HASHES` maps each version to the fingerprint of the
 * engine it printed with: SHA-256 over the non-test sources of
 * `packages/pdf/src`, the fonts and the logo in `packages/pdf/assets`, and the
 * pinned `pdf-lib` and fontkit versions (`packages/testing/bun/shared/tooling/lesson-pdf-version.test.ts`
 * computes it). That test fails when the engine changes without a new entry
 * for a new version; the failure prints the hash to record. A change that
 * does not alter the printed file (a comment, a refactor) still needs the bump:
 * a spare cache miss is cheap, a stale file is not.
 */

/** Bump together with a new entry in `LESSON_PDF_ENGINE_HASHES`. */
export const LESSON_PDF_LAYOUT_VERSION = 2;

/** Version to engine fingerprint; an entry is never edited, a new version adds one. */
export const LESSON_PDF_ENGINE_HASHES: Readonly<Record<number, string>> = {
  // The engine of phase 10c task 5a/5b (the first release).
  1: "8b82a08e80880176cc40945cf036d475009cc2b491165ec6257b1587a113bb63",
  // Review fix wave: a section title never alone on a page, bounded PNG inflate, glyph coverage module.
  2: "8ea46f5cf528ee7d61b557bdf6fafe334608866a9677912f9e785d5690992fe1",
};
