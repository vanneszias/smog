/**
 * Phase 6 is done, and this repo-level guard keeps it that way (phase 6
 * review M-9, moved here from `@smog/sponsorships`, which should not read
 * `apps/site/e2e`):
 *
 * - No task 3 stub (`notImplemented(`) comes back anywhere under the
 *   sponsorship server, subdirectories included.
 * - The e2e skip flags that waited for those stubs (`apps/site/e2e/phase6.ts`
 *   and its `PHASE6_PENDING` object, task 8 review I-6) stay gone.
 * - No sponsor e2e test is skipped by any other condition: the only
 *   `skip`/`fixme`/`only`/`fail` calls in the sponsor specs are the review
 *   screenshot switches listed in `ALLOWED_SKIPS`.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SERVER = join(
  ROOT,
  "packages",
  "features",
  "sponsorships",
  "src",
  "server"
);
const E2E = join(ROOT, "apps", "site", "e2e");
const PENDING_FILE = join(E2E, "phase6.ts");

/** Built from parts, so this file does not match itself. */
const PENDING_FLAG = ["PHASE6", "PENDING"].join("_");
/** A call of the stub helper, not its definition. */
const STUB_CALL = /(?<!function )\bnotImplemented\(/;
const SCRIPT_FILE = /\.(?:ts|tsx|js|mjs)$/;
const SERVER_FILE = /\.tsx?$/;
const TEST_FILE = /\.test\.tsx?$/;
/** The sponsor specs: the wizard and its pages, and the admin screens. */
const SPONSOR_SPEC = /^(?:sponsor.*|admin-sponsorships.*)\.spec\.ts$/;
/** `test.skip(`, `test.describe.fixme(`, `test.only(`, `testInfo.fail(`, … */
const SKIP_CALL = /\.(?:skip|fixme|only|fail)\s*\(/;

/**
 * The skips a sponsor spec may hold, by file: the review screenshots, which
 * run only on request. Each is one whole line, so a new condition (or a
 * reworded one) fails the guard.
 */
const ALLOWED_SKIPS: Readonly<Record<string, readonly string[]>> = {
  "admin-sponsorships-a11y.spec.ts": [
    'test.skip(!dir, "set ADMIN_SHOTS_DIR to take the review screenshots");',
  ],
  "sponsor.spec.ts": [
    'test.skip(!dir, "set SPONSOR_SHOTS_DIR to take the review screenshots");',
  ],
};

interface Phase6State {
  /** Source files by path, from the e2e directory. */
  e2e: Readonly<Record<string, string>>;
  pendingFileExists: boolean;
  /** Server source files by path, from the server directory. */
  server: Readonly<Record<string, string>>;
}

/** The skip lines of a sponsor spec that are not on its allowlist. */
function unexpectedSkips(path: string, source: string): string[] {
  const allowed = ALLOWED_SKIPS[basename(path)] ?? [];
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => SKIP_CALL.test(line) && !allowed.includes(line));
}

/** What must not come back: an empty list when nothing did. */
function phase6Leftovers(state: Phase6State): string[] {
  const leftovers = Object.entries(state.server)
    .filter(([, source]) => STUB_CALL.test(source))
    .map(([path]) => `notImplemented( in server/${path}`);
  if (state.pendingFileExists) {
    leftovers.push("apps/site/e2e/phase6.ts exists");
  }
  for (const [path, source] of Object.entries(state.e2e)) {
    if (source.includes(PENDING_FLAG)) {
      leftovers.push(`${PENDING_FLAG} in ${path}`);
    }
    if (SPONSOR_SPEC.test(basename(path))) {
      for (const line of unexpectedSkips(path, source)) {
        leftovers.push(`a skip in ${path}: ${line}`);
      }
    }
  }
  return leftovers;
}

/** Every file under `dir` (recursively) whose name `keep` accepts. */
function sources(
  dir: string,
  keep: (name: string) => boolean
): Record<string, string> {
  return Object.fromEntries(
    readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && keep(entry.name))
      .map((entry) => {
        const path = join(entry.parentPath, entry.name);
        return [relative(dir, path), readFileSync(path, "utf8")];
      })
  );
}

describe("phase 6 leaves no stub and no skipped sponsor e2e (review M-9)", () => {
  test("the detector names every leftover", () => {
    expect(
      phase6Leftovers({
        e2e: {
          "admin-sponsorships.spec.ts": [
            'test.describe.fixme("later", () => {});',
            "  test.skip(",
          ].join("\n"),
          "csp.spec.ts": 'test.skip(!key, "not a sponsor spec");',
          "sponsor.spec.ts": [
            `import { ${PENDING_FLAG} } from "./phase6";`,
            '  test.skip(!dir, "set SPONSOR_SHOTS_DIR to take the review screenshots");',
            '  test.skip(await probe(page), "the server is not ready");',
            '  test.only("focus", async () => {});',
          ].join("\n"),
        },
        pendingFileExists: true,
        server: {
          "checkout.ts": "export const checkout = () => notImplemented();",
          "nested/refund.ts": "export const refund = () => notImplemented();",
          "procedure.ts":
            "export function notImplemented(): never { throw 1; }",
        },
      })
    ).toEqual([
      "notImplemented( in server/checkout.ts",
      "notImplemented( in server/nested/refund.ts",
      "apps/site/e2e/phase6.ts exists",
      'a skip in admin-sponsorships.spec.ts: test.describe.fixme("later", () => {});',
      "a skip in admin-sponsorships.spec.ts: test.skip(",
      `${PENDING_FLAG} in sponsor.spec.ts`,
      'a skip in sponsor.spec.ts: test.skip(await probe(page), "the server is not ready");',
      'a skip in sponsor.spec.ts: test.only("focus", async () => {});',
    ]);
    expect(
      phase6Leftovers({ e2e: {}, pendingFileExists: false, server: {} })
    ).toEqual([]);
  });

  test("the repository", () => {
    const server = sources(
      SERVER,
      (name) => SERVER_FILE.test(name) && !TEST_FILE.test(name)
    );
    const e2e = sources(E2E, (name) => SCRIPT_FILE.test(name));
    // The scan sees the sponsor specs it guards.
    expect(Object.keys(e2e)).toContain("sponsor.spec.ts");
    expect(Object.keys(server).length).toBeGreaterThan(0);
    expect(
      phase6Leftovers({
        e2e,
        pendingFileExists: existsSync(PENDING_FILE),
        server,
      })
    ).toEqual([]);
  });
});
