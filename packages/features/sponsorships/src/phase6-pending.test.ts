/**
 * Phase 6 is done: no task 3 stub (`notImplemented(`) may come back in the
 * sponsorship server, and the e2e skip flags that waited for them
 * (`apps/site/e2e/phase6.ts` and its `PHASE6_PENDING` object, review I-6
 * of task 8) are gone for good, so no sponsor e2e test can be skipped
 * again by a flag. Task 9 deleted them; this guard keeps them out.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..", "..");
const SERVER = join(import.meta.dir, "server");
const E2E = join(ROOT, "apps", "site", "e2e");
const PENDING_FILE = join(E2E, "phase6.ts");

/** Built from parts, so this file does not match itself. */
const PENDING_FLAG = ["PHASE6", "PENDING"].join("_");
/** A call of the stub helper, not its definition. */
const STUB_CALL = /(?<!function )\bnotImplemented\(/;
const SCRIPT_FILE = /\.(?:ts|tsx|js|mjs)$/;

interface Phase6State {
  /** Source files by path, from the e2e directory. */
  e2e: Readonly<Record<string, string>>;
  pendingFileExists: boolean;
  /** Server source files by name. */
  server: Readonly<Record<string, string>>;
}

/** What must not come back: an empty list when nothing did. */
function phase6Leftovers(state: Phase6State): string[] {
  const leftovers = Object.entries(state.server)
    .filter(([, source]) => STUB_CALL.test(source))
    .map(([name]) => `notImplemented( in server/${name}`);
  if (state.pendingFileExists) {
    leftovers.push("apps/site/e2e/phase6.ts exists");
  }
  for (const [path, source] of Object.entries(state.e2e)) {
    if (source.includes(PENDING_FLAG)) {
      leftovers.push(`${PENDING_FLAG} in ${path}`);
    }
  }
  return leftovers;
}

function sources(dir: string, keep: (name: string) => boolean): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && keep(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

describe("phase 6 leaves no stub and no e2e skip flag (review I-6)", () => {
  test("the detector names every leftover", () => {
    expect(
      phase6Leftovers({
        e2e: {
          "sponsor.spec.ts": `import { ${PENDING_FLAG} } from "./phase6";`,
        },
        pendingFileExists: true,
        server: {
          "checkout.ts": "export const checkout = () => notImplemented();",
          "procedure.ts":
            "export function notImplemented(): never { throw 1; }",
        },
      })
    ).toEqual([
      "notImplemented( in server/checkout.ts",
      "apps/site/e2e/phase6.ts exists",
      `${PENDING_FLAG} in sponsor.spec.ts`,
    ]);
    expect(
      phase6Leftovers({ e2e: {}, pendingFileExists: false, server: {} })
    ).toEqual([]);
  });

  test("the repository", () => {
    const server = Object.fromEntries(
      readdirSync(SERVER)
        .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
        .map((name) => [name, readFileSync(join(SERVER, name), "utf8")])
    );
    const e2e = Object.fromEntries(
      sources(E2E, (name) => SCRIPT_FILE.test(name)).map((path) => [
        relative(E2E, path),
        readFileSync(path, "utf8"),
      ])
    );
    expect(
      phase6Leftovers({
        e2e,
        pendingFileExists: existsSync(PENDING_FILE),
        server,
      })
    ).toEqual([]);
  });
});
