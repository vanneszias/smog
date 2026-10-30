import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  ADMIN_ID,
  ADMIN2_ID,
  applyLegacySeed,
  BANNED_ADMIN_ID,
  dataTables,
  LEARNER_EN_ID,
  LEARNER_FR_ID,
  LEARNER_NL_ID,
  LEARNER_NONE_ID,
  rowsWithColumns,
  seedBulkAudit,
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

const FOREIGN_KEY_FAILED = /FOREIGN KEY constraint failed/;
const UNIQUE_FAILED = /UNIQUE constraint failed/;
const CHECK_FAILED = /CHECK constraint failed/;
const LAST_ADMIN = /last_admin/;
const DEFAULT_LANGUAGE = /default_language/;
const SECTION_ID = /^[a-z0-9-]+$/;

/** Audit rows on top of the realistic fill (the `actor_id` backup is the heavy part). */
const BULK_AUDIT_ROWS = 30_000;

const upTo = (last: string) =>
  env.TEST_MIGRATIONS.filter((migration) => migration.name <= `${last}_~`);

let before: TableDump = {};
let tables: string[] = [];
let ftsBefore: Record<string, unknown>[] = [];

async function expectUnchanged(): Promise<void> {
  for (const table of tables) {
    const dump = before[table];
    if (!dump) {
      throw new Error(`no snapshot of ${table}`);
    }
    // biome-ignore lint/performance/noAwaitInLoops: a few table reads, in order.
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
    await seedBulkAudit(db, BULK_AUDIT_ROWS);
    tables = await dataTables(db);
    before = await snapshotTables(db, tables);
    ftsBefore = (
      await db
        .prepare(
          "SELECT gesture_id, name, keywords, categories, description FROM gesture_fts ORDER BY gesture_id"
        )
        .all<Record<string, unknown>>()
    ).results;
    // One gesture has no index row (it is written by the migration).
    expect(ftsBefore.length).toBe((before.gesture?.rows.length ?? 0) - 1);
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

    const started = Date.now();
    await applyD1Migrations(db, upTo("0015"));
    // Reported in the task; no assertion on speed (CI machines differ).
    console.log(
      `[migration-0015] rebuilt user and sponsor with ${before.audit_log?.rows.length} audit rows in ${Date.now() - started} ms`
    );

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
    ).rejects.toThrow(FOREIGN_KEY_FAILED);
    await expect(
      db.prepare("UPDATE sponsor SET locale = 'xx' WHERE id = 'sp-nl'").run()
    ).rejects.toThrow(FOREIGN_KEY_FAILED);
    // A language in use cannot be deleted, the default never.
    await expect(
      db.prepare("DELETE FROM language WHERE code = 'fr'").run()
    ).rejects.toThrow(FOREIGN_KEY_FAILED);
    await expect(
      db.prepare("DELETE FROM language WHERE code = 'nl'").run()
    ).rejects.toThrow(DEFAULT_LANGUAGE);
    await db.prepare("DELETE FROM language WHERE code = 'de'").run();
    // At most one default.
    await expect(
      db.prepare("UPDATE language SET is_default = 1 WHERE code = 'en'").run()
    ).rejects.toThrow(UNIQUE_FAILED);
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
    ).rejects.toThrow(FOREIGN_KEY_FAILED);
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
    ).rejects.toThrow(LAST_ADMIN);
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

const NEW_AUDIT_ACTIONS = [
  "user.role_grant",
  "user.role_revoke",
  "language.create",
  "language.update",
  "translation.string_save",
  "translation.string_import",
  "translation.gesture_save",
  "translation.category_save",
  "translation.audio_upload",
  "translation.audio_delete",
  "gesture.recut_done",
  "legal.draft_save",
  "legal.publish",
  "legal.restore",
];

const insertUser = (id: string, role: string, extra = "") =>
  db
    .prepare(
      `INSERT INTO user (id, name, email, email_verified, role, created_at, updated_at${extra ? ", banned" : ""}) VALUES (?, 'T', ?, 1, ?, 1, 1${extra ? ", 1" : ""})`
    )
    .bind(id, `${id}@example.test`, role);

const roleRows = async (userId: string): Promise<string[]> =>
  (
    await db
      .prepare("SELECT role FROM user_role WHERE user_id = ? ORDER BY role")
      .bind(userId)
      .all<{ role: string }>()
  ).results.map((row) => row.role);

const userRole = async (userId: string): Promise<string | undefined> =>
  (
    await db
      .prepare("SELECT role FROM user WHERE id = ?")
      .bind(userId)
      .first<{ role: string }>()
  )?.role;

describe("migrations 0016 to 0023", () => {
  it("applies the rest and leaves every earlier table unchanged", async () => {
    await applyD1Migrations(db, env.TEST_MIGRATIONS);
    await expectUnchanged();
    expect(
      (await db.prepare("SELECT * FROM pragma_foreign_key_check").all()).results
    ).toEqual([]);
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

  it("creates ui_string, the translations and gesture_audio empty, with their constraints", async () => {
    for (const table of [
      "ui_string",
      "gesture_translation",
      "category_translation",
      "gesture_audio",
    ]) {
      expect(
        // biome-ignore lint/performance/noAwaitInLoops: four counts, in order.
        await db.prepare(`SELECT count(*) AS n FROM ${table}`).first(),
        table
      ).toEqual({ n: 0 });
    }
    // Every existing keyword became a Dutch one (the rebuild's default).
    expect(
      await db
        .prepare(
          "SELECT count(*) AS total, count(*) FILTER (WHERE locale = 'nl') AS nl FROM gesture_keyword"
        )
        .first()
    ).toEqual({
      nl: before.gesture_keyword?.rows.length,
      total: before.gesture_keyword?.rows.length,
    });
    // A keyword per language, the same word allowed in another one, never twice in one.
    await db.batch([
      db.prepare(
        "INSERT INTO gesture_keyword (gesture_id, locale, keyword, position) VALUES ('g-cafe', 'fr', 'koffie', 0), ('g-cafe', 'en', 'koffie', 0)"
      ),
    ]);
    await expect(
      db
        .prepare(
          "INSERT INTO gesture_keyword (gesture_id, locale, keyword, position) VALUES ('g-cafe', 'nl', 'koffie', 5)"
        )
        .run()
    ).rejects.toThrow(UNIQUE_FAILED);
    await expect(
      db
        .prepare(
          "INSERT INTO gesture_keyword (gesture_id, locale, keyword, position) VALUES ('g-cafe', 'xx', 'k', 0)"
        )
        .run()
    ).rejects.toThrow(FOREIGN_KEY_FAILED);
    await db
      .prepare("DELETE FROM gesture_keyword WHERE locale IN ('fr', 'en')")
      .run();

    await db.batch([
      db.prepare(
        "INSERT INTO gesture_translation (gesture_id, locale, name, description, updated_at) VALUES ('g-cafe', 'fr', 'Café', 'Commander un café.', 1)"
      ),
      db.prepare(
        "INSERT INTO category_translation (category_id, locale, name, updated_at) VALUES ('c-hidden', 'fr', 'Caché', 1)"
      ),
      db.prepare(
        "INSERT INTO ui_string (locale, key, value, source_hash, updated_at) VALUES ('fr', 'common.save', 'Enregistrer', 'abc', 1)"
      ),
    ]);
    await expect(
      db
        .prepare(
          "INSERT INTO gesture_translation (gesture_id, locale, name, updated_at) VALUES ('g-cafe', 'fr', 'Doublon', 1)"
        )
        .run()
    ).rejects.toThrow(UNIQUE_FAILED);
    await expect(
      db
        .prepare(
          "INSERT INTO gesture_translation (gesture_id, locale, name, updated_at) VALUES ('g-cafe', 'xx', 'Nope', 1)"
        )
        .run()
    ).rejects.toThrow(FOREIGN_KEY_FAILED);
    await expect(
      db
        .prepare(
          "INSERT INTO ui_string (locale, key, value, updated_at) VALUES ('en', 'k', '', 1)"
        )
        .run()
    ).rejects.toThrow(CHECK_FAILED);

    const audio = (
      key: string,
      locale: string,
      type: string,
      size: number,
      duration: number
    ) =>
      db
        .prepare(
          "INSERT INTO gesture_audio (gesture_id, locale, r2_key, content_type, size, duration_ms, updated_at) VALUES ('g-cafe', ?, ?, ?, ?, ?, 1)"
        )
        .bind(locale, key, type, size, duration);
    await audio("audio/g-cafe/fr/1", "fr", "audio/mpeg", 4096, 1500).run();
    await expect(
      audio("audio/g-cafe/fr/2", "fr", "audio/mpeg", 4096, 1500).run()
    ).rejects.toThrow(UNIQUE_FAILED);
    await expect(
      audio("audio/g-cafe/fr/1", "en", "audio/mpeg", 4096, 1500).run()
    ).rejects.toThrow(UNIQUE_FAILED);
    await expect(
      audio("audio/g-cafe/en/1", "en", "audio/wav", 4096, 1500).run()
    ).rejects.toThrow(CHECK_FAILED);
    await expect(
      audio("audio/g-cafe/en/1", "en", "audio/mp4", 1_048_577, 1500).run()
    ).rejects.toThrow(CHECK_FAILED);
    await expect(
      audio("audio/g-cafe/en/1", "en", "audio/mp4", 0, 1500).run()
    ).rejects.toThrow(CHECK_FAILED);
    await expect(
      audio("audio/g-cafe/en/1", "en", "audio/mp4", 4096, 10_001).run()
    ).rejects.toThrow(CHECK_FAILED);
    await audio(
      "audio/g-cafe/en/1",
      "en",
      "audio/mp4",
      1_048_576,
      10_000
    ).run();

    // A deleted gesture takes its translations and audio with it.
    await db.batch([
      db.prepare(
        "INSERT INTO gesture (id, slug, name, sort_name, description, playback_id, created_at, updated_at) VALUES ('g-tmp', 'tmp', 'Tmp', 'tmp', '', 'pb', 1, 1)"
      ),
      db.prepare(
        "INSERT INTO gesture_translation (gesture_id, locale, name, updated_at) VALUES ('g-tmp', 'fr', 'Tmp', 1)"
      ),
      db.prepare(
        "INSERT INTO gesture_audio (gesture_id, locale, r2_key, content_type, size, duration_ms, updated_at) VALUES ('g-tmp', 'fr', 'audio/g-tmp/fr/1', 'audio/mpeg', 10, 10, 1)"
      ),
    ]);
    await db.prepare("DELETE FROM gesture WHERE id = 'g-tmp'").run();
    expect(
      await db
        .prepare(
          "SELECT (SELECT count(*) FROM gesture_translation WHERE gesture_id = 'g-tmp') + (SELECT count(*) FROM gesture_audio WHERE gesture_id = 'g-tmp') AS n"
        )
        .first()
    ).toEqual({ n: 0 });
    // Clean up the rows this test added.
    await db.batch([
      db.prepare("DELETE FROM gesture_translation"),
      db.prepare("DELETE FROM category_translation"),
      db.prepare("DELETE FROM ui_string"),
      db.prepare("DELETE FROM gesture_audio"),
    ]);
  });

  it("seeds version 1 of both legal texts in every language from the shipped texts", async () => {
    const rows = await db
      .prepare(
        "SELECT id, kind, locale, version, status, effective_date, published_at, content FROM legal_text WHERE version = 1 ORDER BY kind, locale"
      )
      .all<{
        content: string;
        effective_date: string;
        id: string;
        kind: string;
        locale: string;
        published_at: number;
        status: string;
        version: number;
      }>();
    expect(rows.results.map((row) => `${row.kind}/${row.locale}`)).toEqual([
      "privacy/en",
      "privacy/fr",
      "privacy/nl",
      "terms/en",
      "terms/fr",
      "terms/nl",
    ]);
    const sectionIds: Record<string, string[]> = {};
    for (const row of rows.results) {
      expect(row.version).toBe(1);
      expect(row.status).toBe("published");
      expect(row.effective_date).toBe("2026-09-30");
      expect(row.published_at).toBe(Date.UTC(2026, 8, 30));
      const document = JSON.parse(row.content) as {
        sections: { blocks: unknown[]; id: string; title: string }[];
        title: string;
      };
      expect(document.title.length).toBeGreaterThan(0);
      expect(document.sections.length).toBeGreaterThan(3);
      for (const section of document.sections) {
        expect(section.id).toMatch(SECTION_ID);
        expect(section.title.length).toBeGreaterThan(0);
        expect(section.blocks.length).toBeGreaterThan(0);
      }
      // The anchors are the same in every language (`/privacy#rights`).
      const ids = document.sections.map((section) => section.id);
      sectionIds[row.kind] ??= ids;
      expect(ids).toEqual(sectionIds[row.kind]);
      // The consent switch sits in the privacy notice, in every language.
      expect(row.content.includes('"consentControl":true')).toBe(
        row.kind === "privacy"
      );
    }
    // History is kept: a second version beside the first, one draft at most.
    await db
      .prepare(
        "INSERT INTO legal_text (id, kind, locale, version, content, effective_date, status, updated_at) VALUES ('d-1', 'terms', 'nl', 3, '{}', '2026-11-01', 'draft', 1)"
      )
      .run();
    await expect(
      db
        .prepare(
          "INSERT INTO legal_text (id, kind, locale, version, content, effective_date, status, updated_at) VALUES ('d-2', 'terms', 'nl', 4, '{}', '2026-11-01', 'draft', 1)"
        )
        .run()
    ).rejects.toThrow(UNIQUE_FAILED);
    await expect(
      db
        .prepare(
          "INSERT INTO legal_text (id, kind, locale, version, content, effective_date, status, updated_at, published_at) VALUES ('d-3', 'terms', 'fr', 3, '{}', '2026-11-01', 'draft', 1, 5)"
        )
        .run()
    ).rejects.toThrow(CHECK_FAILED);
    await expect(
      db
        .prepare(
          "INSERT INTO legal_text (id, kind, locale, version, content, effective_date, status, updated_at) VALUES ('d-4', 'terms', 'nl', 1, '{}', '2026-11-01', 'draft', 1)"
        )
        .run()
    ).rejects.toThrow(UNIQUE_FAILED);
    await expect(
      db
        .prepare(
          "INSERT INTO legal_text (id, kind, locale, version, content, effective_date, status, updated_at) VALUES ('d-5', 'terms', 'fr', 3, '{}', 'soon', 'draft', 1)"
        )
        .run()
    ).rejects.toThrow(CHECK_FAILED);
    await db.prepare("DELETE FROM legal_text WHERE id = 'd-1'").run();
  });

  it("seeds version 2 of both legal texts, published, effective 2026-10-29", async () => {
    const rows = await db
      .prepare(
        "SELECT kind, locale, status, effective_date, published_at FROM legal_text WHERE version = 2 ORDER BY kind, locale"
      )
      .all<{
        effective_date: string;
        kind: string;
        locale: string;
        published_at: number;
        status: string;
      }>();
    expect(rows.results.map((row) => `${row.kind}/${row.locale}`)).toEqual([
      "privacy/en",
      "privacy/fr",
      "privacy/nl",
      "terms/en",
      "terms/fr",
      "terms/nl",
    ]);
    for (const row of rows.results) {
      expect(row.status).toBe("published");
      expect(row.effective_date).toBe("2026-10-29");
      expect(row.published_at).toBe(Date.UTC(2026, 9, 29));
    }
  });

  it("copies every admin into user_role and nobody else", async () => {
    expect(
      (
        await db
          .prepare("SELECT user_id, role FROM user_role ORDER BY user_id")
          .all()
      ).results
    ).toEqual(
      [
        [ADMIN_ID, "admin"],
        [ADMIN2_ID, "admin"],
        [BANNED_ADMIN_ID, "admin"],
      ]
        .sort((a, b) => (a[0] as string).localeCompare(b[0] as string))
        .map(([user_id, role]) => ({ role, user_id }))
    );
    for (const id of [LEARNER_NL_ID, LEARNER_FR_ID, LEARNER_EN_ID]) {
      // biome-ignore lint/performance/noAwaitInLoops: three reads, in order.
      expect(await roleRows(id)).toEqual([]);
    }
  });

  it("refuses to remove the last active admin from user_role, banned admins do not count", async () => {
    // Active admins: the seed admin and admin2 (the third is banned).
    await db
      .prepare("DELETE FROM user_role WHERE user_id = ? AND role = 'admin'")
      .bind(ADMIN2_ID)
      .run();
    await expect(
      db
        .prepare("DELETE FROM user_role WHERE user_id = ? AND role = 'admin'")
        .bind(ADMIN_ID)
        .run()
    ).rejects.toThrow(LAST_ADMIN);
    await expect(
      db
        .prepare(
          "UPDATE user_role SET role = 'translator' WHERE user_id = ? AND role = 'admin'"
        )
        .bind(ADMIN_ID)
        .run()
    ).rejects.toThrow(LAST_ADMIN);
    // Moving the admin row to another user is a removal too.
    await expect(
      db
        .prepare(
          "UPDATE user_role SET user_id = ? WHERE user_id = ? AND role = 'admin'"
        )
        .bind(LEARNER_NL_ID, ADMIN_ID)
        .run()
    ).rejects.toThrow(LAST_ADMIN);
    // Other roles are never guarded.
    await db
      .prepare(
        "INSERT INTO user_role (user_id, role, granted_by, granted_at) VALUES (?, 'translator', ?, 1)"
      )
      .bind(ADMIN_ID, ADMIN_ID)
      .run();
    await db
      .prepare(
        "DELETE FROM user_role WHERE user_id = ? AND role = 'translator'"
      )
      .bind(ADMIN_ID)
      .run();
    // Giving admin2 the row back restores the state of the snapshot.
    await db
      .prepare(
        "INSERT INTO user_role (user_id, role, granted_by, granted_at) VALUES (?, 'admin', NULL, 1)"
      )
      .bind(ADMIN2_ID)
      .run();
    expect(await userRole(ADMIN2_ID)).toBe("admin");
    // A temporary ban on admin2 leaves the seed admin as the only active one.
    await db
      .prepare("UPDATE user SET banned = 1 WHERE id = ?")
      .bind(ADMIN2_ID)
      .run();
    await expect(
      db
        .prepare("DELETE FROM user_role WHERE user_id = ? AND role = 'admin'")
        .bind(ADMIN_ID)
        .run()
    ).rejects.toThrow(LAST_ADMIN);
    await db
      .prepare("UPDATE user SET banned = 0 WHERE id = ?")
      .bind(ADMIN2_ID)
      .run();
  });

  it("still lets an account be deleted when it holds the last admin row (a cascade is not refused)", async () => {
    // Only the new account is an active admin: ban the others, delete it.
    await db
      .prepare("UPDATE user SET banned = 1 WHERE id IN (?, ?)")
      .bind(ADMIN_ID, ADMIN2_ID)
      .run();
    await insertUser("u-last", "admin").run();
    expect(await roleRows("u-last")).toEqual(["admin"]);
    await db.prepare("DELETE FROM user WHERE id = 'u-last'").run();
    expect(await roleRows("u-last")).toEqual([]);
    await db
      .prepare("UPDATE user SET banned = 0 WHERE id IN (?, ?)")
      .bind(ADMIN_ID, ADMIN2_ID)
      .run();
  });

  it("keeps user.role and the admin row of user_role in step in both directions", async () => {
    // user.role -> user_role
    await db
      .prepare("UPDATE user SET role = 'admin' WHERE id = ?")
      .bind(LEARNER_NL_ID)
      .run();
    expect(await roleRows(LEARNER_NL_ID)).toEqual(["admin"]);
    await db
      .prepare("UPDATE user SET role = 'user' WHERE id = ?")
      .bind(LEARNER_NL_ID)
      .run();
    expect(await roleRows(LEARNER_NL_ID)).toEqual([]);
    await insertUser("u-new-admin", "admin").run();
    expect(await roleRows("u-new-admin")).toEqual(["admin"]);
    await insertUser("u-new-user", "user").run();
    expect(await roleRows("u-new-user")).toEqual([]);
    // user_role -> user.role
    await db
      .prepare(
        "INSERT INTO user_role (user_id, role, granted_by, granted_at) VALUES (?, 'admin', ?, 1), (?, 'translator', ?, 1)"
      )
      .bind(LEARNER_FR_ID, ADMIN_ID, LEARNER_EN_ID, ADMIN_ID)
      .run();
    expect(await userRole(LEARNER_FR_ID)).toBe("admin");
    // translator and teacher are not the legacy role
    expect(await userRole(LEARNER_EN_ID)).toBe("user");
    await db
      .prepare("DELETE FROM user_role WHERE user_id = ? AND role = 'admin'")
      .bind(LEARNER_FR_ID)
      .run();
    expect(await userRole(LEARNER_FR_ID)).toBe("user");
    // The legacy last-admin trigger still guards user.role (the seed admin
    // is the only active admin once the new one is gone).
    await db.prepare("DELETE FROM user WHERE id = 'u-new-admin'").run();
    await db
      .prepare("DELETE FROM user_role WHERE user_id = ? AND role = 'admin'")
      .bind(ADMIN2_ID)
      .run();
    expect(await userRole(ADMIN2_ID)).toBe("user");
    await expect(
      db
        .prepare("UPDATE user SET role = 'user' WHERE id = ?")
        .bind(ADMIN_ID)
        .run()
    ).rejects.toThrow(LAST_ADMIN);
    // Clean up: back to the snapshot.
    await db.batch([
      db.prepare("DELETE FROM user WHERE id IN ('u-new-admin', 'u-new-user')"),
      db.prepare("DELETE FROM user_role WHERE role = 'translator'"),
      db.prepare("UPDATE user SET role = 'admin' WHERE id = ?").bind(ADMIN2_ID),
    ]);
    expect(
      (
        await db
          .prepare("SELECT user_id FROM user_role ORDER BY user_id")
          .all<{ user_id: string }>()
      ).results.map((row) => row.user_id)
    ).toEqual([ADMIN_ID, ADMIN2_ID, BANNED_ADMIN_ID].sort());
    await expectUnchanged();
  });

  it("flags every existing gesture as needing a re-cut", async () => {
    const counts = await db
      .prepare(
        "SELECT count(*) AS total, count(*) FILTER (WHERE needs_recut = 1) AS recut FROM gesture"
      )
      .first<{ recut: number; total: number }>();
    expect(counts?.total).toBeGreaterThan(20);
    expect(counts?.recut).toBe(counts?.total);
    await db
      .prepare(
        "INSERT INTO gesture (id, slug, name, sort_name, playback_id, created_at, updated_at) VALUES ('g-new', 'new', 'Nieuw', 'nieuw', 'pb', 1, 1)"
      )
      .run();
    expect(
      await db
        .prepare("SELECT needs_recut FROM gesture WHERE id = 'g-new'")
        .first()
    ).toEqual({ needs_recut: 1 });
    await db.prepare("DELETE FROM gesture WHERE id = 'g-new'").run();
  });

  it("rebuilds gesture_fts with a locale: every old row is kept, as nl", async () => {
    const fts = await db
      .prepare(
        "SELECT gesture_id, locale, name, keywords, categories, description FROM gesture_fts ORDER BY gesture_id"
      )
      .all<{
        categories: string;
        description: string;
        gesture_id: string;
        keywords: string;
        locale: string;
        name: string;
      }>();
    expect(fts.results.length).toBe(before.gesture?.rows.length);
    expect(new Set(fts.results.map((row) => row.locale))).toEqual(
      new Set(["nl"])
    );
    expect(
      fts.results
        .filter((row) => row.gesture_id !== "g-nofts")
        .map(({ locale: _locale, ...row }) => row)
    ).toEqual(ftsBefore);
    expect(fts.results.find((row) => row.gesture_id === "g-nofts")).toEqual({
      categories: "Begroeten",
      description: "Niet geindexeerd.",
      gesture_id: "g-nofts",
      keywords: "kwijt",
      locale: "nl",
      name: "Vergeten",
    });
    // Keywords still match, and the bm25 weights still apply.
    const hits = await db
      .prepare(
        "SELECT gesture_id FROM gesture_fts WHERE gesture_fts MATCH '\"espresso bestellen\"' AND locale = 'nl' ORDER BY bm25(gesture_fts, 0.0, 10.0, 5.0, 3.0, 1.0)"
      )
      .all<{ gesture_id: string }>();
    expect(hits.results.map((row) => row.gesture_id)).toEqual(["g-cafe"]);
  });

  it("accepts the new audit actions and target types, and still refuses unknown ones", async () => {
    await db.batch(
      NEW_AUDIT_ACTIONS.map((action, i) =>
        db
          .prepare(
            "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, data, created_at) VALUES (?, NULL, ?, 'language', 'x', '{}', 1)"
          )
          .bind(`new-${i}`, action)
      )
    );
    await db.batch(
      ["language", "ui_string", "legal_text"].map((type) =>
        db
          .prepare(
            "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, data, created_at) VALUES (?, NULL, 'legacy', ?, NULL, '{}', 1)"
          )
          .bind(`type-${type}`, type)
      )
    );
    await expect(
      db
        .prepare(
          "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, data, created_at) VALUES ('bad', NULL, 'language.delete', 'language', NULL, '{}', 1)"
        )
        .run()
    ).rejects.toThrow(CHECK_FAILED);
    await db
      .prepare(
        "DELETE FROM audit_log WHERE id LIKE 'new-%' OR id LIKE 'type-%'"
      )
      .run();
    await expectUnchanged();
  });
});
