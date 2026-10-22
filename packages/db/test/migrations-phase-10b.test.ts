import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  ADMIN2_ID,
  ADMIN_ID,
  applyLegacySeed,
  BANNED_ADMIN_ID,
  dataTables,
  LEARNER_EN_ID,
  LEARNER_FR_ID,
  LEARNER_NL_ID,
  LEARNER_NONE_ID,
  rowsWithColumns,
  seedRealisticData,
  snapshotTables,
  type TableDump,
} from "./legacy-data";

/*
 * The phase 10b migrations (0015 onward) on a database that already has data:
 * 0000-0014, the frozen dev seed and a realistic fill (`legacy-data.ts`:
 * admins, a banned admin, learners, sessions, lists, sponsorships with
 * payments, render jobs and events), a snapshot of every table, then each
 * migration in turn. The tests run in order on one database: each one applies
 * the next migration and checks it against the snapshot of the data before.
 *
 * 0015 rebuilds `user` and `sponsor`. `DROP TABLE` runs the foreign key
 * actions in D1 (the `PRAGMA foreign_keys = OFF` toggle is a no-op inside its
 * migration transaction), so the migration backs up and restores every
 * dependent row: the first test proves that nothing is lost.
 */

const db = env.MIGRATION_DB;

const upTo = (last: string) =>
  env.TEST_MIGRATIONS.filter((migration) => migration.name <= `${last}_~`);

let before: TableDump = {};
let tables: string[] = [];

async function expectUnchanged(): Promise<void> {
  for (const table of tables) {
    const dump = before[table];
    if (!dump) {
      throw new Error(`no snapshot of ${table}`);
    }
    const rows = await rowsWithColumns(db, table, dump.columns);
    expect(rows, `table ${table}`).toEqual(dump.rows);
  }
}

describe("migration 0015_language", () => {
  it("rebuilds user and sponsor without losing a row of any table", async () => {
    await applyD1Migrations(
      db,
      env.TEST_MIGRATIONS.filter((migration) => migration.name < "0015")
    );
    await applyLegacySeed(db, env.LEGACY_SEED_SQL);
    await seedRealisticData(db);
    tables = await dataTables(db);
    before = await snapshotTables(db, tables);
    // The fill is realistic: every table that references user or sponsor has rows.
    for (const table of [
      "user",
      "session",
      "account",
      "passkey",
      "consent_event",
      "guest_import",
      "favorite",
      "list",
      "list_item",
      "list_share",
      "audit_log",
      "sponsor",
      "invoice_request",
      "sponsorship",
      "payment_item",
      "render_job",
      "sponsorship_event",
      "sponsorship_token",
    ]) {
      expect(before[table]?.rows.length, table).toBeGreaterThan(0);
    }

    await applyD1Migrations(db, upTo("0015"));

    await expectUnchanged();
    expect(
      (await db.prepare("SELECT * FROM pragma_foreign_key_check").all()).results
    ).toEqual([]);
    // No backup or scratch table is left behind.
    expect(
      (
        await db
          .prepare(
            "SELECT name FROM sqlite_master WHERE name LIKE '_bk_%' OR name LIKE '__new_%'"
          )
          .all()
      ).results
    ).toEqual([]);
  });

  it("seeds nl (the default), en and fr", async () => {
    expect(
      (
        await db
          .prepare(
            "SELECT code, name, intl_tag, enabled, is_default, sort_order FROM language ORDER BY sort_order"
          )
          .all()
      ).results
    ).toEqual([
      {
        code: "nl",
        enabled: 1,
        intl_tag: "nl-BE",
        is_default: 1,
        name: "Nederlands",
        sort_order: 0,
      },
      {
        code: "en",
        enabled: 1,
        intl_tag: "en-BE",
        is_default: 0,
        name: "English",
        sort_order: 1,
      },
      {
        code: "fr",
        enabled: 1,
        intl_tag: "fr-BE",
        is_default: 0,
        name: "Français",
        sort_order: 2,
      },
    ]);
  });

  it("replaces the locale CHECKs with foreign keys to language", async () => {
    const sql = async (table: string) =>
      (
        await db
          .prepare("SELECT sql FROM sqlite_master WHERE name = ?")
          .bind(table)
          .first<{ sql: string }>()
      )?.sql ?? "";
    expect(await sql("user")).not.toContain("user_locale_check");
    expect(await sql("sponsor")).not.toContain("sponsor_locale_check");
    // A language an admin adds is accepted, an unknown one refused.
    await db
      .prepare(
        "INSERT INTO language (code, name, intl_tag, enabled, is_default, sort_order) VALUES ('de', 'Deutsch', 'de-BE', 1, 0, 3)"
      )
      .run();
    await db
      .prepare("UPDATE user SET locale = 'de' WHERE id = ?")
      .bind(LEARNER_NONE_ID)
      .run();
    await db
      .prepare("UPDATE user SET locale = NULL WHERE id = ?")
      .bind(LEARNER_NONE_ID)
      .run();
    await expect(
      db
        .prepare("UPDATE user SET locale = 'xx' WHERE id = ?")
        .bind(LEARNER_NONE_ID)
        .run()
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
    await expect(
      db.prepare("UPDATE sponsor SET locale = 'xx' WHERE id = 'sp-nl'").run()
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
    // A language in use cannot be deleted, the default never.
    await expect(
      db.prepare("DELETE FROM language WHERE code = 'fr'").run()
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
    await expect(
      db.prepare("DELETE FROM language WHERE code = 'nl'").run()
    ).rejects.toThrow(/default_language/);
    await db.prepare("DELETE FROM language WHERE code = 'de'").run();
    // At most one default.
    await expect(
      db.prepare("UPDATE language SET is_default = 1 WHERE code = 'en'").run()
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it("keeps the foreign key actions of every dependent table", async () => {
    // A user delete still cascades and nulls (the actions were recreated
    // with the tables that carry them, and the rebuilt user is the parent).
    await db
      .prepare(
        "INSERT INTO user (id, name, email, email_verified, role, created_at, updated_at) VALUES ('u-tmp', 'Tmp', 'tmp@example.test', 1, 'user', 1, 1)"
      )
      .run();
    await db.batch([
      db.prepare(
        "INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id) VALUES ('s-tmp', 9, 'tok-tmp', 1, 1, 'u-tmp')"
      ),
      db.prepare(
        "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, data, created_at) VALUES ('al-tmp', 'u-tmp', 'user.unban', 'user', 'x', '{}', 1)"
      ),
      db.prepare(
        "INSERT INTO sponsorship_event (id, sponsorship_id, type, actor_id, data, created_at) VALUES ('se-tmp', 'ss-live', 'approved', 'u-tmp', '{}', 1)"
      ),
    ]);
    await db.prepare("DELETE FROM user WHERE id = 'u-tmp'").run();
    expect(
      await db
        .prepare("SELECT count(*) AS n FROM session WHERE id = 's-tmp'")
        .first()
    ).toEqual({ n: 0 });
    expect(
      await db
        .prepare(
          "SELECT (SELECT actor_id FROM audit_log WHERE id = 'al-tmp') AS a, (SELECT actor_id FROM sponsorship_event WHERE id = 'se-tmp') AS e"
        )
        .first()
    ).toEqual({ a: null, e: null });
    await db.batch([
      db.prepare("DELETE FROM audit_log WHERE id = 'al-tmp'"),
      db.prepare("DELETE FROM sponsorship_event WHERE id = 'se-tmp'"),
    ]);
    // A sponsor with sponsorships still cannot be deleted (RESTRICT).
    await expect(
      db.prepare("DELETE FROM sponsor WHERE id = 'sp-nl'").run()
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
    await expectUnchanged();
  });

  it("still refuses to remove the last admin (the trigger is back)", async () => {
    expect(
      (
        await db
          .prepare(
            "SELECT name, tbl_name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'user'"
          )
          .all()
      ).results
    ).toEqual([{ name: "user_keep_one_admin", tbl_name: "user" }]);
    // The seeded admin and admin2 are active, the third admin is banned. The
    // first demotion is fine, the second would leave no active admin.
    await db
      .prepare("UPDATE user SET role = 'user' WHERE id = ?")
      .bind(ADMIN2_ID)
      .run();
    await expect(
      db
        .prepare("UPDATE user SET role = 'user' WHERE id = ?")
        .bind(ADMIN_ID)
        .run()
    ).rejects.toThrow(/last_admin/);
    await db
      .prepare("UPDATE user SET role = 'admin' WHERE id = ?")
      .bind(ADMIN2_ID)
      .run();
    // Restore the snapshot state for the next steps.
    expect(
      await db
        .prepare("SELECT role FROM user WHERE id = ?")
        .bind(BANNED_ADMIN_ID)
        .first()
    ).toEqual({ role: "admin" });
    expect(
      (
        await db
          .prepare("SELECT id, locale FROM user WHERE id IN (?, ?, ?)")
          .bind(LEARNER_NL_ID, LEARNER_FR_ID, LEARNER_EN_ID)
          .all()
      ).results.length
    ).toBe(3);
  });
});
