import { describe, expect, test } from "bun:test";
import type { GestureRow, SponsorshipRow } from "../src/core/export-schema";
import { legacyUuid } from "../src/core/ids";
import {
  assignSlugs,
  catalogTransform,
  keywordsOf,
  sortRanks,
} from "../src/core/transform/catalog";
import {
  type ContextOptions,
  cat,
  conflictProblems,
  ges,
  fixtureContext as wholeFixtureContext,
} from "./transform-helpers";

/** Task 8's gestures (`…sg02`–`…sg12`), merged into the export by task 10. */
const SPONSORSHIP_GESTURE = /sg\d\d$/;

/**
 * The fixture with task 7's four gestures only: these tests pin the
 * catalogue rules on them (the sponsorship gestures task 10 merged into
 * the export are plain gestures, covered by the plan tests).
 */
async function fixtureContext(options: ContextOptions = {}) {
  const context = await wholeFixtureContext(options);
  return {
    ...context,
    data: {
      ...context.data,
      gestures: context.data.gestures.filter(
        (row) => !SPONSORSHIP_GESTURE.test(row._id)
      ),
    },
  };
}

function byLegacy<T extends { legacyId?: string | null }>(
  rows: readonly T[],
  legacyId: string
): T | undefined {
  return rows.find((row) => row.legacyId === legacyId);
}

const BASE_SPONSORSHIP: Omit<
  SponsorshipRow,
  | "_creationTime"
  | "_id"
  | "gestureId"
  | "originalVideoPlaybackId"
  | "sponsoredVideoPlaybackId"
  | "status"
> = {
  contactFullName: "Invented Contact",
  createdAt: 1_736_000_000_000,
  durationYears: 1,
  endDate: 1_767_536_000_000,
  overlayText: "Invented",
  paymentAmount: 5000,
  sponsorEmail: "invented@example.test",
  sponsorName: "Invented",
  startDate: 1_736_100_000_000,
  updatedAt: 1_736_100_000_000,
};

function sponsorship(
  id: string,
  gestureId: string,
  status: SponsorshipRow["status"],
  originalVideoPlaybackId: string,
  sponsoredVideoPlaybackId: string
): SponsorshipRow {
  return {
    ...BASE_SPONSORSHIP,
    _creationTime: 1_736_000_000_000,
    _id: id,
    gestureId,
    originalVideoPlaybackId,
    sponsoredVideoPlaybackId,
    status,
  };
}

describe("the catalogue transform", () => {
  test("slugs, ranks and publishes the categories", async () => {
    const result = await catalogTransform(await fixtureContext());
    expect(
      result.rows.category.map((row) => [
        row.legacyId,
        row.slug,
        row.name,
        row.sortOrder,
        row.publishedAt,
        row.createdAt,
      ])
    ).toEqual([
      [
        cat("fam1"),
        "familie",
        "Familie",
        2,
        new Date(1_735_689_700_000),
        new Date(1_735_689_700_000),
      ],
      [
        cat("eet1"),
        "eten",
        "Éten",
        1,
        new Date(1_735_689_710_000),
        new Date(1_735_689_710_000),
      ],
      [cat("dier"), "dieren", "Dieren", 0, null, new Date(1_735_689_720_000)],
    ]);
    expect(result.rows.category[0]?.id).toBe(
      await legacyUuid("category", cat("fam1"))
    );
  });

  test("maps each gesture field by field", async () => {
    const result = await catalogTransform(await fixtureContext());
    expect(result.rows.gesture.map((row) => row.slug)).toEqual([
      "mama",
      "mama-2",
      "papa",
      "eten",
    ]);
    expect(byLegacy(result.rows.gesture, ges("mam2"))).toEqual({
      createdAt: new Date(1_735_689_810_000),
      description: "Tweede mama.",
      id: await legacyUuid("gesture", ges("mam2")),
      legacyId: ges("mam2"),
      muxAssetId: null,
      name: "Mama",
      playbackId: "fixtureMama2Playback0001",
      publishedAt: null,
      slug: "mama-2",
      sortName: "mama",
      updatedAt: new Date(1_738_368_100_000),
    });
    expect(byLegacy(result.rows.gesture, ges("pap1"))?.publishedAt).toEqual(
      new Date(1_738_368_200_000)
    );
  });

  test("keeps keywords trimmed, distinct and in order", async () => {
    expect(keywordsOf([" vader ", "", "vader", "papa", "  "])).toEqual([
      "vader",
      "papa",
    ]);
    const result = await catalogTransform(await fixtureContext());
    const papa = await legacyUuid("gesture", ges("pap1"));
    expect(
      result.rows.gestureKeyword.filter((row) => row.gestureId === papa)
    ).toEqual([
      { gestureId: papa, keyword: "vader", position: 0 },
      { gestureId: papa, keyword: "papa", position: 1 },
    ]);
  });

  test("links known categories once and counts unknown ones and gestures without any", async () => {
    const result = await catalogTransform(await fixtureContext());
    const papa = await legacyUuid("gesture", ges("pap1"));
    expect(
      result.rows.gestureCategory.filter((row) => row.gestureId === papa)
    ).toEqual([
      {
        categoryId: await legacyUuid("category", cat("eet1")),
        gestureId: papa,
      },
    ]);
    const counts = result.sections[0]?.counts ?? {};
    expect(counts.unknownCategoryLinks).toBe(1);
    expect(counts.gesturesUncategorised).toBe(1);
    expect(counts.gesturesUnpublished).toBe(1);
    expect(counts.categoriesUnpublished).toBe(1);
    expect(
      result.sections[0]?.issues.find(
        (issue) => issue.code === "unknownCategory"
      )
    ).toMatchObject({ count: 1, ids: [ges("pap1")], severity: "warning" });
  });

  test("gives a sponsored gesture its own video and the asset of that video (B1)", async () => {
    const result = await catalogTransform(await fixtureContext());
    const mama = byLegacy(result.rows.gesture, ges("mam1"));
    expect(mama?.playbackId).toBe("fixtureOriginalPlayback0001");
    expect(mama?.muxAssetId).toBe("asset-fixture-original-0001");
    expect(result.sections[0]?.counts.gesturesVideoRestored).toBe(1);
  });

  test("restores a missed restore and keeps a video changed during a sponsorship, with warnings", async () => {
    const context = await fixtureContext();
    const sponsorships = [
      // Expired, but the gesture still shows the sponsor's video.
      sponsorship(
        "ks7missed",
        ges("pap1"),
        "expired",
        "papaOwn",
        "fixturePapaPlayback0001"
      ),
      // Active, but the admin replaced the video meanwhile.
      sponsorship(
        "ks7changed",
        ges("ete1"),
        "active",
        "etenOld",
        "etenSponsored"
      ),
      // Active, and the gesture shows the sponsor's video.
      sponsorship(
        "ks7live",
        ges("mam2"),
        "active",
        "mama2Own",
        "fixtureMama2Playback0001"
      ),
    ];
    const result = await catalogTransform({
      ...context,
      data: { ...context.data, sponsorships },
    });
    expect(
      result.rows.gesture.map((row) => [row.legacyId, row.playbackId])
    ).toEqual([
      [ges("mam1"), "fixtureSponsoredPlayback0001"],
      [ges("mam2"), "mama2Own"],
      [ges("pap1"), "papaOwn"],
      [ges("ete1"), "fixtureEtenPlayback0001"],
    ]);
    const warnings = result.sections[0]?.issues.filter((issue) =>
      ["missedRestore", "changedDuringSponsorship"].includes(issue.code)
    );
    expect(warnings?.map((issue) => [issue.code, issue.ids])).toEqual([
      ["missedRestore", [ges("pap1"), "ks7missed"]],
      ["changedDuringSponsorship", [ges("ete1"), "ks7changed"]],
    ]);
    expect(result.sections[0]?.counts.gesturesVideoRestored).toBe(2);
  });

  test("warns about a missing Mux map, and about playback ids it does not know", async () => {
    const without = await catalogTransform(
      await fixtureContext({ noMuxMap: true })
    );
    expect(without.rows.gesture.every((row) => row.muxAssetId === null)).toBe(
      true
    );
    expect(without.sections[0]?.issues[0]).toMatchObject({
      code: "noMuxMap",
      count: 4,
    });
    const withMap = await catalogTransform(await fixtureContext());
    expect(
      withMap.sections[0]?.issues.find(
        (issue) => issue.code === "muxAssetMissing"
      )
    ).toMatchObject({
      count: 3,
      ids: [ges("mam2"), ges("pap1"), ges("ete1")],
    });
    expect(withMap.sections[0]?.counts.gesturesWithoutAsset).toBe(3);
  });

  test("keeps every slug when a newer export adds gestures", async () => {
    const context = await fixtureContext();
    const before = await catalogTransform(context);
    const newer: GestureRow[] = [
      ...context.data.gestures,
      {
        ...(context.data.gestures[0] as GestureRow),
        _creationTime: 1_800_000_000_000,
        _id: "kg7newer0001",
        name: "Mama",
      },
      {
        ...(context.data.gestures[0] as GestureRow),
        _creationTime: 1_800_000_000_001,
        _id: "kg7newer0002",
        name: "Mama 2",
      },
    ];
    const after = await catalogTransform({
      ...context,
      data: { ...context.data, gestures: newer },
    });
    expect(after.rows.gesture.slice(0, 4).map((row) => row.slug)).toEqual(
      before.rows.gesture.map((row) => row.slug)
    );
    expect(after.rows.gesture.slice(4).map((row) => row.slug)).toEqual([
      "mama-3",
      "mama-2-2",
    ]);
    expect(assignSlugs(["!!!", "", "Ça va"], "gesture")).toEqual([
      "gesture",
      "gesture-2",
      "ca-va",
    ]);
    expect(sortRanks(["b", "A", "a", "Á"])).toEqual([3, 0, 1, 2]);
  });

  test("names every conflict target and returns its reset keys and FTS gestures", async () => {
    const result = await catalogTransform(await fixtureContext());
    expect(result.group).toBe("20-catalog");
    expect(conflictProblems(result.statements)).toEqual([]);
    expect(result.statements).toHaveLength(
      result.rows.category.length +
        result.rows.gesture.length +
        result.rows.gestureKeyword.length +
        result.rows.gestureCategory.length
    );
    const gestureIds = result.rows.gesture.map((row) => row.id);
    expect(result.ftsGestureIds).toEqual(gestureIds);
    expect(result.resetKeys.rows?.gesture).toEqual(gestureIds);
    expect(result.resetKeys.rows?.category).toEqual(
      result.rows.category.map((row) => row.id)
    );
    expect(result.resetKeys.rows?.gesture_keyword).toEqual(
      result.rows.gestureKeyword.map((row) => [row.gestureId, row.keyword])
    );
    expect(result.resetKeys.rows?.gesture_category).toEqual(
      result.rows.gestureCategory.map((row) => [row.gestureId, row.categoryId])
    );
  });

  test("drops every asset id on staging and keeps every count", async () => {
    const staging = await catalogTransform(
      await fixtureContext({ target: "staging" })
    );
    const production = await catalogTransform(await fixtureContext());
    expect(staging.rows.gesture.every((row) => row.muxAssetId === null)).toBe(
      true
    );
    expect(staging.statements.join("\n")).not.toContain("asset-fixture");
    expect(staging.statements).toHaveLength(production.statements.length);
    expect(staging.sections[0]?.counts).toEqual(
      production.sections[0]?.counts ?? {}
    );
  });
});
