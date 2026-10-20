import { env } from "cloudflare:workers";
import { createDb } from "@smog/db/client";
import { recordingD1, scanReport } from "@smog/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
  findGestureBySlug,
  findGesturesByIds,
  findRelatedGestures,
  listCategories,
  listGestures,
  listSitemap,
  searchGestures,
} from "../src/server";
import { addCategory, addGesture, resetCatalog } from "./helpers";

/*
 * Phase 9 task 6 (P-17): the catalogue's hot reads seek an index. The real
 * service code runs against a recording D1; every statement it prepared is
 * explained with its own values. FTS and `json_each` virtual-table scans
 * are fine, a bare `SCAN <table>` is not.
 */

async function seed(): Promise<void> {
  const db = createDb(env.DB);
  await resetCatalog();
  const dieren = await addCategory(db, "Dieren");
  const eten = await addCategory(db, "Eten");
  await addGesture(db, {
    categories: [dieren],
    keywords: ["hondje"],
    legacyId: "legacy-hond",
    name: "Hond",
  });
  await addGesture(db, { categories: [dieren, eten], name: "Kat" });
  await addGesture(db, { categories: [eten], name: "Appel" });
}

beforeEach(seed);

describe("the catalogue's query plans (no full table scan)", () => {
  it("search (the FTS candidates and the ranking join), browse, by-slug, by-id, related, categories and sitemap", async () => {
    const { d1, statements } = recordingD1(env.DB);
    const db = createDb(d1);
    const catalogueStart = performance.now();
    const first = await listGestures(db, { limit: 20 });
    const catalogueMs = performance.now() - catalogueStart;
    const [hond] = first.items;
    expect(hond).toBeDefined();
    await listGestures(db, { category: ["dieren"], limit: 20 });
    await listGestures(db, {
      cursor: first.nextCursor ?? undefined,
      limit: 1,
    });
    const searchStart = performance.now();
    await searchGestures({ db, kv: env.KV }, { limit: 20, q: "hond" });
    const searchMs = performance.now() - searchStart;
    // Noted in the task report (no assertion: a local D1 is not production).
    console.log(
      `[perf] catalogue page ${catalogueMs.toFixed(1)} ms, search ${searchMs.toFixed(1)} ms (local D1)`
    );
    await searchGestures(
      { db, kv: env.KV },
      { category: ["dieren"], limit: 20, q: "hond" }
    );
    await searchGestures({ db, kv: env.KV }, { limit: 20, q: "" });
    await findGestureBySlug(db, "hond");
    await findGestureBySlug(db, "legacy-hond");
    await findGesturesByIds(db, hond ? [hond.id] : []);
    await findRelatedGestures(db, "hond", 6);
    await listCategories(db);
    await listSitemap(db);
    expect(statements.length).toBeGreaterThan(8);

    // The category list reads every category by design: a dozen rows.
    const report = await scanReport(
      env.DB,
      statements,
      (detail, sql) =>
        detail === "SCAN category" ||
        // Whole-catalogue aggregates and the typo tier's projection read every
        // published gesture by design (a few hundred rows, cached in KV).
        (detail.startsWith("SCAN gesture USING INDEX") &&
          (sql.includes("count(*) from") ||
            !sql.toLowerCase().includes("limit")))
    );
    expect(report.scans, report.plans.join("\n")).toEqual([]);
  });

  it("looks a gesture up by slug or legacy id through indexes (no OR-driven scan)", async () => {
    const { d1, statements } = recordingD1(env.DB);
    await findGestureBySlug(createDb(d1), "legacy-hond");
    const report = await scanReport(env.DB, statements);
    expect(report.scans, report.plans.join("\n")).toEqual([]);
    expect(report.plans.join("\n")).toContain("gesture");
  });
});
