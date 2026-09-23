// @vitest-environment node
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildPlan, readExport } from "./plan";

const FIXTURES = fileURLToPath(new URL("./fixtures", import.meta.url));

describe("readExport", () => {
  it("reads categories and gestures from their documents.jsonl files", async () => {
    const result = await readExport(`${FIXTURES}/valid`);

    expect(result.categories).toHaveLength(2);
    expect(result.gestures).toHaveLength(6);
  });

  it("lists the tables named in _tables/documents.jsonl", async () => {
    const result = await readExport(`${FIXTURES}/valid`);

    expect(result.tables).toEqual(
      expect.arrayContaining([
        "categories",
        "gestures",
        "user_favorites",
        "users",
        "sponsorships",
        "user_consents",
        "adminLogs",
      ])
    );
  });

  it("counts favourites (and other aggregate-only tables) by line, without requiring valid JSON", async () => {
    // fixtures/valid/user_favorites/documents.jsonl deliberately holds
    // non-JSON lines: reading fields beyond the count would throw here.
    const result = await readExport(`${FIXTURES}/valid`);

    expect(result.counts.user_favorites).toBe(3);
    expect(result.counts.users).toBe(0);
    expect(result.counts.sponsorships).toBe(0);
    expect(result.counts.user_consents).toBe(0);
    expect(result.counts.adminLogs).toBe(0);
  });

  it("throws with the file and line number (not the row's content) on malformed JSON", async () => {
    await expect(readExport(`${FIXTURES}/malformed-json`)).rejects.toThrow(
      /\[migrate-convex\].*categories\/documents\.jsonl:2/
    );
    await expect(readExport(`${FIXTURES}/malformed-json`)).rejects.not.toThrow(
      /not valid json/
    );
  });
});

describe("buildPlan", () => {
  async function plan(fixture: string) {
    return buildPlan(await readExport(`${FIXTURES}/${fixture}`));
  }

  it("trims category and gesture names", async () => {
    const result = await plan("valid");

    const category = result.categories.find((c) => c.legacyId === "cat_test_1");
    expect(category?.name).toBe("Testgebaar Categorie Een");

    const gesture = result.gestures.find((g) => g.legacyId === "ges_ok_1");
    expect(gesture?.name).toBe("Testgebaar Een");
  });

  it("carries isActive through for categories and gestures", async () => {
    const result = await plan("valid");

    expect(
      result.categories.find((c) => c.legacyId === "cat_test_2")?.isActive
    ).toBe(false);
    expect(
      result.gestures.find((g) => g.legacyId === "ges_inactive")?.isActive
    ).toBe(false);
    expect(
      result.gestures.find((g) => g.legacyId === "ges_ok_1")?.isActive
    ).toBe(true);
  });

  it("converts _creationTime to an ISO createdAt for categories and gestures", async () => {
    const result = await plan("valid");

    expect(
      result.categories.find((c) => c.legacyId === "cat_test_1")?.createdAt
    ).toBe(new Date(1_700_000_000_000).toISOString());
    expect(
      result.gestures.find((g) => g.legacyId === "ges_ok_1")?.createdAt
    ).toBe(new Date(1_700_000_150_000).toISOString());
  });

  it("dedupes concepts within a gesture, keeping first-occurrence order", async () => {
    const result = await plan("valid");

    expect(
      result.gestures.find((g) => g.legacyId === "ges_ok_1")?.concepts
    ).toEqual(["hond", "kat"]);
  });

  it("skips a gesture with zero categoryIds as no-category", async () => {
    const result = await plan("valid");

    expect(result.skipped).toContainEqual({
      legacyId: "ges_no_category",
      name: "Testgebaar Zonder Categorie",
      reason: "no-category",
    });
    expect(result.gestures.some((g) => g.legacyId === "ges_no_category")).toBe(
      false
    );
  });

  it("skips a gesture with an empty playbackId as no-playback-id", async () => {
    const result = await plan("valid");

    expect(result.skipped).toContainEqual({
      legacyId: "ges_no_playback_empty",
      name: "Testgebaar Zonder Playback",
      reason: "no-playback-id",
    });
  });

  it("skips a gesture with a whitespace-only playbackId as no-playback-id", async () => {
    const result = await plan("valid");

    expect(result.skipped).toContainEqual({
      legacyId: "ges_no_playback_whitespace",
      name: "Testgebaar Playback Spatie",
      reason: "no-playback-id",
    });
  });

  it("skips a gesture referencing a category id absent from the export as unknown-category", async () => {
    const result = await plan("valid");

    expect(result.skipped).toContainEqual({
      legacyId: "ges_unknown_category",
      name: "Testgebaar Onbekende Categorie",
      reason: "unknown-category",
    });
  });

  it("counts dropped favourites without reading their fields", async () => {
    const result = await plan("valid");

    expect(result.dropped.favourites).toBe(3);
  });

  it("carries source counts through for reporting", async () => {
    const result = await plan("valid");

    expect(result.counts.categories).toBe(2);
    expect(result.counts.gestures).toBe(6);
    expect(result.counts.user_favorites).toBe(3);
  });

  it("refuses when the export has users", async () => {
    await expect(plan("refusal-users")).rejects.toThrow(
      /\[migrate-convex\] Export has 1 users/
    );
  });

  it("refuses when the export has sponsorships", async () => {
    await expect(plan("refusal-sponsorships")).rejects.toThrow(
      /\[migrate-convex\] Export has 1 sponsorships/
    );
  });

  it("refuses when the export has user_consents", async () => {
    await expect(plan("refusal-user_consents")).rejects.toThrow(
      /\[migrate-convex\] Export has 1 user_consents/
    );
  });

  it("refuses when the export has adminLogs", async () => {
    await expect(plan("refusal-adminlogs")).rejects.toThrow(
      /\[migrate-convex\] Export has 1 adminLogs/
    );
  });

  it("refuses when a gesture_lists table is present", async () => {
    await expect(plan("refusal-gesture-lists")).rejects.toThrow(
      /\[migrate-convex\].*gesture_lists/
    );
  });
});
