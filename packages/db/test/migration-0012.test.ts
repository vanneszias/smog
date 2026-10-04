import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

/*
 * Migration 0012 (`user_welcomed_at`, phase 8 ruling 16) on the dev seed:
 * 0000–0011 and the seed first, then a verified member and an unverified
 * one, then 0012. Verified accounts are marked welcomed at their
 * `updated_at` (they were welcomed, or predate the welcome email);
 * unverified ones stay NULL, so their verification still sends it. It is
 * `ADD COLUMN` plus an `UPDATE` of `welcomed_at` only: no table rebuild,
 * so 0007's `user_keep_one_admin` trigger survives, and the backfill does
 * not touch `role`, so it runs on a database with exactly one admin.
 */

const db = env.MIGRATION_DB;

const ADMIN_ID = "5eed0003-0000-4000-8000-000000000001";
const LAST_ADMIN = /last_admin/;

async function applySeed(): Promise<void> {
  const statements = env.SEED_SQL.split("\n").filter(
    (line) => line.trim() !== "" && !line.startsWith("--")
  );
  await db.batch(statements.map((line) => db.prepare(line)));
}

interface UserRow {
  email_verified: number;
  id: string;
  role: string;
  updated_at: number;
  welcomed_at: number | null;
}

describe("migration 0012_user_welcomed_at", () => {
  it("backfills verified accounts and leaves unverified ones NULL", async () => {
    await applyD1Migrations(
      db,
      env.TEST_MIGRATIONS.filter((migration) => migration.name < "0012")
    );
    await applySeed();
    await db.batch([
      db.prepare(
        "INSERT INTO user (id, name, email, email_verified, role, created_at, updated_at) VALUES ('u-verified', 'Ada', 'ada@example.test', 1, 'user', 1000, 2000)"
      ),
      db.prepare(
        "INSERT INTO user (id, name, email, email_verified, role, created_at, updated_at) VALUES ('u-unverified', 'Bo', 'bo@example.test', 0, 'user', 3000, 4000)"
      ),
    ]);
    const before = await db
      .prepare("SELECT id, role, updated_at FROM user ORDER BY id")
      .all<Pick<UserRow, "id" | "role" | "updated_at">>();
    // The seed has exactly one admin: the backfill must not need another.
    expect(
      await db
        .prepare("SELECT count(*) AS admins FROM user WHERE role = 'admin'")
        .first<{ admins: number }>()
    ).toEqual({ admins: 1 });

    await applyD1Migrations(db, env.TEST_MIGRATIONS);

    const rows = await db
      .prepare(
        "SELECT id, email_verified, role, updated_at, welcomed_at FROM user ORDER BY id"
      )
      .all<UserRow>();
    expect(rows.results.length).toBe(before.results.length);
    for (const row of rows.results) {
      expect(row.welcomed_at).toBe(
        row.email_verified === 1 ? row.updated_at : null
      );
    }
    expect(
      rows.results.find((row) => row.id === "u-verified")?.welcomed_at
    ).toBe(2000);
    expect(
      rows.results.find((row) => row.id === "u-unverified")?.welcomed_at
    ).toBeNull();
    expect(rows.results.find((row) => row.id === ADMIN_ID)).toMatchObject({
      role: "admin",
      welcomed_at: 1_767_225_600_000,
    });
    // No other column changed (`updated_at`, `role`).
    expect(
      rows.results.map(({ id, role, updated_at }) => ({ id, role, updated_at }))
    ).toEqual(before.results);
  });

  it("is ADD COLUMN only: the user_keep_one_admin trigger survives and still fires", async () => {
    await applyD1Migrations(db, env.TEST_MIGRATIONS);

    expect(
      await db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'user'"
        )
        .all<{ name: string }>()
    ).toMatchObject({ results: [{ name: "user_keep_one_admin" }] });
    const column = await db
      .prepare(
        "SELECT type, \"notnull\", dflt_value FROM pragma_table_info('user') WHERE name = 'welcomed_at'"
      )
      .first();
    expect(column).toEqual({ dflt_value: null, notnull: 0, type: "INTEGER" });

    await db
      .prepare(
        "INSERT INTO user (id, name, email, email_verified, role, created_at, updated_at) VALUES ('u-only-admin', 'Cy', 'cy@example.test', 1, 'admin', 1, 1)"
      )
      .run();
    await db
      .prepare("UPDATE user SET role = 'user' WHERE role = 'admin' AND id <> ?")
      .bind("u-only-admin")
      .run();
    await expect(
      db
        .prepare("UPDATE user SET role = 'user' WHERE id = 'u-only-admin'")
        .run()
    ).rejects.toThrow(LAST_ADMIN);
  });
});
