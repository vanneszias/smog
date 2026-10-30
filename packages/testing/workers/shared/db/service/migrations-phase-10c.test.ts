import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  ADMIN_ID,
  applyLegacySeed,
  dataTables,
  rowsWithColumns,
  seedBulkAudit,
  seedRealisticData,
  snapshotTables,
  type TableDump,
} from "./legacy-data";

/*
 * The phase 10c migrations (0024 onward) on a database that already has
 * data: 0000-0014, the frozen dev seed and a realistic fill, then 0015 to
 * 0023, a snapshot of every table, then 0024 to 0027. The new tables are
 * created empty; 0027 rebuilds `audit_log` (its two CHECK lists), so a bulk
 * audit table proves that no row and no index is lost.
 */

const db = env.MIGRATION_DB;

const FOREIGN_KEY_FAILED = /FOREIGN KEY constraint failed/;
const UNIQUE_FAILED = /UNIQUE constraint failed/;
const CHECK_FAILED = /CHECK constraint failed/;

const BULK_AUDIT_ROWS = 20_000;

const NEW_TABLES = [
  "gesture_teacher_info",
  "gesture_drawing",
  "lesson",
  "lesson_translation",
  "lesson_section",
  "lesson_section_translation",
  "lesson_item",
];

const NEW_AUDIT_ACTIONS = [
  "teacher.info_save",
  "teacher.drawing_upload",
  "teacher.drawing_delete",
  "lesson.create",
  "lesson.update",
  "lesson.delete",
  "lesson.duplicate",
  "lesson.export",
];

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
    // biome-ignore lint/performance/noAwaitInLoops: a few table reads, in order.
    const rows = await rowsWithColumns(db, table, dump.columns);
    expect(rows, `table ${table}`).toEqual(dump.rows);
  }
}

const insertGestureInfo = (gestureId: string, locale: string) =>
  db
    .prepare(
      "INSERT INTO gesture_teacher_info (gesture_id, locale, updated_at) VALUES (?, ?, 1)"
    )
    .bind(gestureId, locale);

const insertUser = (id: string) =>
  db
    .prepare(
      "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, 'Naam', ?, 1, 1, 1)"
    )
    .bind(id, `${id}@example.test`);

describe("migrations 0024 to 0027", () => {
  it("creates the new tables empty and keeps every earlier table, audit_log and its indexes", async () => {
    await applyD1Migrations(
      db,
      env.TEST_MIGRATIONS.filter((migration) => migration.name < "0015")
    );
    await applyLegacySeed(db, env.LEGACY_SEED_SQL);
    await seedRealisticData(db);
    await seedBulkAudit(db, BULK_AUDIT_ROWS);
    await applyD1Migrations(db, upTo("0023"));
    tables = await dataTables(db);
    expect(tables).not.toContain("lesson");
    before = await snapshotTables(db, tables);
    const indexesBefore = (
      await db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'audit_log' ORDER BY name"
        )
        .all<{ name: string }>()
    ).results;
    expect(indexesBefore.length).toBeGreaterThanOrEqual(5);
    expect(before.audit_log?.rows.length).toBeGreaterThan(BULK_AUDIT_ROWS);

    const started = Date.now();
    await applyD1Migrations(db, upTo("0027"));
    console.log(
      `[migration-0027] rebuilt audit_log with ${before.audit_log?.rows.length} rows in ${Date.now() - started} ms (0024 to 0027)`
    );

    await expectUnchanged();
    expect(
      (
        await db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'audit_log' ORDER BY name"
          )
          .all<{ name: string }>()
      ).results
    ).toEqual(indexesBefore);
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
    for (const table of NEW_TABLES) {
      expect(
        // biome-ignore lint/performance/noAwaitInLoops: seven counts, in order.
        await db.prepare(`SELECT count(*) AS n FROM ${table}`).first(),
        table
      ).toEqual({ n: 0 });
    }
  });

  it("holds gesture_teacher_info to its caps, its key and its foreign keys", async () => {
    await insertGestureInfo("g-cafe", "nl").run();
    expect(
      await db
        .prepare(
          "SELECT hc, pl, or_, bw, c_note, note, summary, version FROM gesture_teacher_info"
        )
        .first()
    ).toEqual({
      bw: "",
      c_note: "",
      hc: "",
      note: "",
      or_: "",
      pl: "",
      summary: "",
      version: 1,
    });
    // One row per gesture and language; the same language on another gesture is fine.
    await expect(insertGestureInfo("g-cafe", "nl").run()).rejects.toThrow(
      UNIQUE_FAILED
    );
    await insertGestureInfo("g-cafe", "fr").run();
    // Unknown language and unknown gesture.
    await expect(insertGestureInfo("g-cafe", "xx").run()).rejects.toThrow(
      FOREIGN_KEY_FAILED
    );
    await expect(insertGestureInfo("g-none", "nl").run()).rejects.toThrow(
      FOREIGN_KEY_FAILED
    );
    // 2,000 characters fit, 2,001 do not (every long field).
    for (const column of [
      "hc",
      "pl",
      "or_",
      "bw",
      "c_note",
      "note",
      "summary",
    ]) {
      // biome-ignore lint/performance/noAwaitInLoops: seven columns, in order.
      await db
        .prepare(
          `UPDATE gesture_teacher_info SET ${column} = ? WHERE locale = 'fr'`
        )
        .bind("x".repeat(2000))
        .run();
      await expect(
        db
          .prepare(
            `UPDATE gesture_teacher_info SET ${column} = ? WHERE locale = 'fr'`
          )
          .bind("x".repeat(2001))
          .run(),
        column
      ).rejects.toThrow(CHECK_FAILED);
    }
    await expect(
      db
        .prepare(
          "UPDATE gesture_teacher_info SET version = 0 WHERE locale = 'fr'"
        )
        .run()
    ).rejects.toThrow(CHECK_FAILED);
    // The editor's account goes away: the row stays, `updated_by` is cleared.
    await insertUser("u-teacher-tmp").run();
    await db
      .prepare(
        "UPDATE gesture_teacher_info SET updated_by = 'u-teacher-tmp' WHERE locale = 'nl'"
      )
      .run();
    await db.prepare("DELETE FROM user WHERE id = 'u-teacher-tmp'").run();
    expect(
      await db
        .prepare(
          "SELECT updated_by FROM gesture_teacher_info WHERE locale = 'nl'"
        )
        .first()
    ).toEqual({ updated_by: null });
    await db.prepare("DELETE FROM gesture_teacher_info").run();
  });

  it("holds gesture_drawing to its caps and cascades from the gesture", async () => {
    const insert = (
      step: number,
      key: string,
      type = "image/png",
      size = 1000,
      width = 800,
      height = 600,
      credit = ""
    ) =>
      db
        .prepare(
          "INSERT INTO gesture_drawing (gesture_id, step, r2_key, content_type, size, width, height, credit, updated_at) VALUES ('g-cafe', ?, ?, ?, ?, ?, ?, ?, 1)"
        )
        .bind(step, key, type, size, width, height, credit);
    await insert(1, "teacher/drawings/g-cafe/1/a").run();
    await insert(
      2,
      "teacher/drawings/g-cafe/2/a",
      "image/webp",
      1_048_576,
      2000,
      2000,
      "x".repeat(120)
    ).run();
    await expect(
      insert(1, "teacher/drawings/g-cafe/1/b").run()
    ).rejects.toThrow(UNIQUE_FAILED);
    await expect(insert(3, "k3").run()).rejects.toThrow(CHECK_FAILED);
    await expect(insert(0, "k0").run()).rejects.toThrow(CHECK_FAILED);
    await expect(
      insert(2, "teacher/drawings/g-cafe/1/a").run()
    ).rejects.toThrow(UNIQUE_FAILED);
    const refused: [string, ReturnType<typeof insert>][] = [
      ["gif", insert(1, "kt", "image/gif")],
      ["empty", insert(1, "ks", "image/png", 0)],
      ["too big", insert(1, "kb", "image/png", 1_048_577)],
      ["too wide", insert(1, "kw", "image/png", 10, 2001)],
      ["too high", insert(1, "kh", "image/png", 10, 10, 2001)],
      [
        "long credit",
        insert(1, "kc", "image/png", 10, 10, 10, "x".repeat(121)),
      ],
    ];
    for (const [name, statement] of refused) {
      // biome-ignore lint/performance/noAwaitInLoops: six refusals, in order.
      await expect(statement.run(), name).rejects.toThrow(CHECK_FAILED);
    }
    // The gesture goes: its drawings go with it.
    await db
      .prepare(
        "INSERT INTO gesture (id, slug, name, sort_name, playback_id, created_at, updated_at) VALUES ('g-tmp', 'g-tmp', 'Tmp', 'tmp', 'p', 1, 1)"
      )
      .run();
    await db
      .prepare(
        "INSERT INTO gesture_drawing (gesture_id, step, r2_key, content_type, size, width, height, updated_at) VALUES ('g-tmp', 1, 'k-tmp', 'image/jpeg', 5, 5, 5, 1)"
      )
      .run();
    await db.prepare("DELETE FROM gesture WHERE id = 'g-tmp'").run();
    expect(
      await db
        .prepare(
          "SELECT count(*) AS n FROM gesture_drawing WHERE gesture_id = 'g-tmp'"
        )
        .first()
    ).toEqual({ n: 0 });
    await db.prepare("DELETE FROM gesture_drawing").run();
  });

  it("keeps lessons, sections and items consistent", async () => {
    await db.batch([
      db
        .prepare(
          "INSERT INTO lesson (id, author_id, number, created_at, updated_at) VALUES ('l1', ?, 1, 1, 1)"
        )
        .bind(ADMIN_ID),
      db.prepare(
        "INSERT INTO lesson_translation (lesson_id, locale, title) VALUES ('l1', 'nl', 'Les 1'), ('l1', 'fr', 'Leçon 1')"
      ),
      db.prepare(
        "INSERT INTO lesson_section (id, lesson_id, position) VALUES ('s1', 'l1', 0)"
      ),
      db.prepare(
        "INSERT INTO lesson_section_translation (section_id, locale, title) VALUES ('s1', 'nl', 'Begroeten')"
      ),
      db.prepare(
        "INSERT INTO lesson_item (lesson_id, section_id, gesture_id, position) VALUES ('l1', 's1', 'g-cafe', 0)"
      ),
    ]);
    expect(
      await db.prepare("SELECT version FROM lesson WHERE id = 'l1'").first()
    ).toEqual({ version: 1 });
    // A gesture appears once per lesson, even in another section.
    await expect(
      db
        .prepare(
          "INSERT INTO lesson_item (lesson_id, section_id, gesture_id, position) VALUES ('l1', NULL, 'g-cafe', 1)"
        )
        .run()
    ).rejects.toThrow(UNIQUE_FAILED);
    await expect(
      db
        .prepare(
          "INSERT INTO lesson_translation (lesson_id, locale, title) VALUES ('l1', 'en', '')"
        )
        .run()
    ).rejects.toThrow(CHECK_FAILED);
    await expect(
      db
        .prepare(
          "INSERT INTO lesson_translation (lesson_id, locale, title) VALUES ('l1', 'en', ?)"
        )
        .bind("x".repeat(201))
        .run()
    ).rejects.toThrow(CHECK_FAILED);
    await expect(
      db
        .prepare(
          "INSERT INTO lesson_translation (lesson_id, locale, title) VALUES ('l1', 'xx', 'T')"
        )
        .run()
    ).rejects.toThrow(FOREIGN_KEY_FAILED);
    await expect(
      db.prepare("UPDATE lesson SET number = 10000 WHERE id = 'l1'").run()
    ).rejects.toThrow(CHECK_FAILED);
    await expect(
      db.prepare("UPDATE lesson SET number = -1 WHERE id = 'l1'").run()
    ).rejects.toThrow(CHECK_FAILED);
    await db.prepare("UPDATE lesson SET number = NULL WHERE id = 'l1'").run();
    await expect(
      db
        .prepare(
          "INSERT INTO lesson_section (id, lesson_id, position) VALUES ('s2', 'l1', -1)"
        )
        .run()
    ).rejects.toThrow(CHECK_FAILED);
    await expect(
      db
        .prepare(
          "INSERT INTO lesson_item (lesson_id, section_id, gesture_id, position) VALUES ('l1', 'nope', 'g-wine', 1)"
        )
        .run()
    ).rejects.toThrow(FOREIGN_KEY_FAILED);

    // Deleting a section keeps its items (ungrouped) and drops its titles.
    await db.prepare("DELETE FROM lesson_section WHERE id = 's1'").run();
    expect(
      await db
        .prepare("SELECT section_id FROM lesson_item WHERE lesson_id = 'l1'")
        .all()
    ).toEqual(expect.objectContaining({ results: [{ section_id: null }] }));
    expect(
      await db
        .prepare("SELECT count(*) AS n FROM lesson_section_translation")
        .first()
    ).toEqual({ n: 0 });

    // Deleting the author keeps the lesson; deleting the lesson takes its rows.
    await db.prepare("DELETE FROM lesson WHERE id = 'l1'").run();
    for (const table of ["lesson_translation", "lesson_item"]) {
      expect(
        // biome-ignore lint/performance/noAwaitInLoops: two counts, in order.
        await db.prepare(`SELECT count(*) AS n FROM ${table}`).first(),
        table
      ).toEqual({ n: 0 });
    }
  });

  it("accepts the new audit actions and target types, and still refuses unknown ones", async () => {
    await db.batch(
      NEW_AUDIT_ACTIONS.map((action, i) =>
        db
          .prepare(
            "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, data, created_at) VALUES (?, NULL, ?, 'lesson', 'x', '{}', 1)"
          )
          .bind(`new-${i}`, action)
      )
    );
    await db.batch(
      ["gesture_teacher_info", "lesson"].map((type) =>
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
          "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, data, created_at) VALUES ('bad', NULL, 'lesson.publish', 'lesson', NULL, '{}', 1)"
        )
        .run()
    ).rejects.toThrow(CHECK_FAILED);
    await expect(
      db
        .prepare(
          "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, data, created_at) VALUES ('bad2', NULL, 'legacy', 'drawing', NULL, '{}', 1)"
        )
        .run()
    ).rejects.toThrow(CHECK_FAILED);
    // The actor foreign key is still ON DELETE SET NULL (the entry stays).
    await insertUser("u-actor-tmp").run();
    await db
      .prepare(
        "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, data, created_at) VALUES ('mine', 'u-actor-tmp', 'lesson.create', 'lesson', 'l9', '{}', 1)"
      )
      .run();
    await db.prepare("DELETE FROM user WHERE id = 'u-actor-tmp'").run();
    expect(
      await db
        .prepare("SELECT actor_id FROM audit_log WHERE id = 'mine'")
        .first()
    ).toEqual({ actor_id: null });
    await db
      .prepare(
        "DELETE FROM audit_log WHERE id LIKE 'new-%' OR id LIKE 'type-%' OR id = 'mine'"
      )
      .run();
    await expectUnchanged();
  });
});
