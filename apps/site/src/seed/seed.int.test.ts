// @vitest-environment node
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";
import { categoryFixtures, gestureFixtures } from "./fixtures";
import { type SeedSummary, seed, seedUsersFromEnv } from "./seed";

const noop = () => {
  // The seed logs a line per collection; tests do not need it.
};

/**
 * These run against the persisted local D1 the whole suite shares, which
 * already holds documents from other integration files (including a gesture
 * named "Hallo"). So nothing here asserts a global count or global
 * uniqueness — every assertion is a *delta* across the two seed runs, which
 * is exactly what idempotency means and is stable no matter what else is in
 * the database or how many times the suite has run before.
 */
describe("seed", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let first: SeedSummary;
  let second: SeedSummary;
  let gesturesAfterFirst: number;
  let gesturesAfterSecond: number;
  let categoriesAfterFirst: number;
  let categoriesAfterSecond: number;

  beforeAll(async () => {
    payload = await getPayload({ config });

    const count = async (collection: "categories" | "gestures") =>
      (await payload.count({ collection, overrideAccess: true })).totalDocs;

    first = await seed({ payload, log: noop });
    gesturesAfterFirst = await count("gestures");
    categoriesAfterFirst = await count("categories");

    second = await seed({ payload, log: noop });
    gesturesAfterSecond = await count("gestures");
    categoriesAfterSecond = await count("categories");
    // Two full seed runs — around 200 writes against the local D1 — measured
    // at ~27s on this machine. That is inside the suite-wide 60s hookTimeout
    // but with little headroom on a slower CI box, so this hook asks for its
    // own budget rather than pushing the global one up for every file.
  }, 180_000);

  it("creates a document for every category fixture", () => {
    for (const fixture of categoryFixtures) {
      expect(first.categoryIds[fixture.name]).toBeTypeOf("number");
    }
  });

  it("creates a document for every gesture fixture", () => {
    for (const fixture of gestureFixtures) {
      expect(first.gestureIds[fixture.name]).toBeTypeOf("number");
    }
  });

  it("creates nothing on a second run", () => {
    expect(second.categories.created).toBe(0);
    expect(second.gestures.created).toBe(0);
    expect(second.users.created).toBe(0);
  });

  it("reuses the same documents on a second run instead of duplicating them", () => {
    expect(second.gestureIds).toEqual(first.gestureIds);
    expect(second.categoryIds).toEqual(first.categoryIds);
  });

  it("leaves the document counts untouched by the second run", () => {
    expect(gesturesAfterSecond).toBe(gesturesAfterFirst);
    expect(categoriesAfterSecond).toBe(categoriesAfterFirst);
  });

  it("links a gesture to every category it names, in order", async () => {
    const orange = await payload.findByID({
      collection: "gestures",
      id: first.gestureIds.Oranje,
      depth: 0,
      overrideAccess: true,
    });

    expect(orange.categories).toEqual([
      first.categoryIds.Kleuren,
      first.categoryIds["Eten en drinken"],
    ]);
  });

  it("writes the Dutch content as the source of truth", async () => {
    const hallo = await payload.findByID({
      collection: "gestures",
      id: first.gestureIds.Hallo,
      locale: "nl",
      overrideAccess: true,
    });

    expect(hallo.name).toBe("Hallo");
    expect(hallo.concepts).toEqual(["hoi", "dag", "hey"]);
    expect(hallo.playbackId).toBeTruthy();
  });

  it("writes the translations a fixture carries into their own locales", async () => {
    const [english, french] = await Promise.all([
      payload.findByID({
        collection: "gestures",
        id: first.gestureIds.Hallo,
        locale: "en",
        overrideAccess: true,
      }),
      payload.findByID({
        collection: "gestures",
        id: first.gestureIds.Hallo,
        locale: "fr",
        overrideAccess: true,
      }),
    ]);

    expect(english.name).toBe("Hello");
    expect(english.concepts).toEqual(["hi", "hey"]);
    expect(french.name).toBe("Bonjour");
  });

  it("falls back to Dutch for a gesture with no translation", async () => {
    const french = await payload.findByID({
      collection: "gestures",
      id: first.gestureIds.Melk,
      locale: "fr",
      overrideAccess: true,
    });

    expect(french.name).toBe("Melk");
    expect(french.concepts).toEqual(["melkje", "zuivel"]);
  });

  it("translates the categories too", async () => {
    const english = await payload.findByID({
      collection: "categories",
      id: first.categoryIds.Familie,
      locale: "en",
      overrideAccess: true,
    });

    expect(english.name).toBe("Family");
  });

  it("seeds the inactive gesture as inactive", async () => {
    const snoepje = await payload.findByID({
      collection: "gestures",
      id: first.gestureIds.Snoepje,
      overrideAccess: true,
    });

    expect(snoepje.isActive).toBe(false);
  });

  it("hides the inactive gesture from an anonymous caller", async () => {
    const visible = await payload.find({
      collection: "gestures",
      where: { id: { equals: first.gestureIds.Snoepje } },
      overrideAccess: false,
      depth: 0,
    });

    expect(visible.totalDocs).toBe(0);
  });

  it("leaves the active gestures readable by an anonymous caller", async () => {
    const visible = await payload.find({
      collection: "gestures",
      where: { id: { equals: first.gestureIds.Hallo } },
      overrideAccess: false,
      depth: 0,
    });

    expect(visible.totalDocs).toBe(1);
  });

  it("creates one admin and one regular user", async () => {
    const [admin, user] = seedUsersFromEnv({});

    const found = await payload.find({
      collection: "users",
      where: { email: { in: [admin.email, user.email] } },
      overrideAccess: true,
      depth: 0,
    });

    expect(found.totalDocs).toBe(2);
    expect(found.docs.find((doc) => doc.email === admin.email)?.role).toBe(
      "admin"
    );
    expect(found.docs.find((doc) => doc.email === user.email)?.role).toBe(
      "user"
    );
  });
});
