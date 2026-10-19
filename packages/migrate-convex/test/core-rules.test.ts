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

const NODE_GLOBALS: readonly [RegExp, string][] = [
  [/\bprocess\s*\./, "process"],
  [/\bBuffer\b/, "Buffer"],
  [/\b__dirname\b/, "__dirname"],
  [/\b__filename\b/, "__filename"],
];
const TEMPLATE_IMPORT = /\b(?:import|require)\s*\(\s*`/;

/**
 * `text` without comments (`code`, strings kept, for the import scan) and
 * also without the contents of string literals (`bare`, for the global
 * scan, so a message that says "process." is not a use). A comment marker
 * inside a string (`"src/**\/*.ts"`) is not a comment. Template literals
 * are treated as strings whole.
 */
function stripSource(text: string): { bare: string; code: string } {
  let code = "";
  let bare = "";
  let index = 0;
  while (index < text.length) {
    const char = text[index] ?? "";
    const next = text[index + 1];
    if (char === "/" && next === "/") {
      const end = text.indexOf("\n", index);
      index = end === -1 ? text.length : end;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = text.indexOf("*/", index + 2);
      index = end === -1 ? text.length : end + 2;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      let end = index + 1;
      while (end < text.length && text[end] !== char) {
        end += text[end] === "\\" ? 2 : 1;
      }
      code += text.slice(index, end + 1);
      bare += `${char}${char}`;
      index = end + 1;
      continue;
    }
    code += char;
    bare += char;
    index += 1;
  }
  return { bare, code };
}

/** Every rule `text` (a file under `src/core`) breaks; comments may name anything. */
function coreViolations(file: string, text: string): string[] {
  const { bare, code: source } = stripSource(text);
  const problems: string[] = [];
  if (BUN_GLOBAL.test(bare)) {
    problems.push("uses Bun.*");
  }
  for (const [pattern, name] of NODE_GLOBALS) {
    if (pattern.test(bare)) {
      problems.push(`uses the Node global ${name}`);
    }
  }
  if (TEMPLATE_IMPORT.test(source)) {
    problems.push("imports a template literal (unverifiable)");
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

  test("let strings name globals, and never hide code behind a comment marker in a string", () => {
    const harmless = [
      'const message = "the process. Buffer and __dirname are words here";',
      "const note = `Bun.file is not called`;",
    ].join("\n");
    expect(coreViolations(file, harmless)).toEqual([]);

    // `/*` in the glob would have opened a "comment" up to the next `*/`.
    const hidden = [
      'const glob = "src/**/*.ts";',
      'import { createAuth } from "@smog/auth/server";',
      "/* a real comment */",
    ].join("\n");
    expect(coreViolations(file, hidden)).toEqual([
      "@smog/auth/server is not on the core allow-list",
    ]);
  });

  test("refuse the Node globals and template-literal imports", () => {
    const source = [
      "const debug = process.env.DEBUG;",
      'const bytes = Buffer.from("x");',
      "const here = __dirname + __filename;",
      "const lazy = await import(`@smog/admin/server`);",
    ].join("\n");
    expect(coreViolations(file, source)).toEqual([
      "uses the Node global process",
      "uses the Node global Buffer",
      "uses the Node global __dirname",
      "uses the Node global __filename",
      "imports a template literal (unverifiable)",
    ]);
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
