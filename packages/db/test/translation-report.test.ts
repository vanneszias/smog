import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  categoryTranslation,
  gesture,
  gestureKeyword,
  gestureNeedsTranslationSql,
  gestureTranslation,
  translationReport,
} from "../src";
import { createDb } from "../src/client";
import {
  makeCategory,
  makeGesture,
  recordingD1,
  scanReport,
} from "../src/testing";

/*
 * The "needs translation" definition: no translation row, a blank
 * description where the default has one, or no keyword where the default
 * has some. The default language never needs a translation.
 */

const db = createDb(env.DB);

async function needing(locale: string): Promise<string[]> {
  const rows = await db
    .select({ name: gesture.name })
    .from(gesture)
    .where(gestureNeedsTranslationSql(locale))
    .orderBy(gesture.sortName);
  return rows.map((row) => row.name);
}

describe("the needs-translation report", () => {
  it("counts every kind of gap per language and agrees with the filter", async () => {
    await makeGesture(db, { description: "uitleg", name: "Geen" });
    const complete = await makeGesture(db, {
      description: "uitleg",
      name: "Volledig",
    });
    const blank = await makeGesture(db, {
      description: "uitleg",
      name: "Leeg",
    });
    const noKeywords = await makeGesture(db, {
      description: "",
      name: "Zonder",
    });
    const noSource = await makeGesture(db, { description: "", name: "Bron" });
    await db.insert(gestureKeyword).values([
      { gestureId: complete.id, keyword: "hond", position: 0 },
      { gestureId: blank.id, keyword: "kat", position: 0 },
      { gestureId: noKeywords.id, keyword: "vis", position: 0 },
    ]);
    await db.insert(gestureTranslation).values([
      {
        description: "text",
        gestureId: complete.id,
        locale: "fr",
        name: "Complet",
      },
      { description: "", gestureId: blank.id, locale: "fr", name: "Vide" },
      { description: "", gestureId: noKeywords.id, locale: "fr", name: "Sans" },
      { description: "", gestureId: noSource.id, locale: "fr", name: "Source" },
    ]);
    await db.insert(gestureKeyword).values([
      { gestureId: complete.id, keyword: "chien", locale: "fr", position: 0 },
      { gestureId: blank.id, keyword: "chat", locale: "fr", position: 0 },
    ]);

    expect(await needing("fr")).toEqual(["Geen", "Leeg", "Zonder"]);
    expect(await translationReport(db, "fr")).toEqual({
      categories: { missing: 0, total: 0 },
      gestures: {
        missingDescription: 1,
        missingKeywords: 1,
        missingName: 1,
        needsTranslation: 3,
        total: 5,
      },
      locale: "fr",
    });
    // English has no row at all: every gesture shows the Dutch text.
    expect((await translationReport(db, "en")).gestures.needsTranslation).toBe(
      5
    );
    // The default language is never behind itself.
    expect(await needing("nl")).toEqual([]);
    expect((await translationReport(db, "nl")).gestures).toEqual({
      missingDescription: 0,
      missingKeywords: 0,
      missingName: 0,
      needsTranslation: 0,
      total: 5,
    });
  });

  it("counts categories without a translated name", async () => {
    const one = await makeCategory(db, { name: "Dieren" });
    await makeCategory(db, { name: "Eten" });
    await db
      .insert(categoryTranslation)
      .values({ categoryId: one.id, locale: "fr", name: "Animaux" });
    expect((await translationReport(db, "fr")).categories).toEqual({
      missing: 1,
      total: 2,
    });
    expect((await translationReport(db, "nl")).categories).toEqual({
      missing: 0,
      total: 2,
    });
  });
});

describe("the report's query plans", () => {
  it("walk gesture once and probe the translation and keyword keys", async () => {
    const { d1, statements } = recordingD1(env.DB);
    const recording = createDb(d1);
    await translationReport(recording, "fr");
    await recording
      .select({ id: gesture.id })
      .from(gesture)
      .where(gestureNeedsTranslationSql("fr"))
      .orderBy(gesture.sortName, gesture.id)
      .limit(50);
    // The counts walk the catalogue and the category table once (tens to
    // hundreds of rows); the translation and keyword probes are key seeks.
    const report = await scanReport(
      env.DB,
      statements,
      (detail) =>
        detail.startsWith("SCAN gesture") || detail.startsWith("SCAN category")
    );
    expect(report.scans, report.plans.join("\n")).toEqual([]);
  });
});
