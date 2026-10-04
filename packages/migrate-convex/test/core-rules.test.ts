import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { FEATURE_PACKAGES } from "@smog/config/boundaries";

/*
 * `src/core` runs under `bun test` and in workerd (phase 8 ruling 6, the
 * global constraints): no `Bun.*`, no `node:*`, `bun:*` or `cloudflare:*`
 * module, and only these imports: `@smog/config`, `@smog/utils`,
 * `@smog/db`, a feature's `./schema`, `zod` and `drizzle-orm` (each with
 * its subpaths), and relative paths that stay inside `src/core`. The
 * package's boundaries entry is wider (its CLI and integration tests); this
 * holds the core tighter. Type-only imports count too.
 */

const CORE_DIR = new URL("../src/core", import.meta.url).pathname;

const ALLOWED_PACKAGES = [
  "@smog/config",
  "@smog/utils",
  "@smog/db",
  "zod",
  "drizzle-orm",
];

const FEATURE_SCHEMAS = FEATURE_PACKAGES.map((name) => `${name}/schema`);

const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']+)["']/g;
const BUN_GLOBAL = /\bBun\s*\.|\bglobalThis\s*\.\s*Bun\b/;
const RUNTIME_MODULE = /^(node|bun|cloudflare):/;
const SOURCE_FILE = /\.tsx?$/;
const TEST_FILE = /\.test\.tsx?$/;

function within(specifier: string, name: string): boolean {
  return specifier === name || specifier.startsWith(`${name}/`);
}

/** Why `specifier` may not be imported by `file` (under `src/core`), or null. */
function importViolation(file: string, specifier: string): string | null {
  if (specifier.startsWith(".")) {
    const target = relative(CORE_DIR, join(file, "..", specifier));
    return target.startsWith("..") ? `${specifier} leaves src/core` : null;
  }
  if (RUNTIME_MODULE.test(specifier) || specifier === "bun") {
    return `${specifier} is a runtime module`;
  }
  if (ALLOWED_PACKAGES.some((name) => within(specifier, name))) {
    return null;
  }
  if (FEATURE_SCHEMAS.some((name) => within(specifier, name))) {
    return null;
  }
  return `${specifier} is not on the core allow-list`;
}

const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /^\s*\/\/.*$/gm;

/** Every rule `text` (a file under `src/core`) breaks; comments may name anything. */
function coreViolations(file: string, text: string): string[] {
  const source = text.replace(BLOCK_COMMENT, "").replace(LINE_COMMENT, "");
  const problems: string[] = [];
  if (BUN_GLOBAL.test(source)) {
    problems.push("uses Bun.*");
  }
  for (const match of source.matchAll(SPECIFIER)) {
    const specifier = match[1] ?? "";
    const problem = importViolation(file, specifier);
    if (problem) {
      problems.push(problem);
    }
  }
  return problems;
}

function coreFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return coreFiles(path);
    }
    // Unit tests next to the code run on Bun only and may use `bun:test`.
    return SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)
      ? [path]
      : [];
  });
}

describe("the core rules", () => {
  const file = join(CORE_DIR, "transform", "users.ts");

  test("allow the data packages, feature schemas, zod, drizzle and core-relative paths", () => {
    const source = [
      'import { z } from "zod";',
      'import { sql } from "drizzle-orm";',
      'import { sqliteTable } from "drizzle-orm/sqlite-core";',
      'import type { User } from "@smog/db";',
      'import { LOCALES } from "@smog/db/enums";',
      'import { newId } from "@smog/utils";',
      'import { SITE_HOST } from "@smog/config/constants";',
      'import { AUDIT_TARGET_TYPES } from "@smog/admin/schema";',
      'import { hashSponsorshipToken } from "@smog/sponsorships/schema";',
      'import { legacyUuid } from "../ids";',
      'export { emit } from "./emit";',
    ].join("\n");
    expect(coreViolations(file, source)).toEqual([]);
  });

  test("let comments name anything", () => {
    const source = [
      '/** No `Bun.file`, and never `import x from "node:fs"`. */',
      '// import { createAuth } from "@smog/auth/server";',
      "export const ok = 1;",
    ].join("\n");
    expect(coreViolations(file, source)).toEqual([]);
  });

  test("refuse Bun, runtime modules and every package off the list", () => {
    const source = [
      "const text = await Bun.file(path).text();",
      'import { readFile } from "node:fs/promises";',
      'import { env } from "cloudflare:workers";',
      'import { test } from "bun:test";',
      'import { createAuth } from "@smog/auth/server";',
      'import type { Router } from "@smog/rpc";',
      'import { createMux } from "@smog/video";',
      'import { enqueue } from "@smog/jobs";',
      'import { render } from "@smog/email";',
      'import { approve } from "@smog/sponsorships/server";',
      'import { useLists } from "@smog/lists/client";',
      'import { gestureContract } from "@smog/gestures/contract";',
      'import { unzipSync } from "fflate";',
      'const lazy = await import("@smog/admin/server");',
      'import { runWrangler } from "../../cli/wrangler";',
    ].join("\n");
    expect(coreViolations(file, source)).toEqual([
      "uses Bun.*",
      "node:fs/promises is a runtime module",
      "cloudflare:workers is a runtime module",
      "bun:test is a runtime module",
      "@smog/auth/server is not on the core allow-list",
      "@smog/rpc is not on the core allow-list",
      "@smog/video is not on the core allow-list",
      "@smog/jobs is not on the core allow-list",
      "@smog/email is not on the core allow-list",
      "@smog/sponsorships/server is not on the core allow-list",
      "@smog/lists/client is not on the core allow-list",
      "@smog/gestures/contract is not on the core allow-list",
      "fflate is not on the core allow-list",
      "@smog/admin/server is not on the core allow-list",
      "../../cli/wrangler leaves src/core",
    ]);
  });

  test("hold for every file in src/core", () => {
    const files = coreFiles(CORE_DIR);
    expect(files.length).toBeGreaterThan(0);
    const problems = files.flatMap((path) =>
      coreViolations(path, readFileSync(path, "utf8")).map(
        (problem) => `${relative(CORE_DIR, path)}: ${problem}`
      )
    );
    expect(problems).toEqual([]);
  });
});
