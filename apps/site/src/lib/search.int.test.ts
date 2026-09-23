// @vitest-environment node
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";
import { GESTURES_PER_PAGE } from "./gestureQuery";
import { searchGestureIds } from "./search";

/*
 * Every fixture carries a per-run suffix, and every search term this file
 * issues contains it.
 *
 * The local D1 under `.wrangler/state/vitest` is persisted and never cleared,
 * so by the second run the index holds every entry every earlier run wrote.
 * Searching the bare word "Hallo" would match those too, and the negative
 * assertions below — `toEqual([])`, "no duplicates", "requested locale first"
 * — would be measuring leftovers rather than this run's fixtures.
 */
const RUN = crypto.randomUUID().slice(0, 8);

/** Appears in the Dutch name of both translated and untranslated fixtures. */
const DUTCH_TERM = `Hallo${RUN}`;
/** Appears only in the French name of the translated fixture. */
const FRENCH_TERM = `Bonjour${RUN}`;
/** Appears in a Dutch `concepts` entry and in no name at all. */
const CONCEPT_TERM = `Begrip${RUN}`;
/** Appears in the Dutch name of more gestures than the list page shows. */
const CROWD_TERM = `Veel${RUN}`;

/**
 * One more than `GESTURES_PER_PAGE`.
 *
 * The number that matters: a page-sized `limit` on the index query would cap
 * the *whole* result set at twelve rather than the first page at twelve, and
 * the thirteenth gesture would be unreachable through search at any page
 * number. Twelve fixtures would not tell the two apart.
 */
const CROWD_COUNT = GESTURES_PER_PAGE + 1;

describe("searchGestureIds", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let categoryId: number;
  let dutchOnlyGestureId: number;
  let translatedGestureId: number;
  let conceptGestureId: number;
  let inactiveGestureId: number;

  const createGesture = async (
    name: string,
    extra: { concepts?: string[]; isActive?: boolean } = {}
  ): Promise<number> => {
    const gesture = await payload.create({
      collection: "gestures",
      data: {
        categories: [categoryId],
        concepts: extra.concepts,
        isActive: extra.isActive ?? true,
        name,
        playbackId: `pb-${RUN}-${name}`,
      },
      locale: "nl",
    });

    return gesture.id;
  };

  beforeAll(async () => {
    payload = await getPayload({ config });

    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Zoeken ${RUN}` },
      locale: "nl",
    });
    categoryId = category.id;

    dutchOnlyGestureId = await createGesture(`${DUTCH_TERM} eenzaam`);

    translatedGestureId = await createGesture(`${DUTCH_TERM} vertaald`);
    await payload.update({
      collection: "gestures",
      data: { name: `${FRENCH_TERM} traduit ${RUN}` },
      id: translatedGestureId,
      locale: "fr",
    });

    conceptGestureId = await createGesture(`Zonder naam ${RUN}`, {
      concepts: [CONCEPT_TERM, "tweede"],
    });

    inactiveGestureId = await createGesture(`${DUTCH_TERM} verborgen`, {
      isActive: false,
    });

    for (let index = 0; index < CROWD_COUNT; index++) {
      await createGesture(`${CROWD_TERM} ${String(index).padStart(2, "0")}`);
    }
  });

  it("boots with the fixtures this file assumes", () => {
    // A throw in `beforeAll` fails the file without failing a named test, and
    // Vitest reports the rest as *skipped* — a run that indexed nothing would
    // otherwise look green. This is the assertion that names that failure.
    expect(dutchOnlyGestureId).toBeGreaterThan(0);
    expect(translatedGestureId).toBeGreaterThan(0);
    expect(conceptGestureId).toBeGreaterThan(0);
    expect(inactiveGestureId).toBeGreaterThan(0);
  });

  it("finds a Dutch-only gesture when searching in French", async () => {
    // `fallback: true` applies to reads, not to `where` clauses. A naive
    // `payload.find({ collection: "search", locale: "fr", where: { title: ... } })`
    // returns zero rows for content that only exists in `nl` — which is all
    // content today, since `en` and `fr` start empty. A French visitor would
    // see an empty site and no error.
    const ids = await searchGestureIds(DUTCH_TERM, "fr");

    expect(ids).toContain(dutchOnlyGestureId);
  });

  it("prefers a translated match in the requested locale", async () => {
    // Once a French translation exists, searching its French name must find
    // it — the French name is in no other locale's column.
    const ids = await searchGestureIds(FRENCH_TERM, "fr");

    expect(ids).toContain(translatedGestureId);
  });

  it("still finds the Dutch name for a translated gesture", async () => {
    // Falling back must not stop working once a translation exists.
    const ids = await searchGestureIds(DUTCH_TERM, "fr");

    expect(ids).toContain(translatedGestureId);
  });

  it("returns nothing for a query that matches nothing, rather than everything", async () => {
    expect(await searchGestureIds(`zzzzzzz${RUN}`, "nl")).toEqual([]);
  });

  it("treats a blank query as no search rather than matching all rows", async () => {
    expect(await searchGestureIds("   ", "nl")).toEqual([]);
  });

  it("searches the concepts as well as the name", async () => {
    // `concepts` is the synonym list an editor fills in precisely so a gesture
    // is findable by a word that is not its name. Searching only `title`
    // silently throws that away.
    const ids = await searchGestureIds(CONCEPT_TERM, "nl");

    expect(ids).toEqual([conceptGestureId]);
  });

  it("does not offer a deactivated gesture, which the list page would refuse to serve", async () => {
    // Search must not become a way to enumerate what `publicReadActive` hides.
    const ids = await searchGestureIds(DUTCH_TERM, "nl");

    expect(ids).not.toContain(inactiveGestureId);
  });

  it("matches part of a word rather than only the whole name", async () => {
    const ids = await searchGestureIds(DUTCH_TERM, "nl");

    expect(ids).toEqual(
      expect.arrayContaining([dutchOnlyGestureId, translatedGestureId])
    );
  });

  it("returns every match, not the first page of them", async () => {
    // The caller turns this list into one `id: { in: [...] }` clause and
    // paginates *that*. A page-sized limit here would strand every match past
    // the twelfth on a page number nobody can reach.
    const ids = await searchGestureIds(CROWD_TERM, "nl");

    expect(ids).toHaveLength(CROWD_COUNT);
    expect(CROWD_COUNT).toBeGreaterThan(GESTURES_PER_PAGE);
  });

  it("names a gesture once when it matches in both the requested and the default locale", async () => {
    // `RUN` is in the Dutch name of every fixture and in the French name of
    // the translated one, so the two queries overlap on exactly that gesture.
    const ids = await searchGestureIds(RUN, "fr");

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(translatedGestureId);
    expect(ids).toContain(dutchOnlyGestureId);
  });

  it("puts the requested locale's matches before the fallback's", async () => {
    // The union is ordered, not a set: a French visitor whose query matches a
    // French name and a Dutch one should see the French match first.
    const ids = await searchGestureIds(RUN, "fr");

    expect(ids.indexOf(translatedGestureId)).toBeLessThan(
      ids.indexOf(dutchOnlyGestureId)
    );
  });

  it("does not match a French name when the search is Dutch", async () => {
    // Nothing French can leak into a Dutch search: the French-only name is in
    // the `fr` column and the Dutch query never reads it.
    expect(await searchGestureIds(FRENCH_TERM, "nl")).toEqual([]);
  });
});
