import type { Where } from "payload";
import { describe, expect, it } from "vitest";
import { buildSearchWhere, searchGestureIds } from "./search";

/** The second half of the `and`: the clause that actually matches text. */
const textClause = (where: Where): Where[] =>
  ((where.and as Where[])[1]?.or ?? []) as Where[];

describe("buildSearchWhere", () => {
  it("always constrains to active entries, so a hidden gesture cannot leak", () => {
    // Belt to `overrideAccess: false`'s braces. The access rule is what
    // enforces this today; the clause keeps the query honest the day someone
    // loosens `search.read` for the admin panel's benefit, and it is the half
    // of the pair that a unit test can pin.
    expect((buildSearchWhere("hallo").and as Where[])[0]).toEqual({
      isActive: { equals: true },
    });
  });

  it("searches the concepts as well as the title", () => {
    // `concepts` is the synonym list an editor fills in precisely so a gesture
    // is findable by a word that is not its name. Searching only `title`
    // silently throws that away.
    expect(textClause(buildSearchWhere("hallo")).flatMap(Object.keys)).toEqual([
      "title",
      "concepts",
    ]);
  });

  it("matches a substring rather than the whole field", () => {
    // `equals` would mean a visitor has to type the gesture's exact name,
    // which is the one thing a search box exists to avoid.
    expect(textClause(buildSearchWhere("hal"))).toEqual([
      { title: { contains: "hal" } },
      { concepts: { contains: "hal" } },
    ]);
  });
});

describe("searchGestureIds", () => {
  /*
   * These run in jsdom with no database. That is the assertion: a blank query
   * must return before `getPayloadClient` is reached, because there is no
   * search to run. If the short-circuit moved below the boot, every case here
   * would fail trying to resolve Cloudflare bindings in a browser-like
   * environment rather than returning an empty list.
   */
  it("treats an empty query as no search", async () => {
    expect(await searchGestureIds("", "nl")).toEqual([]);
  });

  it("treats a whitespace-only query as no search", async () => {
    // `?q=` is what a cleared search box leaves in the URL. It must mean
    // "everything", which the caller expresses by constraining nothing — not
    // "nothing", which is what an empty id list would mean.
    expect(await searchGestureIds("   \t\n ", "fr")).toEqual([]);
  });
});
