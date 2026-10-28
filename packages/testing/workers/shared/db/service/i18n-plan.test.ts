import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { recordingD1, scanReport } from "../../../../support/db/index";

/*
 * Query plans of the phase 10b hot paths (the same rule as phase 9 task 6:
 * a hot path seeks an index, and a full scan fails unless a test names it).
 * The statements are the ones the later tasks issue: the interface string
 * overlay, a gesture's translation, keywords and audio, the coverage and
 * "needs translation" reports, the published legal text, roles, the language
 * menu and the "needs re-cut" list. The tables are empty: a plan does not
 * depend on the rows, only on the schema.
 */

const READS: {
  allowed?: RegExp;
  name: string;
  sql: string;
  values: unknown[];
}[] = [
  {
    name: "the interface string overlay of one language",
    sql: "SELECT key, value FROM ui_string WHERE locale = ?",
    values: ["fr"],
  },
  {
    name: "one interface string",
    sql: "SELECT value FROM ui_string WHERE locale = ? AND key = ?",
    values: ["fr", "common.save"],
  },
  {
    name: "a gesture's translation in one language",
    sql: "SELECT name, description FROM gesture_translation WHERE gesture_id = ? AND locale = ?",
    values: ["g1", "fr"],
  },
  {
    name: "every translation of a gesture (the editor)",
    sql: "SELECT locale, name FROM gesture_translation WHERE gesture_id = ?",
    values: ["g1"],
  },
  {
    name: "the translation coverage of one language",
    sql: "SELECT count(*) AS n FROM gesture_translation WHERE locale = ?",
    values: ["fr"],
  },
  {
    name: "the category translations of one language",
    sql: "SELECT category_id, name FROM category_translation WHERE locale = ?",
    values: ["fr"],
  },
  {
    name: "a gesture's keywords in one language",
    sql: "SELECT keyword FROM gesture_keyword WHERE gesture_id = ? AND locale = ? ORDER BY position",
    values: ["g1", "fr"],
  },
  {
    name: "the keywords of one language (coverage)",
    sql: "SELECT count(DISTINCT gesture_id) AS n FROM gesture_keyword WHERE locale = ?",
    values: ["fr"],
  },
  {
    name: "a gesture's audio in one language",
    sql: "SELECT r2_key, content_type FROM gesture_audio WHERE gesture_id = ? AND locale = ?",
    values: ["g1", "fr"],
  },
  {
    name: "the audio clips of one language (coverage)",
    sql: "SELECT count(*) AS n FROM gesture_audio WHERE locale = ?",
    values: ["fr"],
  },
  {
    name: "the audio row of an R2 key (the serving route and the sweep)",
    sql: "SELECT gesture_id FROM gesture_audio WHERE r2_key = ?",
    values: ["audio/g1/fr/x"],
  },
  {
    name: "the published legal text of a kind and language",
    sql: "SELECT id, version, content, effective_date FROM legal_text WHERE kind = ? AND locale = ? AND status = 'published' ORDER BY version DESC LIMIT 1",
    values: ["privacy", "nl"],
  },
  {
    name: "the draft of a legal text",
    sql: "SELECT id FROM legal_text WHERE kind = ? AND locale = ? AND status = 'draft'",
    values: ["privacy", "nl"],
  },
  {
    name: "the version history of a legal text",
    sql: "SELECT id, version, status FROM legal_text WHERE kind = ? AND locale = ? ORDER BY version DESC",
    values: ["privacy", "nl"],
  },
  {
    name: "the roles of a user",
    sql: "SELECT role FROM user_role WHERE user_id = ?",
    values: ["u1"],
  },
  {
    name: "the holders of a role",
    sql: "SELECT user_id FROM user_role WHERE role = ?",
    values: ["translator"],
  },
  {
    name: "the language menu",
    sql: "SELECT code, name, intl_tag FROM language WHERE enabled = 1 ORDER BY sort_order, code",
    values: [],
  },
  {
    name: "the default language",
    sql: "SELECT code FROM language WHERE is_default = 1",
    values: [],
  },
  {
    name: "one language",
    sql: "SELECT code FROM language WHERE code = ?",
    values: ["fr"],
  },
  {
    name: "the admin 're-cut' list (first page)",
    sql: "SELECT id, name FROM gesture WHERE needs_recut = 1 ORDER BY sort_name, id LIMIT 50",
    values: [],
  },
  {
    name: "a search in one language",
    sql: "SELECT gesture_id FROM gesture_fts WHERE gesture_fts MATCH ? AND locale = ? ORDER BY bm25(gesture_fts, 0.0, 10.0, 5.0, 3.0, 1.0) LIMIT 100",
    values: ["hond*", "fr"],
  },
  {
    name: "the fts rows of a gesture (the rebuild's delete)",
    sql: "SELECT gesture_id FROM gesture_fts WHERE gesture_id = ?",
    // `gesture_id` is UNINDEXED: the virtual table is scanned, as in phase 3.
    values: ["g1"],
  },
];

describe("the phase 10b hot paths seek an index", () => {
  for (const read of READS) {
    it(read.name, async () => {
      const { d1, statements } = recordingD1(env.DB);
      await d1
        .prepare(read.sql)
        .bind(...read.values)
        .all();
      const report = await scanReport(env.DB, statements);
      expect(report.scans, report.plans.join("\n")).toEqual([]);
    });
  }

  it("the 'needs translation' report walks the catalogue by its keyset index and probes the translation's primary key", async () => {
    const { d1, statements } = recordingD1(env.DB);
    await d1
      .prepare(
        "SELECT g.id FROM gesture g WHERE NOT EXISTS (SELECT 1 FROM gesture_translation t WHERE t.gesture_id = g.id AND t.locale = ?) ORDER BY g.sort_name, g.id LIMIT 50"
      )
      .bind("fr")
      .all();
    // The one named scan: the ordered walk over `gesture_sort_name_idx`,
    // which stops once the page is full (a covering scan reads index
    // entries only). `gesture_translation` is never scanned.
    const report = await scanReport(
      env.DB,
      statements,
      (detail) => detail === "SCAN g USING COVERING INDEX gesture_sort_name_idx"
    );
    expect(report.scans, report.plans.join("\n")).toEqual([]);
    expect(report.plans.join("\n")).toContain(
      "SEARCH t USING COVERING INDEX sqlite_autoindex_gesture_translation_1 (gesture_id=? AND locale=?)"
    );
  });
});
