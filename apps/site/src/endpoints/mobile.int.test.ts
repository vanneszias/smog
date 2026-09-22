// @vitest-environment node
import { getPayload, handleEndpoints } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import { GESTURES_PER_PAGE } from "@/lib/gestureQuery";
import config from "../payload.config";

/**
 * `GET /api/mobile/gestures`, driven through `handleEndpoints` against a
 * real database — same reasoning as `favorites.int.test.ts`: routing is half
 * of what can go wrong, and calling the handler directly would exercise
 * neither the path it is mounted at nor the query-string parsing
 * `req.searchParams` does for a real request.
 *
 * Every fixture and every search term carries this run's own suffix. The
 * local D1 under `.wrangler/state/vitest` is never cleared, so an unscoped
 * assertion — a bare count, or a query word another file might also use —
 * would measure every earlier run's leftovers as well as this one's. Scoping
 * by a category id (for the list tests) or a per-run word (for the search
 * tests) is what `gestureQuery.int.test.ts` and `search.int.test.ts` already
 * do for the two helpers this endpoint calls, and this file inherits both
 * reasons at once.
 */
describe("GET /api/mobile/gestures", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;

  const SITE = "http://localhost:3003";
  const RUN = crypto.randomUUID().slice(0, 8);
  /** One more than a page, so page 1 and page 2 both have rows to compare. */
  const PAGE_CATEGORY_COUNT = GESTURES_PER_PAGE + 1;

  let pageCategoryId: number;
  let localeCategoryId: number;
  let inactiveInPageCategoryId: string;

  const get = async (query: string) => {
    const response = await handleEndpoints({
      config,
      request: new Request(`${SITE}/api/mobile/gestures?${query}`),
    });

    return { body: (await response.json()) as Body, status: response.status };
  };

  interface GestureRow {
    id: string;
    name: string;
  }

  interface Body {
    docs: GestureRow[];
    page: number;
    totalDocs: number;
    totalPages: number;
  }

  beforeAll(async () => {
    payload = await getPayload({ config });

    const pageCategory = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Mobiel pagina ${RUN}` },
      locale: "nl",
    });
    pageCategoryId = pageCategory.id;

    for (let index = 0; index < PAGE_CATEGORY_COUNT; index++) {
      await payload.create({
        collection: "gestures",
        data: {
          categories: [pageCategoryId],
          isActive: true,
          // Zero-padded so the fixture order is the name order, which is
          // what lets the page-overlap assertion below be exact.
          name: `Mobiel ${RUN} ${String(index).padStart(2, "0")}`,
          playbackId: `mobile-${RUN}-${index}`,
        },
        locale: "nl",
      });
    }

    const inactive = await payload.create({
      collection: "gestures",
      data: {
        categories: [pageCategoryId],
        isActive: false,
        name: `Mobiel ${RUN} inactief`,
        playbackId: `mobile-${RUN}-inactive`,
      },
      locale: "nl",
    });
    inactiveInPageCategoryId = String(inactive.id);

    const localeCategory = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Mobiel locale ${RUN}` },
      locale: "nl",
    });
    localeCategoryId = localeCategory.id;

    const translated = await payload.create({
      collection: "gestures",
      data: {
        categories: [localeCategoryId],
        isActive: true,
        name: `NLnaam ${RUN}`,
        playbackId: `mobile-${RUN}-locale`,
      },
      locale: "nl",
    });
    await payload.update({
      collection: "gestures",
      data: { name: `FRnaam ${RUN}` },
      id: translated.id,
      locale: "fr",
    });

    // A Dutch-only gesture findable from a French query only through the
    // cross-locale fallback `search.ts` runs — see that module's own
    // comment for why one pass over `fr` alone would miss it.
    await payload.create({
      collection: "gestures",
      data: {
        categories: [pageCategoryId],
        isActive: true,
        name: `Halo${RUN} eenzaam`,
        playbackId: `mobile-${RUN}-halo`,
      },
      locale: "nl",
    });

    // Findable by name, but hidden — `publicReadActive` on the read and
    // `buildSearchWhere`'s own `isActive` clause on the index both apply
    // here, and this pins that neither is skipped by going through this
    // endpoint instead of the list page.
    await payload.create({
      collection: "gestures",
      data: {
        categories: [pageCategoryId],
        isActive: false,
        name: `Verborgen${RUN}`,
        playbackId: `mobile-${RUN}-hidden`,
      },
      locale: "nl",
    });
  });

  it("boots with the fixtures this file assumes", () => {
    // `beforeAll` failing is reported as *skipped*, not failed — this is the
    // one assertion that turns that into a named failure.
    expect(pageCategoryId).toBeGreaterThan(0);
    expect(localeCategoryId).toBeGreaterThan(0);
  });

  it("returns active gestures", async () => {
    const { body } = await get(`locale=nl&category=${pageCategoryId}&page=1`);

    expect(body.docs.length).toBeGreaterThan(0);
  });

  it("does not return an inactive gesture", async () => {
    const seen: string[] = [];

    for (let page = 1; page <= 2; page++) {
      const { body } = await get(
        `locale=nl&category=${pageCategoryId}&page=${page}`
      );
      seen.push(...body.docs.map((doc) => doc.id));
    }

    expect(seen).not.toContain(inactiveInPageCategoryId);
  });

  it("answers in the requested locale", async () => {
    const nl = await get(`locale=nl&category=${localeCategoryId}`);
    const fr = await get(`locale=fr&category=${localeCategoryId}`);

    expect(nl.body.docs[0]?.name).toBe(`NLnaam ${RUN}`);
    expect(fr.body.docs[0]?.name).toBe(`FRnaam ${RUN}`);
    expect(fr.body.docs[0]?.name).not.toBe(nl.body.docs[0]?.name);
  });

  it("sorts stably across two identical requests", async () => {
    const a = await get(`locale=en&category=${pageCategoryId}&page=1`);
    const b = await get(`locale=en&category=${pageCategoryId}&page=1`);

    expect(a.body.docs.map((doc) => doc.id)).toEqual(
      b.body.docs.map((doc) => doc.id)
    );
  });

  it("never returns the same gesture on two pages", async () => {
    const one = await get(`locale=en&category=${pageCategoryId}&page=1`);
    const two = await get(`locale=en&category=${pageCategoryId}&page=2`);
    const ids = [...one.body.docs, ...two.body.docs].map((doc) => doc.id);

    // Every active gesture in this category, reached exactly once: two active
    // fixtures beyond `PAGE_CATEGORY_COUNT` (the locale-independent Halo
    // fixture and the inactive one, which is filtered out) plus the padded
    // set.
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(PAGE_CATEGORY_COUNT);
  });

  it("clamps a page past the end rather than returning nothing", async () => {
    const { body } = await get(
      `locale=nl&category=${pageCategoryId}&page=9999`
    );

    expect(body.docs.length).toBeGreaterThan(0);
    expect(body.page).toBe(body.totalPages);
  });

  it("finds a Dutch-only gesture from a French query", async () => {
    const { body } = await get(`locale=fr&q=Halo${RUN}`);

    expect(body.docs.length).toBeGreaterThan(0);
    expect(body.docs.some((doc) => doc.name.includes(`Halo${RUN}`))).toBe(true);
  });

  it("returns no gesture for a query matching nothing", async () => {
    const { body } = await get(`locale=nl&q=zzzzzz${RUN}`);

    expect(body.docs).toEqual([]);
  });

  it("does not leak an inactive gesture through search either", async () => {
    const { body } = await get(`locale=nl&q=Verborgen${RUN}`);

    expect(body.docs).toEqual([]);
  });

  it("needs no session", async () => {
    // No Authorization or Cookie header anywhere in this file. This asserts
    // it deliberately: `publicReadActive` is what makes the app usable
    // before sign-in, and a handler that reached for `req.user` would break
    // signed-out browsing without breaking a single test above.
    const { status } = await get("locale=nl");

    expect(status).toBe(200);
  });

  it("is reachable at the path the mobile app calls", async () => {
    // A handler registered at the wrong path 404s here and passes every
    // test above that calls it directly through `get`.
    const { status } = await get(`locale=nl&category=${pageCategoryId}`);

    expect(status).toBe(200);
  });
});
