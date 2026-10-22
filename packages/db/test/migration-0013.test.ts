import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from "../src/enums";

/*
 * Migration 0013 (`dead_letter`, phase 9 task 4, ruling 5a) rebuilds
 * `audit_log` to widen its two CHECK constraints. This runs it on a seeded
 * table: 0000-0012 and the dev seed first, then `ROWS` audit entries
 * (every old action, `legacy` rows with `data` and NULL `actor_id`, rows of
 * an admin who still exists), then 0013. Every row, every index and the FK
 * (`ON DELETE SET NULL`) must survive, the new values must be accepted and
 * an unknown one refused, and no trigger may be lost (`user`'s
 * `user_keep_one_admin` is the only trigger in the schema; none is on
 * `audit_log`).
 */

const db = env.MIGRATION_DB;

/** The size of the seeded table the rebuild ran on (reported in the task). */
const ROWS = 30_000;
const ADMIN_ID = "5eed0003-0000-4000-8000-000000000001";

async function applySeed(): Promise<void> {
  const statements = env.LEGACY_SEED_SQL.split("\n").filter(
    (line) => line.trim() !== "" && !line.startsWith("--")
  );
  await db.batch(statements.map((line) => db.prepare(line)));
}

interface AuditRow {
  action: string;
  actor_id: string | null;
  created_at: number;
  data: string;
  id: string;
  target_id: string | null;
  target_type: string;
}

const AUDIT_ROWS_SQL =
  "SELECT id, actor_id, action, target_type, target_id, data, created_at FROM audit_log ORDER BY id";

const INDEXES_SQL =
  "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'audit_log' AND sql IS NOT NULL ORDER BY name";

const AUDIT_ACTION_CHECK = /CHECK constraint failed/;

async function seedAuditRows(): Promise<void> {
  // 29 000 admin entries with a rotating action and target, 500 `legacy`
  // rows with free `data` and no actor, 500 `system` rows with no target.
  await db
    .prepare(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${ROWS - 1000})
       INSERT INTO audit_log (id, actor_id, action, target_type, target_id, data, created_at)
       SELECT 'a-' || printf('%06d', i), ?, 'gesture.update', 'gesture', 'g-' || (i % 50), '{"fields":["name"],"name":"Hond","slug":"hond"}', 1700000000000 + i * 1000 FROM n`
    )
    .bind(ADMIN_ID)
    .run();
  await db
    .prepare(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 500)
       INSERT INTO audit_log (id, actor_id, action, target_type, target_id, data, created_at)
       SELECT 'l-' || printf('%06d', i), NULL, 'legacy', 'system', NULL, '{"legacy":{"op":"import","n":' || i || '}}', 1600000000000 + i FROM n`
    )
    .run();
  await db
    .prepare(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 500)
       INSERT INTO audit_log (id, actor_id, action, target_type, target_id, data, created_at)
       SELECT 's-' || printf('%06d', i), ?, 'export.sponsorships_csv', 'system', NULL, '{"filters":{},"rows":3}', 1750000000000 + i FROM n`
    )
    .bind(ADMIN_ID)
    .run();
}

describe("migration 0013_dead_letter", () => {
  it("rebuilds audit_log without losing a row or an index, and widens the checks", async () => {
    await applyD1Migrations(
      db,
      env.TEST_MIGRATIONS.filter((migration) => migration.name < "0013")
    );
    await applySeed();
    await seedAuditRows();
    const before = await db.prepare(AUDIT_ROWS_SQL).all<AuditRow>();
    const indexesBefore = await db.prepare(INDEXES_SQL).all();
    expect(before.results.length).toBe(ROWS);
    expect(before.results.some((row) => row.actor_id === null)).toBe(true);
    expect(indexesBefore.results.length).toBe(5);

    const started = Date.now();
    // Only through 0013: later migrations add triggers and rebuild audit_log again.
    await applyD1Migrations(
      db,
      env.TEST_MIGRATIONS.filter((migration) => migration.name < "0014")
    );
    const elapsedMs = Date.now() - started;
    // Reported in the task; no assertion on speed (CI machines differ).
    console.log(
      `[migration-0013] rebuilt ${ROWS} audit rows in ${elapsedMs} ms`
    );

    const after = await db.prepare(AUDIT_ROWS_SQL).all<AuditRow>();
    expect(after.results.length).toBe(ROWS);
    expect(after.results).toEqual(before.results);
    // `legacy` rows keep their `data` and their NULL actor.
    expect(
      await db
        .prepare(
          "SELECT count(*) AS n FROM audit_log WHERE action = 'legacy' AND actor_id IS NULL AND data LIKE '{\"legacy\":%'"
        )
        .first()
    ).toEqual({ n: 500 });
    // The same five indexes, same definitions.
    expect((await db.prepare(INDEXES_SQL).all()).results).toEqual(
      indexesBefore.results
    );
    // No trigger was lost: only `user_keep_one_admin` exists, on `user`.
    expect(
      (
        await db
          .prepare(
            "SELECT name, tbl_name FROM sqlite_master WHERE type = 'trigger'"
          )
          .all()
      ).results
    ).toEqual([{ name: "user_keep_one_admin", tbl_name: "user" }]);
    expect(
      (await db.prepare("SELECT * FROM pragma_foreign_key_check").all()).results
    ).toEqual([]);
  });

  it("accepts the new values, still refuses an unknown one, and keeps ON DELETE SET NULL", async () => {
    await applyD1Migrations(db, env.TEST_MIGRATIONS);
    await db
      .prepare(
        "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, data, created_at) VALUES ('d-1', ?, 'dead_letter.replay', 'dead_letter', 'm-1', '{}', 1), ('d-2', ?, 'dead_letter.discard', 'dead_letter', 'm-2', '{}', 2)"
      )
      .bind(ADMIN_ID, ADMIN_ID)
      .run();
    await expect(
      db
        .prepare(
          "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, data, created_at) VALUES ('d-3', NULL, 'dead_letter.nope', 'dead_letter', NULL, '{}', 3)"
        )
        .run()
    ).rejects.toThrow(AUDIT_ACTION_CHECK);
    await expect(
      db
        .prepare(
          "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, data, created_at) VALUES ('d-4', NULL, 'legacy', 'dead_letters', NULL, '{}', 3)"
        )
        .run()
    ).rejects.toThrow(AUDIT_ACTION_CHECK);

    // The foreign key survived the rebuild: deleting the actor nulls it.
    await db
      .prepare(
        "INSERT INTO user (id, name, email, email_verified, role, created_at, updated_at) VALUES ('u-gone', 'Gone', 'gone@example.test', 1, 'user', 1, 1)"
      )
      .run();
    await db
      .prepare(
        "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, data, created_at) VALUES ('d-5', 'u-gone', 'user.unban', 'user', 'x', '{}', 5)"
      )
      .run();
    await db.prepare("DELETE FROM user WHERE id = 'u-gone'").run();
    expect(
      await db
        .prepare("SELECT actor_id FROM audit_log WHERE id = 'd-5'")
        .first()
    ).toEqual({ actor_id: null });
  });

  it("accepts every action and target type of the enums (the CHECK lists match the code)", async () => {
    await applyD1Migrations(db, env.TEST_MIGRATIONS);
    const statements = AUDIT_ACTIONS.flatMap((action, i) =>
      AUDIT_TARGET_TYPES.map((type, j) =>
        db
          .prepare(
            "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, data, created_at) VALUES (?, NULL, ?, ?, NULL, '{}', 1)"
          )
          .bind(`enum-${i}-${j}`, action, type)
      )
    );
    await db.batch(statements);
    expect(
      await db
        .prepare("SELECT count(*) AS n FROM audit_log WHERE id LIKE 'enum-%'")
        .first<{ n: number }>()
    ).toEqual({ n: AUDIT_ACTIONS.length * AUDIT_TARGET_TYPES.length });
    expect(AUDIT_ACTIONS).toEqual(
      expect.arrayContaining(["dead_letter.replay", "dead_letter.discard"])
    );
  });

  it("creates dead_letter with its indexes, checks and a partial open index", async () => {
    await applyD1Migrations(db, env.TEST_MIGRATIONS);
    const columns = await db
      .prepare(
        "SELECT name, \"notnull\" FROM pragma_table_info('dead_letter') ORDER BY cid"
      )
      .all<{ name: string; notnull: number }>();
    expect(columns.results.map((column) => column.name)).toEqual([
      "id",
      "queue",
      "origin_queue",
      "type",
      "attempts",
      "received_at",
      "body",
      "replayable",
      "replayed_at",
      "discarded_at",
      "error",
    ]);
    const indexes = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'dead_letter' AND sql IS NOT NULL ORDER BY name"
      )
      .all<{ name: string }>();
    expect(indexes.results.map((index) => index.name)).toEqual([
      "dead_letter_open_idx",
      "dead_letter_received_at_idx",
    ]);
    await expect(
      db
        .prepare(
          "INSERT INTO dead_letter (id, queue, origin_queue, type, attempts, received_at, replayable) VALUES ('x', 'q', 'sms', 't', 1, 1, 0)"
        )
        .run()
    ).rejects.toThrow(AUDIT_ACTION_CHECK);
  });
});
