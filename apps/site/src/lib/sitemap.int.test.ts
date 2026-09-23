// @vitest-environment node
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";
import { buildSitemap, fetchSitemapGestures } from "./sitemap";

const ORIGIN = "https://smog.example";

/*
 * Every fixture name carries this, for the reason `gestureQuery.int.test.ts`
 * spells out: the local D1 under `.wrangler/state/vitest` is never cleared,
 * so a fixed name collides with the last run's leftovers — in `beforeAll`,
 * which Vitest reports as *skipped* rather than failed.
 */
const RUN = crypto.randomUUID();

describe("the sitemap against a real database", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let activeId: number;
  let inactiveId: number;

  beforeAll(async () => {
    payload = await getPayload({ config });

    // `gestures.categories` is required, so a gesture fixture needs one of
    // its own; sharing a category with another file's fixtures would couple
    // the two through a database neither of them clears.
    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Sitemap ${RUN}` },
      locale: "nl",
    });

    const active = await payload.create({
      collection: "gestures",
      data: {
        categories: [category.id],
        isActive: true,
        name: `Sitemap actief ${RUN}`,
        playbackId: `pb-sitemap-${RUN}-active`,
      },
      locale: "nl",
    });

    const inactive = await payload.create({
      collection: "gestures",
      data: {
        categories: [category.id],
        isActive: false,
        name: `Sitemap inactief ${RUN}`,
        playbackId: `pb-sitemap-${RUN}-inactive`,
      },
      locale: "nl",
    });

    activeId = active.id;
    inactiveId = inactive.id;
  });

  it("lists an active gesture", async () => {
    // The pair matters: without this, the test below would pass against a
    // function that returned nothing at all.
    const ids = (await fetchSitemapGestures(payload)).map(
      (gesture) => gesture.id
    );

    expect(ids).toContain(activeId);
  });

  it("omits an inactive gesture", async () => {
    /*
     * The obvious assertion, and it does catch the failure it is named for —
     * *if both guards go*. A mutation sweep pinned down what it cannot do:
     * `fetchSitemapGestures` asks for `isActive` twice, once through
     * `overrideAccess: false` (which runs `publicReadActive`) and once through
     * an explicit `where`, and the two filter on the same predicate — so
     * flipping `overrideAccess` alone leaves this green, and no fixture can
     * change that, because no row is hidden by one guard and not the other.
     * Each half is pinned by name in `sitemap.test.ts`; this is what proves the
     * pair against a real access layer and a real database.
     */
    const ids = (await fetchSitemapGestures(payload)).map(
      (gesture) => gesture.id
    );

    expect(ids).not.toContain(inactiveId);
  });

  it("carries a real lastModified for the rows it lists", async () => {
    const [gesture] = (await fetchSitemapGestures(payload)).filter(
      (candidate) => candidate.id === activeId
    );

    expect(Number.isNaN(Date.parse(gesture?.updatedAt ?? ""))).toBe(false);
  });

  it("puts the active gesture in every locale and the inactive one in none", async () => {
    const urls = (await buildSitemap(payload, ORIGIN)).map(
      (entry) => entry.url
    );

    expect(urls).toContain(`${ORIGIN}/nl/gestures/${activeId}`);
    expect(urls).toContain(`${ORIGIN}/en/gestures/${activeId}`);
    expect(urls).toContain(`${ORIGIN}/fr/gestures/${activeId}`);
    expect(
      urls.filter((url) => url.endsWith(`/gestures/${inactiveId}`))
    ).toEqual([]);
  });
});
