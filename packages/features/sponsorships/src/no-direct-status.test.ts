/**
 * Source scans for the global constraints of phase 6:
 * - no code writes `sponsorship.status` except `server/transition.ts`
 *   (every status change goes through `transitionStatements`, with its
 *   event in the same batch);
 * - no float touches an amount in this package (`parseFloat(`, `Number(`).
 * Tests are not scanned: fixtures insert rows in any state.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..", "..");
const ALLOWED = join(
  "packages",
  "features",
  "sponsorships",
  "src",
  "server",
  "transition.ts"
);
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".wrangler",
  ".turbo",
  ".output",
  ".expo",
  "test",
  "e2e",
  "__fixtures__",
]);
const SOURCE = /\.(ts|tsx|mts)$/;
const FLOAT_PARSE = /\bparseFloat\(|\bNumber\(/;
const TEST_FILE = /\.test\.(ts|tsx)$/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith(".")) {
      continue;
    }
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      sourceFiles(path, out);
    } else if (SOURCE.test(name) && !TEST_FILE.test(name)) {
      out.push(path);
    }
  }
  return out;
}

const DRIZZLE_UPDATE = /\.update\(\s*sponsorship\s*\)/g;
const STATUS_KEY = /\bstatus\s*[:,}]/;
const RAW_UPDATE =
  /UPDATE\s+\\?["'`]?sponsorship\\?["'`]?\s+SET\b([\s\S]{0,400}?)(?:WHERE|;|`)/gi;
const RAW_STATUS = /\bstatus\b/i;

/** The places in `source` that set `sponsorship.status` (empty when none). */
function directStatusWrites(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(DRIZZLE_UPDATE)) {
    const rest = source.slice(match.index, match.index + 600);
    const end = rest.indexOf(".where(");
    const chain = end === -1 ? rest : rest.slice(0, end);
    if (STATUS_KEY.test(chain)) {
      found.push(chain.slice(0, 80));
    }
  }
  for (const match of source.matchAll(RAW_UPDATE)) {
    if (RAW_STATUS.test(match[1] ?? "")) {
      found.push(match[0].slice(0, 80));
    }
  }
  return found;
}

describe("no direct sponsorship status writes", () => {
  test("the detector finds both shapes and ignores other columns and tables", () => {
    expect(
      directStatusWrites(
        "db.update(sponsorship).set({ status: 'live' }).where(x)"
      )
    ).toHaveLength(1);
    expect(
      directStatusWrites(
        "db.update(sponsorship)\n  .set({ endsAt, status })\n  .where(x)"
      )
    ).toHaveLength(1);
    expect(
      directStatusWrites(
        "sql`UPDATE sponsorship SET status = 'live' WHERE id = 1`"
      )
    ).toHaveLength(1);
    expect(
      directStatusWrites(
        'db.prepare("UPDATE \\"sponsorship\\" SET updated_at = 1, status = 2 WHERE id = ?")'
      )
    ).toHaveLength(1);
    expect(
      directStatusWrites(
        "db.update(sponsorship).set({ logoKey: null }).where(eq(sponsorship.status, 'x'))"
      )
    ).toEqual([]);
    expect(
      directStatusWrites("db.update(payment).set({ status: 'paid' })")
    ).toEqual([]);
  });

  test("only server/transition.ts writes sponsorship.status", () => {
    const offenders: string[] = [];
    let allowedWrites = 0;
    for (const base of ["apps", "packages", "scripts"]) {
      for (const file of sourceFiles(join(ROOT, base))) {
        const writes = directStatusWrites(readFileSync(file, "utf8"));
        const path = relative(ROOT, file);
        if (path === ALLOWED) {
          allowedWrites += writes.length;
        } else if (writes.length > 0) {
          offenders.push(`${path.split(sep).join("/")}: ${writes.join(" | ")}`);
        }
      }
    }
    expect(offenders).toEqual([]);
    // The scan sees the one real writer, so it is not scanning nothing.
    expect(allowedWrites).toBe(1);
  });
});

describe("money is integer cents (ruling 3)", () => {
  test("no float parsing in @smog/sponsorships", () => {
    const offenders = sourceFiles(join(import.meta.dir)).filter((file) =>
      FLOAT_PARSE.test(readFileSync(file, "utf8"))
    );
    expect(offenders.map((file) => relative(ROOT, file))).toEqual([]);
  });
});
