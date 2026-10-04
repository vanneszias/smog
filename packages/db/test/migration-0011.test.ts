import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

/*
 * Migration 0011 (`render_job_status_idx`, phase 7 ruling 12) on the dev
 * seed with a render job: 0000–0010 and the seed first, then a sponsorship
 * and its job, then 0011. The job must be untouched, and the watchdog's
 * per-status oldest-first read must be a seek on the new index with no
 * sort.
 */

const db = env.MIGRATION_DB;

async function applySeed(): Promise<void> {
  const statements = env.SEED_SQL.split("\n").filter(
    (line) => line.trim() !== "" && !line.startsWith("--")
  );
  await db.batch(statements.map((line) => db.prepare(line)));
}

describe("migration 0011_render_job_status_idx", () => {
  it("adds the index on the seeded database without touching the jobs", async () => {
    await applyD1Migrations(
      db,
      env.TEST_MIGRATIONS.filter((migration) => migration.name < "0011")
    );
    await applySeed();
    await db.batch([
      db.prepare(
        "INSERT INTO sponsor (id, name, email, locale, created_at) VALUES ('sp-1', 'Acme', 'acme@example.com', 'nl', 1)"
      ),
      db.prepare(
        "INSERT INTO sponsorship (id, sponsor_id, gesture_id, display_name, status, created_at, updated_at) SELECT 'sh-1', 'sp-1', id, 'Acme', 'rendering', 1, 1 FROM gesture ORDER BY id LIMIT 1"
      ),
      db.prepare(
        "INSERT INTO render_job (id, sponsorship_id, status, workflow_instance_id, input, attempt, created_at, updated_at) VALUES ('rj-1', 'sh-1', 'queued', 'rj-1', '{}', 1, 2, 3)"
      ),
    ]);

    await applyD1Migrations(db, env.TEST_MIGRATIONS);

    expect(
      await db
        .prepare(
          "SELECT id, sponsorship_id, status, attempt, created_at, updated_at FROM render_job"
        )
        .all()
    ).toMatchObject({
      results: [
        {
          attempt: 1,
          created_at: 2,
          id: "rj-1",
          sponsorship_id: "sh-1",
          status: "queued",
          updated_at: 3,
        },
      ],
    });
    expect(
      await db
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'render_job_status_updated_idx'"
        )
        .first<{ sql: string }>()
    ).toEqual({
      sql: "CREATE INDEX `render_job_status_updated_idx` ON `render_job` (`status`,`updated_at`)",
    });
  });

  it("makes the watchdog's oldest-first read a seek without a sort", async () => {
    await applyD1Migrations(db, env.TEST_MIGRATIONS);
    for (const status of ["queued", "running"]) {
      // biome-ignore lint/performance/noAwaitInLoops: two small reads, in order for a readable failure.
      const plan = await db
        .prepare(
          "EXPLAIN QUERY PLAN SELECT id FROM render_job WHERE status = ? AND updated_at < ? ORDER BY updated_at LIMIT 50"
        )
        .bind(status, Date.now())
        .all<{ detail: string }>();
      const detail = plan.results.map((row) => row.detail).join("\n");
      expect(detail).toContain(
        "SEARCH render_job USING INDEX render_job_status_updated_idx (status=? AND updated_at<?)"
      );
      expect(detail).not.toContain("TEMP B-TREE");
    }
  });
});
