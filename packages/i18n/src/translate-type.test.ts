import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/*
 * Code that passes `t` around types it as `Translate` from `@smog/i18n`
 * (DECISIONS, phase 5 task 3). Typing it from the hook,
 * `ReturnType<typeof useTranslation>["t"]`, resolves the generic hook at its
 * constraints and makes TypeScript instantiate the whole key union, which
 * fails with TS2589 once the catalogue is large; local copies of the type
 * drift. This scans the workspace sources for either.
 */

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SCANNED = ["apps", "packages"];
const SKIPPED = new Set([
  "node_modules",
  "dist",
  ".expo",
  ".turbo",
  ".wrangler",
  "generated",
]);
const SOURCE = /\.(ts|tsx)$/;
const BANNED = [
  /ReturnType<\s*typeof\s+useTranslation\s*>/,
  /ReturnType<\s*typeof\s+createI18n\s*>\s*\[\s*["']t["']\s*\]/,
];
/** The one definition, and this test. */
const ALLOWED = new Set([
  join("packages", "i18n", "src", "setup-web.ts"),
  join("packages", "i18n", "src", "translate-type.test.ts"),
]);

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (SKIPPED.has(entry.name)) {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sources(path));
    } else if (SOURCE.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

describe("the Translate type", () => {
  test("nothing types `t` from the hook or redefines it locally", () => {
    const offenders = SCANNED.flatMap(sources).filter(
      (path) =>
        !ALLOWED.has(path) &&
        BANNED.some((pattern) =>
          pattern.test(readFileSync(join(ROOT, path), "utf8"))
        )
    );
    expect(offenders).toEqual([]);
  });
});
