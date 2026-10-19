// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the detector cases are source text that contains template literals.
/**
 * Source scans for the global constraints of phase 6:
 * - no code updates or upserts `sponsorship` outside an explicit
 *   allowlist, and only `server/transition.ts` writes its status (every
 *   status change goes through `transitionStatements`, with its event in
 *   the same batch);
 * - no float touches an amount in this package (`parseFloat(`, `Number(`).
 * Tests are not scanned: fixtures insert rows in any state.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..", "..");

/**
 * The files that may update or upsert `sponsorship`, each with its reason.
 * `status: true` only for the state machine's writer; any other entry's
 * writes are checked column by column and must not touch `status`. A
 * later task that needs such a write (the purge clearing `logo_key`)
 * adds its file here, with the reason.
 */
const WRITERS: Readonly<Record<string, { reason: string; status: boolean }>> = {
  "packages/features/sponsorships/src/server/orphan-logos.ts": {
    reason:
      "the retention purge clears logo_key on sponsorships that ended 30 days ago (ruling 9)",
    status: false,
  },
  "packages/features/sponsorships/src/server/sweeps.ts": {
    reason:
      "the retention purge clears video_asset_id and video_playback_id of videos rejected 30 days ago (phase 8 ruling 13)",
    status: false,
  },
  "packages/features/sponsorships/src/server/transition.ts": {
    reason: "transitionStatements, the only status writer",
    status: true,
  },
};

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

/** `sponsorship as x` in an import: `x` names the table too. */
const ALIAS = /\bsponsorship\s+as\s+(\w+)/g;
/** The raw table name, optionally schema-qualified and quoted. */
const RAW_TABLE = String.raw`\\?["'\x60]?(?:\w+\.)?sponsorship\\?["'\x60]?(?![\w])`;
const RAW_WRITES = [
  new RegExp(String.raw`\bUPDATE\s+(?:OR\s+\w+\s+)?${RAW_TABLE}`, "gi"),
  new RegExp(
    String.raw`\b(?:INSERT\s+OR\s+REPLACE|REPLACE)\s+INTO\s+${RAW_TABLE}`,
    "gi"
  ),
  new RegExp(
    String.raw`\bINSERT\s+INTO\s+${RAW_TABLE}[\s\S]{0,400}?\bON\s+CONFLICT\b`,
    "gi"
  ),
];
const WRITE_END = /\.where\(|\bWHERE\b|;/i;
const STATUS = /\bstatus\b/;

function escapeRegExp(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Every update or upsert of `sponsorship` in `source` (Drizzle, aliased
 * or namespaced; `sql` interpolation; raw SQL), as the text from the
 * write to its `WHERE` (at most 600 characters).
 */
function sponsorshipWrites(source: string): string[] {
  const names = new Set(["sponsorship"]);
  for (const match of source.matchAll(ALIAS)) {
    names.add(match[1] as string);
  }
  const table = `(?:\\w+\\.)?(?:${[...names].map(escapeRegExp).join("|")})`;
  const patterns = [
    new RegExp(String.raw`\.update\(\s*${table}\s*\)`, "g"),
    new RegExp(
      String.raw`\.insert\(\s*${table}\s*\)[\s\S]{0,400}?onConflictDo(?:Update|Nothing)`,
      "g"
    ),
    new RegExp(
      String.raw`\bUPDATE\s+(?:OR\s+\w+\s+)?\$\{\s*${table}\s*\}`,
      "gi"
    ),
    new RegExp(
      String.raw`\bINSERT\s+INTO\s+\$\{\s*${table}\s*\}[\s\S]{0,400}?\bON\s+CONFLICT\b`,
      "gi"
    ),
    ...RAW_WRITES,
  ];
  const found: string[] = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const rest = source.slice(
        match.index + match[0].length,
        match.index + 600
      );
      const end = rest.search(WRITE_END);
      found.push(match[0] + (end === -1 ? rest : rest.slice(0, end)));
    }
  }
  return found;
}

describe("no sponsorship writes outside the allowlist (fix round 1, I-2)", () => {
  test.each([
    [
      "sql UPDATE with the status column",
      "sql`UPDATE ${sponsorship} SET ${sponsorship.status} = 'live' WHERE id = ${id}`",
    ],
    [
      "sql UPDATE with a bare status",
      "sql`UPDATE ${sponsorship} SET status = 'live' WHERE id = 1`",
    ],
    [
      "an aliased import",
      'import { sponsorship as s } from "@smog/db";\ndb.update(s).set({ status: "live" })',
    ],
    [
      "a namespaced table",
      "db.update(schema.sponsorship).set({ status: 'live' })",
    ],
    [
      "a set from a variable",
      'const v = { status: "live" };\ndb.update(sponsorship).set(v).where(x)',
    ],
    ["a spread set", "db.update(sponsorship).set({ ...patch }).where(x)"],
    [
      "an upsert",
      "db.insert(sponsorship).values(row).onConflictDoUpdate({ target: sponsorship.id, set: { status } })",
    ],
    ["a quoted key", "db.update(sponsorship).set({ 'status': 'live' })"],
    ["a computed key", "db.update(sponsorship).set({ ['status']: 'live' })"],
    [
      "a raw alias",
      "db.prepare('UPDATE sponsorship AS s SET status = ? WHERE s.id = ?')",
    ],
    [
      "a schema-qualified raw table",
      "db.prepare('UPDATE main.sponsorship SET status = ?')",
    ],
    [
      "an escaped quoted raw table",
      'db.prepare("UPDATE \\"sponsorship\\" SET status = 2 WHERE id = ?")',
    ],
    [
      "a raw upsert",
      "INSERT INTO sponsorship (id, status) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET status = excluded.status",
    ],
    ["a raw replace", "INSERT OR REPLACE INTO sponsorship VALUES (?)"],
  ])("finds %s", (_label, source) => {
    expect(sponsorshipWrites(source)).toHaveLength(1);
  });

  test.each([
    ["another table", "db.update(payment).set({ status: 'paid' })"],
    ["the token table", "db.update(sponsorshipToken).set({ usedAt })"],
    ["a raw token table update", "UPDATE sponsorship_token SET used_at = 1"],
    [
      "a read",
      "sql`SELECT 1 FROM ${sponsorship} WHERE ${sponsorship.status} = 'live'`",
    ],
    [
      "a plain insert",
      "db.insert(sponsorship).values({ status: 'awaiting_payment' })",
    ],
    [
      "an event insert",
      "db.insert(sponsorshipEvent).values(row).onConflictDoNothing()",
    ],
  ])("ignores %s", (_label, source) => {
    expect(sponsorshipWrites(source)).toEqual([]);
  });

  test("only the allowlisted files write sponsorship, and only transition.ts its status", () => {
    const offenders: string[] = [];
    const seen = new Map<string, number>();
    for (const base of ["apps", "packages", "scripts"]) {
      for (const file of sourceFiles(join(ROOT, base))) {
        const writes = sponsorshipWrites(readFileSync(file, "utf8"));
        if (writes.length === 0) {
          continue;
        }
        const path = relative(ROOT, file).split(sep).join("/");
        const allowed = WRITERS[path];
        seen.set(path, writes.length);
        if (!allowed) {
          offenders.push(
            `${path}: not allowlisted: ${writes[0]?.slice(0, 80)}`
          );
        } else if (!allowed.status) {
          for (const write of writes.filter((w) => STATUS.test(w))) {
            offenders.push(`${path}: writes status: ${write.slice(0, 80)}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
    // The scan sees every allowlisted writer, so it is not scanning nothing.
    for (const path of Object.keys(WRITERS)) {
      expect(seen.get(path) ?? 0).toBeGreaterThan(0);
    }
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
