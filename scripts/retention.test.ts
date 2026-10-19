import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildCountCommand,
  buildCountSql,
  parseRetentionArgs,
  type Runner,
  runRetentionDryRun,
} from "./retention";

const WRITES = /\b(DELETE|UPDATE|INSERT|DROP|REPLACE|ALTER)\b/i;

const ROW = {
  audit_log: 2,
  expired_session_max: 1_790_000_000_000,
  expired_session_min: 1_780_000_000_000,
  logos_released: 1,
  now_ms: 1_791_000_000_000,
  rejected_videos: 6,
  rejected_videos_kept: 7,
  session: 5,
  sponsorship_token: 3,
  verification: 4,
};

/** A runner that records the call and answers like `wrangler --json`. */
function fakeRunner(row: Record<string, unknown> = ROW, exitCode = 0) {
  const calls: { argv: readonly string[]; cwd: string }[] = [];
  const runner: Runner = (argv, cwd) => {
    calls.push({ argv, cwd });
    return {
      exitCode,
      stdout: JSON.stringify([{ results: [row], success: true }]),
    };
  };
  return { calls, runner };
}

describe("parseRetentionArgs", () => {
  test("takes the env and requires --dry-run", () => {
    expect(parseRetentionArgs(["--env", "staging", "--dry-run"])).toEqual({
      env: "staging",
    });
    expect(parseRetentionArgs(["--dry-run", "--env=dev"])).toEqual({
      env: "dev",
    });
    expect(() => parseRetentionArgs(["--env", "staging"])).toThrow(
      "Only --dry-run"
    );
    expect(() => parseRetentionArgs(["--env", "prod", "--dry-run"])).toThrow(
      "Pass --env"
    );
    expect(() => parseRetentionArgs(["--dry-run", "--yes"])).toThrow(
      "Unknown argument"
    );
  });
});

describe("the count statement", () => {
  test("is one read-only SELECT", () => {
    const sql = buildCountSql();
    expect(sql.startsWith("SELECT ")).toBe(true);
    expect(sql).not.toMatch(WRITES);
    expect(sql.match(/;/g)).toHaveLength(1);
  });

  test("uses the purge's windows in milliseconds", () => {
    const sql = buildCountSql();
    expect(sql).toContain(
      "created_at < CAST(unixepoch('subsec') * 1000 AS INTEGER) - 94608000000"
    );
    expect(sql).toContain("- 2505600000");
    expect(sql).toContain("- 2592000000");
    expect(sql).toContain("pi.includes_logo = 1");
  });

  test("counts the rejected videos past the bound, from the rejected event only", () => {
    const sql = buildCountSql();
    // REJECTED_VIDEO_RETENTION_DAYS (30) from the latest `rejected` event,
    // as `runRetentionPurge` selects them (phase 8 ruling 13).
    expect(sql).toContain(
      "(SELECT count(*) FROM sponsorship s WHERE s.status = 'rejected' AND s.video_asset_id IS NOT NULL AND (SELECT max(ev.created_at) FROM sponsorship_event ev WHERE ev.sponsorship_id = s.id AND ev.type = 'rejected') <= CAST(unixepoch('subsec') * 1000 AS INTEGER) - 2592000000) AS rejected_videos"
    );
    // Migrated rejections (no `rejected` event) are never purged.
    expect(sql).toContain(
      "(SELECT count(*) FROM sponsorship s WHERE s.status = 'rejected' AND s.video_asset_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sponsorship_event ev WHERE ev.sponsorship_id = s.id AND ev.type = 'rejected')) AS rejected_videos_kept"
    );
  });

  test("reads the remote D1 outside dev, the local one in dev, as JSON", () => {
    expect(buildCountCommand("staging").slice(0, 8)).toEqual([
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--env",
      "staging",
      "--remote",
      "--json",
    ]);
    expect(buildCountCommand("dev")).toContain("--local");
  });
});

const MIGRATIONS = join(import.meta.dir, "..", "packages", "db", "migrations");
const DAY = 86_400_000;

/** An in-memory SQLite with every D1 migration; foreign keys stay off. */
function migrated(): Database {
  const db = new Database(":memory:");
  for (const file of readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }
  db.exec("PRAGMA foreign_keys = OFF");
  return db;
}

function addRejected(
  db: Database,
  id: string,
  { asset, rejectedDaysAgo }: { asset: string | null; rejectedDaysAgo?: number }
): void {
  db.run(
    "INSERT INTO sponsorship (id, sponsor_id, gesture_id, display_name, status, video_asset_id, created_at, updated_at) VALUES (?, 'sp', ?, 'Name', 'rejected', ?, 1, 1)",
    [id, `g-${id}`, asset]
  );
  db.run(
    "INSERT INTO sponsorship_event (id, sponsorship_id, type, data, created_at) VALUES (?, ?, 'legacy', '{}', 1)",
    [`legacy-${id}`, id]
  );
  if (rejectedDaysAgo !== undefined) {
    db.run(
      "INSERT INTO sponsorship_event (id, sponsorship_id, type, data, created_at) VALUES (?, ?, 'rejected', '{}', ?)",
      [`rejected-${id}`, id, Date.now() - rejectedDaysAgo * DAY]
    );
  }
}

describe("the count statement on D1's schema", () => {
  test("counts rejected videos as the purge selects them", () => {
    const db = migrated();
    addRejected(db, "old", { asset: "a1", rejectedDaysAgo: 31 });
    addRejected(db, "young", { asset: "a2", rejectedDaysAgo: 29 });
    addRejected(db, "cleared", { asset: null, rejectedDaysAgo: 40 });
    addRejected(db, "migrated", { asset: "a3" });

    const row = db.query(buildCountSql()).get() as Record<string, number>;

    expect(row.rejected_videos).toBe(1);
    expect(row.rejected_videos_kept).toBe(1);
    expect(row.audit_log).toBe(0);
  });
});

describe("runRetentionDryRun", () => {
  test("runs wrangler once from apps/site and prints the counts", () => {
    const { calls, runner } = fakeRunner();

    const lines = runRetentionDryRun({ env: "staging" }, runner);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.argv[0]).toBe("bunx");
    expect(calls[0]?.cwd.endsWith("apps/site")).toBe(true);
    expect(lines).toContain("  expired sessions: 5");
    expect(lines).toContain("  audit_log older than 3 × 365 days: 2");
    expect(lines).toContain("  sponsorships whose logo would be released: 1");
    expect(lines).toContain(
      "  rejected videos past 30 days (Mux assets deleted, or only unlinked while a gesture or a running sponsorship still uses them; at most 20 per night): 6"
    );
    expect(lines).toContain(
      "  rejected videos without a rejected event (migrated, never purged): 7"
    );
    expect(lines.join("\n")).not.toContain("WARNING");
  });

  test("warns when the session times are not milliseconds", () => {
    const { runner } = fakeRunner({
      ...ROW,
      expired_session_max: 1_790_000_000,
    });

    const lines = runRetentionDryRun({ env: "production" }, runner);

    expect(lines.at(-1)).toContain("WARNING");
  });

  test("fails when wrangler fails", () => {
    const { runner } = fakeRunner(ROW, 1);

    expect(() => runRetentionDryRun({ env: "staging" }, runner)).toThrow(
      "wrangler exited with 1"
    );
  });
});
