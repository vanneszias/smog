import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import { gestureDrawing, gestureTeacherInfo } from "@smog/db";
import { createDb } from "@smog/db/client";
import { recordingD1 } from "@smog/db/testing";
import { makeRpcContext } from "@smog/rpc/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { gesturesRouter } from "../src/server";
import { addCategory, addGesture, resetCatalog } from "./helpers";

/*
 * Phase 10c ruling 2, the query half of the guard: teacher information and
 * drawings never reach a public gesture read. A gesture is seeded with a
 * recognisable marker in every teacher field, in two languages, and in a
 * drawing credit; every public gesture procedure then runs, in both
 * languages, against a recording D1. No output may contain a marker, no
 * statement may name a teaching table or column (the column lists of the
 * public queries are explicit), and a search for the markers finds nothing
 * (the FTS index holds no teacher text). The schema half is
 * `packages/api/test/teacher-privacy.test.ts`, the source half
 * `scripts/teacher-privacy-guard.test.ts`.
 */

const MARKER = "GEHEIMMARKER";
const FIELDS = ["hc", "pl", "or", "bw", "cNote", "note", "summary"] as const;
/** The tables and columns only the teaching code may name. */
const TEACHING_SQL =
  /gesture_teacher_info|gesture_drawing|\bc_note\b|\bor_\b|teacher\/drawings/i;

async function seed(): Promise<{ id: string; slug: string }> {
  const db = createDb(env.DB);
  await resetCatalog();
  const dieren = await addCategory(db, "Dieren");
  const hond = await addGesture(db, {
    categories: [dieren],
    keywords: ["hondje"],
    name: "Hond",
  });
  await addGesture(db, { categories: [dieren], name: "Kat" });
  const row = (locale: string) => ({
    bw: `${MARKER}-bw-${locale}`,
    cNote: `${MARKER}-cnote-${locale}`,
    gestureId: hond.id,
    hc: `${MARKER}-hc-${locale}`,
    locale,
    note: `${MARKER}-note-${locale}`,
    or_: `${MARKER}-or-${locale}`,
    pl: `${MARKER}-pl-${locale}`,
    summary: `${MARKER}-summary-${locale}`,
  });
  await db.insert(gestureTeacherInfo).values([row("nl"), row("fr")]);
  await db.insert(gestureDrawing).values({
    contentType: "image/png",
    credit: `${MARKER}-credit`,
    gestureId: hond.id,
    height: 100,
    r2Key: `teacher/drawings/${hond.id}/1/0b7e4f0e-6c1a-4c9e-8a53-2f4f1d9a7b11`,
    size: 1000,
    step: 1,
    width: 100,
  });
  return { id: hond.id, slug: hond.slug };
}

let hond: { id: string; slug: string };

beforeEach(async () => {
  hond = await seed();
});

describe("public gesture reads never carry teaching data", () => {
  it("no output contains a teacher field or the drawing, in any language", async () => {
    const { d1, statements } = recordingD1(env.DB);
    const outputs: unknown[] = [];
    for (const locale of ["nl", "fr", "en"]) {
      const context = makeRpcContext({
        db: createDb(d1),
        kv: env.KV,
        locale,
      });
      const run = async <T>(promise: Promise<T>): Promise<T> => {
        const value = await promise;
        outputs.push(value);
        return value;
      };
      // biome-ignore lint/performance/noAwaitInLoops: three languages, in order.
      await run(call(gesturesRouter.list, { limit: 50 }, { context }));
      await run(call(gesturesRouter.bySlug, { slug: hond.slug }, { context }));
      await run(call(gesturesRouter.byIds, { ids: [hond.id] }, { context }));
      await run(
        call(gesturesRouter.related, { limit: 5, slug: hond.slug }, { context })
      );
      await run(call(gesturesRouter.categories, undefined, { context }));
      await run(call(gesturesRouter.sitemap, undefined, { context }));
      await run(call(gesturesRouter.search, { limit: 20, q: "" }, { context }));
      await run(
        call(gesturesRouter.search, { limit: 20, q: "hond" }, { context })
      );
    }
    expect(outputs.length).toBe(24);
    const text = JSON.stringify(outputs);
    expect(text).toContain("Hond");
    expect(text).not.toContain(MARKER);
    expect(text).not.toContain("teacher/drawings");
    expect(statements.length).toBeGreaterThan(20);
    expect(
      statements.filter((statement) => TEACHING_SQL.test(statement.sql))
    ).toEqual([]);
  });

  it("the search index holds no teacher text: a search for any marker finds nothing", async () => {
    const context = makeRpcContext({
      db: createDb(env.DB),
      kv: env.KV,
      locale: "nl",
    });
    for (const field of FIELDS) {
      // biome-ignore lint/performance/noAwaitInLoops: seven searches, in order.
      const result = await call(
        gesturesRouter.search,
        { limit: 20, q: `${MARKER}-${field.toLowerCase()}-nl` },
        { context }
      );
      expect(result.items, field).toEqual([]);
    }
    expect(
      (
        await env.DB.prepare(
          "SELECT count(*) AS n FROM gesture_fts WHERE name LIKE ? OR keywords LIKE ? OR categories LIKE ? OR description LIKE ?"
        )
          .bind(...Array.from({ length: 4 }, () => `%${MARKER}%`))
          .first<{ n: number }>()
      )?.n
    ).toBe(0);
  });

  it("the guard itself sees a statement that names a teaching table", async () => {
    const { d1, statements } = recordingD1(env.DB);
    await d1
      .prepare(
        "SELECT hc, c_note FROM gesture_teacher_info WHERE gesture_id = ?"
      )
      .bind(hond.id)
      .all();
    await d1
      .prepare("SELECT r2_key FROM gesture_drawing WHERE gesture_id = ?")
      .bind(hond.id)
      .all();
    expect(
      statements.filter((statement) => TEACHING_SQL.test(statement.sql))
    ).toHaveLength(2);
  });
});
