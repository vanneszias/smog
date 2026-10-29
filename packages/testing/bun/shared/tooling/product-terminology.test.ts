import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../../../../..", import.meta.url).pathname;
const TEXT_FILE =
  /\.(?:[cm]?[jt]sx?|mdx?|jsonc?|sql|html|css|ya?ml|toml|txt|svg|xml)$/;
const INCORRECT_TERMINOLOGY =
  /\b(?:gebaren[\s-]*taal|sign[\s-]*language|langue\s+des\s+signes|v[g]t)\b/i;
const SKIPPED_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  "generated",
  "playwright-report",
  "test-results",
  "build",
  "Pods",
]);

function offenders(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".github") {
      continue;
    }
    // Wrangler embeds third-party API documentation in this generated file.
    if (entry.name === "worker-configuration.d.ts") {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory() && !SKIPPED_DIRS.has(entry.name)) {
      found.push(...offenders(path));
    } else if (entry.isFile() && TEXT_FILE.test(entry.name)) {
      for (const [index, line] of readFileSync(path, "utf8")
        .split("\n")
        .entries()) {
        if (INCORRECT_TERMINOLOGY.test(line) || line.includes("\u2014")) {
          found.push(`${relative(ROOT, path)}:${index + 1}`);
        }
      }
    }
  }
  return found;
}

test("copy, code and documentation use SMOG terminology and never use em dashes", () => {
  expect(offenders(ROOT)).toEqual([]);
});
