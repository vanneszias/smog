// @vitest-environment node
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { buildPlan, readExport } from "./plan";

const FIXTURES = fileURLToPath(new URL("./fixtures", import.meta.url));

const scratchDirs: string[] = [];

afterAll(async () => {
  for (const dir of scratchDirs) {
    await rm(dir, { recursive: true, force: true });
  }
});

/**
 * A copy of `fixtures/valid` in the OS temp directory with the given
 * tables' rows replaced — synthetic rows written by the test itself.
 */
async function exportWith(
  rows: Partial<Record<"categories" | "gestures", unknown[]>>
): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "migrate-convex-plan-"));
  scratchDirs.push(dir);
  await cp(path.join(FIXTURES, "valid"), dir, { recursive: true });
  for (const [table, tableRows] of Object.entries(rows)) {
    await writeFile(
      path.join(dir, table, "documents.jsonl"),
      `${tableRows.map((row) => JSON.stringify(row)).join("\n")}\n`
    );
  }
  return dir;
}

const syntheticCategory = (id: string) => ({
  _id: id,
  _creationTime: 1_700_000_000_000,
  name: `Categorie ${id}`,
  isActive: true,
});

const syntheticGesture = (id: string, overrides: object = {}) => ({
  _id: id,
  _creationTime: 1_700_000_100_000,
  name: `Gebaar ${id}`,
  info: "",
  concept: [],
  categoryIds: ["cat_syn_1"],
  playbackId: "pb_syn",
  lastUpdated: 1_700_000_200_000,
  isActive: true,
  ...overrides,
});

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

  it("refuses a missing data table (e.g. no gestures/ directory) rather than treating it as empty", async () => {
    await expect(
      readExport(`${FIXTURES}/missing-gestures-table`)
    ).rejects.toThrow(
      /\[migrate-convex\] Export is missing gestures\/documents\.jsonl at .*gestures\/documents\.jsonl/
    );
  });

  it("refuses a missing must-be-empty table (e.g. no users/ directory) rather than treating it as empty", async () => {
    await expect(readExport(`${FIXTURES}/missing-users-table`)).rejects.toThrow(
      /\[migrate-convex\] Export is missing users\/documents\.jsonl at .*users\/documents\.jsonl/
    );
  });

  it("refuses a missing _tables/documents.jsonl rather than treating the export as tableless", async () => {
    await expect(readExport(`${FIXTURES}/missing-tables-file`)).rejects.toThrow(
      /\[migrate-convex\] Export is missing _tables\/documents\.jsonl at .*_tables\/documents\.jsonl/
    );
  });

  it("still treats a present-but-empty table file as a valid zero (not a missing table)", async () => {
    // fixtures/valid/users, /sponsorships, /user_consents and /adminLogs are
    // all present, zero-byte files — the missing-table refusal must not
    // fire for them.
    const result = await readExport(`${FIXTURES}/valid`);

    expect(result.counts.users).toBe(0);
    expect(result.counts.sponsorships).toBe(0);
    expect(result.counts.user_consents).toBe(0);
    expect(result.counts.adminLogs).toBe(0);
  });

  it("tolerates a CRLF line ending when splitting and parsing a row", async () => {
    // fixtures/crlf-line-ending/categories/documents.jsonl's one row ends
    // in \r\n rather than \n: JSON.parse must still accept the trailing \r
    // as insignificant whitespace, and line-splitting must not miscount.
    const result = await readExport(`${FIXTURES}/crlf-line-ending`);

    expect(result.categories).toHaveLength(1);
    expect(result.categories[0]?.name).toBe("Testgebaar Categorie CRLF");
    expect(result.gestures).toHaveLength(1);
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

  it("trims each concept, drops empty/whitespace-only ones, then dedupes keeping order", async () => {
    const result = await plan("gesture-normalization");

    expect(
      result.gestures.find((g) => g.legacyId === "ges_norm_concepts")?.concepts
    ).toEqual(["hond", "kat"]);
  });

  it("dedupes categoryIds per gesture, keeping order, before the unknown-category check", async () => {
    const result = await plan("gesture-normalization");

    const gesture = result.gestures.find(
      (g) => g.legacyId === "ges_norm_categories"
    );
    expect(gesture?.categoryLegacyIds).toEqual(["cat_norm_1"]);
    expect(result.skipped).not.toContainEqual(
      expect.objectContaining({ legacyId: "ges_norm_categories" })
    );
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

  it("stores the playbackId trimmed, as it is checked", async () => {
    const dir = await exportWith({
      categories: [syntheticCategory("cat_syn_1")],
      gestures: [
        syntheticGesture("ges_syn_padded", {
          playbackId: "  pb_syn_padded \t",
        }),
      ],
    });
    const result = buildPlan(await readExport(dir));

    expect(result.gestures).toEqual([
      expect.objectContaining({
        legacyId: "ges_syn_padded",
        playbackId: "pb_syn_padded",
      }),
    ]);
  });

  it("refuses duplicate _id rows in gestures, naming the table and lines only", async () => {
    const dir = await exportWith({
      categories: [syntheticCategory("cat_syn_1")],
      gestures: [
        syntheticGesture("ges_syn_a"),
        syntheticGesture("ges_syn_dup", { name: "Eerste" }),
        syntheticGesture("ges_syn_b"),
        syntheticGesture("ges_syn_dup", { name: "Tweede" }),
      ],
    });
    const input = await readExport(dir);

    expect(() => buildPlan(input)).toThrow(
      /\[migrate-convex\] Export has duplicate _id rows in gestures\/documents\.jsonl at lines 2 and 4, refusing import/
    );
    expect(() => buildPlan(input)).not.toThrow(/ges_syn_dup|Eerste|Tweede/);
  });

  it("refuses duplicate _id rows in categories too", async () => {
    const dir = await exportWith({
      categories: [
        syntheticCategory("cat_syn_1"),
        syntheticCategory("cat_syn_1"),
        syntheticCategory("cat_syn_1"),
      ],
    });

    await expect(
      readExport(dir).then((read) => buildPlan(read))
    ).rejects.toThrow(
      /duplicate _id rows in categories\/documents\.jsonl at lines 1, 2 and 3/
    );
  });

  it("refuses when a gesture_lists table is present", async () => {
    await expect(plan("refusal-gesture-lists")).rejects.toThrow(
      /\[migrate-convex\].*gesture_lists/
    );
  });
});
