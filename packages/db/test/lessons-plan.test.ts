import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { recordingD1, scanReport } from "../src/testing";

/*
 * Query plans of the phase 10c hot paths (the rule of phase 9 task 6: a hot
 * path seeks an index, and a full scan fails unless a test names it). The
 * statements are the ones the later tasks issue: the lesson list and its
 * "mine" filter, the item load of a lesson, the teacher information of a
 * gesture and the coverage of a language, the drawings, and the lessons that
 * contain a gesture (the PDF cache fingerprint). The tables are empty: a plan
 * does not depend on the rows, only on the schema.
 */

const READS: {
  allowed?: RegExp;
  name: string;
  sql: string;
  values: unknown[];
}[] = [
  {
    name: "the lesson list, newest change first",
    sql: "SELECT id, author_id, number, version, updated_at FROM lesson ORDER BY updated_at DESC, id DESC LIMIT ?",
    values: [50],
  },
  {
    name: "the lesson list, the next page by keyset",
    sql: "SELECT id, author_id, number, version, updated_at FROM lesson WHERE (updated_at, id) < (?, ?) ORDER BY updated_at DESC, id DESC LIMIT ?",
    values: [1, "l1", 50],
  },
  {
    name: "my lessons",
    sql: "SELECT id, number, version, updated_at FROM lesson WHERE author_id = ? ORDER BY updated_at DESC LIMIT ?",
    values: ["u1", 50],
  },
  {
    name: "one lesson",
    sql: "SELECT id, author_id, number, version, created_at, updated_at FROM lesson WHERE id = ?",
    values: ["l1"],
  },
  {
    name: "the titles and notes of a lesson, all languages",
    sql: "SELECT locale, title, notes FROM lesson_translation WHERE lesson_id = ?",
    values: ["l1"],
  },
  {
    name: "the titles of the lessons of a page, in one language",
    sql: "SELECT lesson_id, title FROM lesson_translation WHERE locale = ? AND lesson_id IN (?, ?, ?)",
    values: ["fr", "l1", "l2", "l3"],
  },
  {
    name: "the sections of a lesson, in order",
    sql: "SELECT id, position FROM lesson_section WHERE lesson_id = ? ORDER BY position",
    values: ["l1"],
  },
  {
    name: "the section titles of a lesson",
    sql: "SELECT t.section_id, t.locale, t.title FROM lesson_section_translation t JOIN lesson_section s ON s.id = t.section_id WHERE s.lesson_id = ?",
    values: ["l1"],
  },
  {
    name: "the item load of a lesson, in order",
    sql: "SELECT gesture_id, section_id, position FROM lesson_item WHERE lesson_id = ? ORDER BY section_id, position",
    values: ["l1"],
  },
  {
    name: "the items of one section",
    sql: "SELECT gesture_id FROM lesson_item WHERE section_id = ? ORDER BY position",
    values: ["s1"],
  },
  {
    name: "the gestures count of the lessons of a page",
    sql: "SELECT lesson_id, count(*) AS n FROM lesson_item WHERE lesson_id IN (?, ?, ?) GROUP BY lesson_id",
    values: ["l1", "l2", "l3"],
  },
  {
    name: "the lessons that contain a gesture",
    sql: "SELECT lesson_id FROM lesson_item WHERE gesture_id = ?",
    values: ["g1"],
  },
  {
    name: "the teacher information of a gesture, all languages",
    sql: "SELECT locale, hc, pl, or_, bw, c_note, note, summary, version FROM gesture_teacher_info WHERE gesture_id = ?",
    values: ["g1"],
  },
  {
    name: "the teacher information of a gesture in one language",
    sql: "SELECT hc, pl, or_, bw, c_note, note, summary, version FROM gesture_teacher_info WHERE gesture_id = ? AND locale = ?",
    values: ["g1", "fr"],
  },
  {
    name: "the teacher information of a lesson's gestures (the PDF)",
    sql: "SELECT gesture_id, locale, version FROM gesture_teacher_info WHERE locale IN (?, ?) AND gesture_id IN (?, ?, ?)",
    values: ["fr", "nl", "g1", "g2", "g3"],
  },
  {
    name: "the teacher information coverage of one language",
    sql: "SELECT count(*) AS n FROM gesture_teacher_info WHERE locale = ?",
    values: ["fr"],
  },
  {
    name: "the drawings of a gesture",
    sql: "SELECT step, r2_key, content_type, size, width, height, credit, updated_at FROM gesture_drawing WHERE gesture_id = ? ORDER BY step",
    values: ["g1"],
  },
  {
    name: "the drawings of a lesson's gestures (the picker marker, the PDF)",
    sql: "SELECT gesture_id, step, updated_at FROM gesture_drawing WHERE gesture_id IN (?, ?, ?)",
    values: ["g1", "g2", "g3"],
  },
  {
    name: "one drawing by its object key (the orphan sweep)",
    sql: "SELECT gesture_id FROM gesture_drawing WHERE r2_key = ?",
    values: ["teacher/drawings/g1/1/u"],
  },
  {
    // The lesson search by title: a lesson count is in the tens, so the one
    // scan is named (a LIKE with a leading wildcard cannot use an index).
    allowed: /^SCAN lesson_translation$/,
    name: "the lesson search by title (a named scan)",
    sql: "SELECT lesson_id FROM lesson_translation WHERE locale = ? AND title LIKE ? LIMIT ?",
    values: ["fr", "%begroeten%", 50],
  },
];

describe("the phase 10c hot paths seek an index", () => {
  for (const read of READS) {
    it(read.name, async () => {
      const { d1, statements } = recordingD1(env.DB);
      await d1
        .prepare(read.sql)
        .bind(...read.values)
        .all();
      const report = await scanReport(env.DB, statements, (detail) =>
        read.allowed ? read.allowed.test(detail) : false
      );
      expect(report.scans, report.plans.join("\n")).toEqual([]);
    });
  }

  it("the lesson list uses lesson_updated_idx, and 'mine' its author index", async () => {
    const { d1, statements } = recordingD1(env.DB);
    await d1
      .prepare(READS[0]?.sql ?? "")
      .bind(50)
      .all();
    await d1
      .prepare(READS[2]?.sql ?? "")
      .bind("u1", 50)
      .all();
    const report = await scanReport(env.DB, statements);
    const plans = report.plans.join("\n");
    expect(plans).toContain("lesson_updated_idx");
    expect(plans).toContain("lesson_author_updated_idx");
    // Neither sorts in a temporary b-tree.
    expect(plans).not.toContain("USE TEMP B-TREE FOR ORDER BY");
  });
});
