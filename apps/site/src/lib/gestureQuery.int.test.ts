// @vitest-environment node
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";
import {
  fetchCategoryOptions,
  fetchGestures,
  GESTURES_PER_PAGE,
} from "./gestureQuery";

const ACTIVE_COUNT = 25;
const INACTIVE_COUNT = 3;
/** How many of the active gestures are *also* filed under the small category. */
const SMALL_CATEGORY_COUNT = 5;

/*
 * Every assertion is scoped to a category created by this run.
 *
 * Not decoration: the local D1 under `.wrangler/state/vitest` is never
 * cleared, so by the second run the `gestures` table holds every fixture
 * every other integration file has ever created. An unscoped
 * `expect(totalDocs).toBe(25)` would pass exactly once and then fail forever,
 * and the obvious "fix" — loosening it to `toBeGreaterThan` — deletes the
 * assertion that this test exists for.
 *
 * Scoping by category also strengthens the test rather than weakening it: the
 * count now has to respect *both* filters, so a total taken before either one
 * is applied is still caught.
 */
const RUN = crypto.randomUUID();

describe("fetchGestures", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let bigCategoryId: number;
  let smallCategoryId: number;
  let emptyCategoryId: number;

  const createCategory = async (label: string): Promise<number> => {
    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `${label} ${RUN}` },
      locale: "nl",
    });

    return category.id;
  };

  beforeAll(async () => {
    payload = await getPayload({ config });

    bigCategoryId = await createCategory("Groot");
    smallCategoryId = await createCategory("Klein");
    emptyCategoryId = await createCategory("Leeg");

    for (let index = 0; index < ACTIVE_COUNT; index++) {
      await payload.create({
        collection: "gestures",
        data: {
          categories:
            index < SMALL_CATEGORY_COUNT
              ? [bigCategoryId, smallCategoryId]
              : [bigCategoryId],
          isActive: true,
          // Zero-padded so the sort order is the fixture order, which is what
          // lets the page-overlap assertion below be exact.
          name: `Gebaar ${RUN} ${String(index).padStart(2, "0")}`,
          playbackId: `pb-${RUN}-${index}`,
        },
        locale: "nl",
      });
    }

    for (let index = 0; index < INACTIVE_COUNT; index++) {
      await payload.create({
        collection: "gestures",
        data: {
          categories: [bigCategoryId],
          isActive: false,
          name: `Gebaar ${RUN} inactief ${index}`,
          playbackId: `pb-${RUN}-inactive-${index}`,
        },
        locale: "nl",
      });
    }
  });

  it("boots with the fixtures this file assumes", () => {
    // `beforeAll` failing is reported by Vitest as *skipped*, not failed, so
    // a run that seeded nothing looks green. This is the one assertion that
    // turns that into a named failure.
    expect(bigCategoryId).toBeGreaterThan(0);
    expect(GESTURES_PER_PAGE).toBe(12);
  });

  it("reports a page count derived from the filtered total, not the table size", async () => {
    const result = await fetchGestures({
      categories: [String(bigCategoryId)],
      locale: "nl",
      page: 1,
    });

    // 25 active, 3 inactive, 12 per page -> 3 pages. If the count were taken
    // before the isActive filter it would be 28 -> still 3; so also assert
    // the total itself, which is what actually distinguishes the two.
    expect(result.totalDocs).toBe(ACTIVE_COUNT);
    expect(result.totalPages).toBe(3);
  });

  it("fetches one page rather than the whole set", async () => {
    const result = await fetchGestures({
      categories: [String(bigCategoryId)],
      locale: "nl",
      page: 1,
    });

    expect(result.gestures).toHaveLength(GESTURES_PER_PAGE);
  });

  it("serves the last page rather than an empty one", async () => {
    const result = await fetchGestures({
      categories: [String(bigCategoryId)],
      locale: "nl",
      page: 3,
    });

    expect(result.page).toBe(3);
    expect(result.gestures).toHaveLength(ACTIVE_COUNT - 2 * GESTURES_PER_PAGE);
  });

  it("clamps a page beyond the end instead of returning an error", async () => {
    const result = await fetchGestures({
      categories: [String(bigCategoryId)],
      locale: "nl",
      page: 99,
    });

    expect(result.page).toBe(3);
    expect(result.gestures).toHaveLength(ACTIVE_COUNT - 2 * GESTURES_PER_PAGE);
    // The clamped page must still describe the real set, not the empty slice
    // the adapter short-circuits to when it overshoots.
    expect(result.totalDocs).toBe(ACTIVE_COUNT);
    expect(result.totalPages).toBe(3);
  });

  it("treats a nonsense page number as the first page", async () => {
    for (const page of [0, -3, Number.NaN]) {
      const result = await fetchGestures({
        categories: [String(bigCategoryId)],
        locale: "nl",
        page,
      });

      expect(result.page).toBe(1);
      expect(result.gestures).toHaveLength(GESTURES_PER_PAGE);
    }
  });

  it("reaches every row exactly once across the pages it advertises", async () => {
    // The failure this catches is the one that hides: an off-by-one in the
    // offset, or an unstable sort, shows a plausible page count while some
    // gestures appear twice and others never appear at all.
    const seen: string[] = [];

    for (let page = 1; page <= 3; page++) {
      const result = await fetchGestures({
        categories: [String(bigCategoryId)],
        locale: "nl",
        page,
      });
      seen.push(...result.gestures.map((gesture) => String(gesture.id)));
    }

    expect(seen).toHaveLength(ACTIVE_COUNT);
    expect(new Set(seen).size).toBe(ACTIVE_COUNT);
  });

  it("recomputes the page count when a filter narrows the set", async () => {
    const result = await fetchGestures({
      categories: [String(smallCategoryId)],
      locale: "nl",
    });

    expect(result.totalDocs).toBe(SMALL_CATEGORY_COUNT);
    expect(result.totalPages).toBe(1);
    expect(result.gestures).toHaveLength(SMALL_CATEGORY_COUNT);
  });

  it("hides inactive gestures from the rows as well as from the count", async () => {
    const result = await fetchGestures({
      categories: [String(bigCategoryId)],
      locale: "nl",
      page: 3,
    });

    for (const gesture of result.gestures) {
      expect(gesture.isActive).toBe(true);
    }
  });

  it("offers a first page rather than a zeroth one when nothing matches", async () => {
    const result = await fetchGestures({
      categories: [String(emptyCategoryId)],
      locale: "nl",
    });

    expect(result.gestures).toEqual([]);
    expect(result.totalDocs).toBe(0);
    expect(result.page).toBe(1);
    // Not 0: `Pagina 1 van 0` is what the adapter would have the interface
    // say, and it reads as a broken page rather than an empty one.
    expect(result.totalPages).toBe(1);
  });

  it("populates the categories each card renders", async () => {
    const result = await fetchGestures({
      categories: [String(smallCategoryId)],
      locale: "nl",
    });

    for (const gesture of result.gestures) {
      for (const category of gesture.categories) {
        expect(typeof category).toBe("object");
      }
    }
  });

  it("serves the Dutch name to a French visitor rather than an empty grid", async () => {
    // The locale fallback applies here too: the *read* falls back even
    // though a `where` clause would not, so the French page must render Dutch
    // names rather than 25 blank cards.
    const result = await fetchGestures({
      categories: [String(smallCategoryId)],
      locale: "fr",
    });

    expect(result.totalDocs).toBe(SMALL_CATEGORY_COUNT);
    for (const gesture of result.gestures) {
      expect(gesture.name).toContain(RUN);
    }
  });
});

describe("fetchCategoryOptions", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let activeId: number;
  let inactiveId: number;

  beforeAll(async () => {
    payload = await getPayload({ config });

    const active = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Zichtbaar ${RUN}` },
      locale: "nl",
    });
    activeId = active.id;

    const inactive = await payload.create({
      collection: "categories",
      data: { isActive: false, name: `Verborgen ${RUN}` },
      locale: "nl",
    });
    inactiveId = inactive.id;
  });

  it("offers an active category as a filter", async () => {
    const options = await fetchCategoryOptions("nl");

    expect(options.map((option) => option.id)).toContain(String(activeId));
  });

  it("does not offer a deactivated category, which would filter to nothing", async () => {
    const options = await fetchCategoryOptions("nl");

    expect(options.map((option) => option.id)).not.toContain(
      String(inactiveId)
    );
  });
});
