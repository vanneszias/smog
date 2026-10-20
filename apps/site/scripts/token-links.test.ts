import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Phase 9 ruling 7: a sponsorship link (`/sponsor/edit`, `/sponsor/renew`)
 * carries its raw token in the URL fragment, never in a query. This fails
 * on any new `?token=` / `&token=` in source outside the allow-list: the
 * Better Auth links (their tokens are single-use and the server reads
 * them) and the mobile magic link.
 */
const ROOT = join(import.meta.dir, "..", "..", "..");
const SCANNED = [
  "packages",
  "apps/site/src",
  "apps/mobile/app",
  "apps/mobile/src",
];
const SOURCE = /\.(?:ts|tsx)$/;
const TEST_FILE = /\.test\.tsx?$/;
const COMMENT_LINE = /^\s*(?:\*|\/\/|\/\*)/;
const QUERY_TOKEN = /[?&]token=/;
const SKIPPED_DIRS = new Set(["node_modules", "dist", ".wrangler", "test"]);

/** File → the URL tails a line may hold with a query token. */
const ALLOWED: Record<string, readonly string[]> = {
  "packages/email/src/samples.ts": [
    "/api/auth/magic-link/verify?token=sample`",
    "/reset-password?token=sample`",
    "/api/auth/verify-email?token=sample`",
  ],
};
/** The mobile magic link (`/magic-link/app?token=`) in the app's intent. */
const MOBILE_MAGIC_LINK = /\/magic-link(?:\/app)?\?token=/;

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!SKIPPED_DIRS.has(name)) {
        yield* sources(path);
      }
    } else if (SOURCE.test(name) && !TEST_FILE.test(name)) {
      yield path;
    }
  }
}

function offenders(): string[] {
  const found: string[] = [];
  for (const area of SCANNED) {
    for (const file of sources(join(ROOT, area))) {
      const name = relative(ROOT, file);
      const allowed = ALLOWED[name] ?? [];
      for (const [index, raw] of readFileSync(file, "utf8")
        .split("\n")
        .entries()) {
        const line = raw.trim();
        if (
          COMMENT_LINE.test(line) ||
          !QUERY_TOKEN.test(line) ||
          allowed.some((tail) => line.endsWith(`${tail},`)) ||
          (name.startsWith("apps/mobile/") && MOBILE_MAGIC_LINK.test(line))
        ) {
          continue;
        }
        found.push(`${name}:${index + 1}`);
      }
    }
  }
  return found;
}

describe("no sponsorship link is built with a ?token= query (phase 9 ruling 7)", () => {
  test("the sources hold no query token outside the allow-list", () => {
    expect(offenders()).toEqual([]);
  });

  test("the allow-list is not stale", () => {
    for (const [file, lines] of Object.entries(ALLOWED)) {
      const text = readFileSync(join(ROOT, file), "utf8");
      for (const line of lines) {
        expect(text, `${file}: ${line}`).toContain(line);
      }
    }
  });
});
