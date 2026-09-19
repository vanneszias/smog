// @vitest-environment node
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";

/**
 * The search index is maintained by hooks the plugin installs on `gestures`,
 * and every one of its writes happens inside a `try`/`catch` that logs and
 * returns (`plugin-search/dist/utilities/syncDocAsSearchIndex.js`, 3.89.0).
 * A broken index therefore never throws — it just quietly stops matching. So
 * the only way to know the index tracks the gestures is to change a gesture
 * and query the index for real.
 *
 * The local D1 the suite runs against is persisted and never cleared, so every
 * fixture name carries a per-run suffix. Without it a second run would match
 * the first run's leftovers and the `equals` counts below would be wrong in
 * whichever direction happened to hide the bug.
 */
const run = crypto.randomUUID().slice(0, 8);
const unique = (label: string) => `${label}-${run}`;

describe("search index sync", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let categoryId: number;

  const searchFor = async (title: string, locale?: "en" | "fr" | "nl") => {
    const results = await payload.find({
      collection: "search",
      locale,
      where: { title: { equals: title } },
    });
    return results.docs;
  };

  const createGesture = async (name: string, concepts: string[] = []) => {
    const gesture = await payload.create({
      collection: "gestures",
      locale: "nl",
      data: {
        name,
        categories: [categoryId],
        playbackId: `pb-${name}`,
        concepts,
        isActive: true,
      },
    });
    return gesture.id;
  };

  beforeAll(async () => {
    payload = await getPayload({ config });
    const category = await payload.create({
      collection: "categories",
      locale: "nl",
      data: { name: unique("Zoeken"), isActive: true },
    });
    categoryId = category.id;
  });

  it("indexes a new gesture", async () => {
    const name = unique("Zoekterm");
    await createGesture(name, ["vinden"]);

    expect(await searchFor(name)).toHaveLength(1);
  });

  it("indexes the gesture's concepts as a flattened string", async () => {
    const name = unique("Concepten");
    await createGesture(name, ["vinden", "opzoeken"]);

    const [doc] = await searchFor(name);

    expect(doc?.concepts).toBe("vinden opzoeken");
  });

  it("follows a rename", async () => {
    const before = unique("Voornaam");
    const after = unique("Hernoemd");
    const id = await createGesture(before);

    await payload.update({
      collection: "gestures",
      id,
      locale: "nl",
      data: { name: after },
    });

    expect(await searchFor(before)).toHaveLength(0);
    expect(await searchFor(after)).toHaveLength(1);
  });

  it("marks a deactivated gesture inactive in the index", async () => {
    const name = unique("Gedeactiveerd");
    const id = await createGesture(name);

    await payload.update({
      collection: "gestures",
      id,
      locale: "nl",
      data: { isActive: false },
    });

    const [doc] = await searchFor(name);

    expect(doc?.isActive).toBe(false);
  });

  it("removes the index entry when the gesture is deleted", async () => {
    const name = unique("Verwijderd");
    const id = await createGesture(name);
    expect(await searchFor(name)).toHaveLength(1);

    await payload.delete({ collection: "gestures", id });

    expect(await searchFor(name)).toHaveLength(0);
  });

  it("keeps exactly one index entry per gesture across repeated updates", async () => {
    const name = unique("Eenmalig");
    const id = await createGesture(name);

    for (const info of ["een", "twee", "drie"]) {
      await payload.update({
        collection: "gestures",
        id,
        locale: "nl",
        data: { info },
      });
    }

    expect(await searchFor(name)).toHaveLength(1);
  });

  /**
   * How the plugin treats a localized `gestures.name` is not obvious and is
   * not documented, so it is pinned here rather than left to be rediscovered.
   *
   * `syncDocAsSearchIndex` (3.89.0) syncs exactly one locale per save — the
   * request's — and re-reads the gesture in that locale first. So there is one
   * search document per gesture, with per-locale values filled in as editors
   * translate, NOT one document per locale and NOT every locale on every save.
   *
   * The consequence that matters for Stage 2: `fallback: true` applies when a
   * document is *read*, but not to a `where` clause. An entry indexed only in
   * `nl` is returned (with its Dutch title) by a French read, and is NOT
   * matched by a French query. A search UI must therefore query the default
   * locale, or query the user's locale and fall back to `nl` itself.
   */
  describe("localization", () => {
    it("writes only the locale the gesture was saved in", async () => {
      const name = unique("AlleenNederlands");
      await createGesture(name, ["alleen-nl"]);

      const [doc] = await searchFor(name);
      const allLocales = await payload.findByID({
        collection: "search",
        id: doc?.id as number,
        locale: "all",
      });

      expect(allLocales.title).toEqual({ nl: name });
    });

    it("falls back to the Dutch title when the entry is read in French", async () => {
      const name = unique("Terugval");
      await createGesture(name);

      const [doc] = await searchFor(name);
      const inFrench = await payload.findByID({
        collection: "search",
        id: doc?.id as number,
        locale: "fr",
      });

      expect(inFrench.title).toBe(name);
    });

    it("does not match a Dutch-only entry when querying in French", async () => {
      // Deliberately asserting the limitation, not wishing it away: a `where`
      // clause on a localized field reads that locale's column, and the
      // locale fallback does not apply to it.
      const name = unique("NietInFrans");
      await createGesture(name);

      expect(await searchFor(name, "nl")).toHaveLength(1);
      expect(await searchFor(name, "fr")).toHaveLength(0);
    });

    it("adds the French name to the same entry when the gesture is saved in French", async () => {
      const dutch = unique("Vertaald");
      const french = unique("Traduit");
      const id = await createGesture(dutch, ["nl-begrip"]);

      await payload.update({
        collection: "gestures",
        id,
        locale: "fr",
        data: { name: french, concepts: ["fr-notion"] },
      });

      // Still one entry, now queryable in either locale by that locale's name.
      expect(await searchFor(dutch, "nl")).toHaveLength(1);
      expect(await searchFor(french, "fr")).toHaveLength(1);

      const [doc] = await searchFor(dutch, "nl");
      expect(doc?.concepts).toBe("nl-begrip");

      const [frenchDoc] = await searchFor(french, "fr");
      expect(frenchDoc?.id).toBe(doc?.id);
      expect(frenchDoc?.concepts).toBe("fr-notion");
    });
  });

  describe("access", () => {
    it("lets an anonymous caller find an active gesture", async () => {
      const name = unique("Publiek");
      await createGesture(name);

      const results = await payload.find({
        collection: "search",
        overrideAccess: false,
        user: undefined,
        where: { title: { equals: name } },
      });

      expect(results.docs).toHaveLength(1);
    });

    it("hides a deactivated gesture's entry from an anonymous caller", async () => {
      // The whole point of mirroring `isActive` into the index. Without a
      // read rule the plugin's default is `() => true`, and search becomes a
      // way to enumerate gestures `publicReadActive` refuses to serve.
      const name = unique("Verborgen");
      const id = await createGesture(name);

      await payload.update({
        collection: "gestures",
        id,
        locale: "nl",
        data: { isActive: false },
      });

      const anonymous = await payload.find({
        collection: "search",
        overrideAccess: false,
        user: undefined,
        where: { title: { equals: name } },
      });
      expect(anonymous.docs).toHaveLength(0);

      // Sanity check on the setup: the entry still exists, it is only hidden.
      // Without this the assertion above would also pass if the sync had
      // silently failed and written nothing at all.
      const asAdmin = await payload.find({
        collection: "search",
        overrideAccess: false,
        user: { id: 1, role: "admin", collection: "users" },
        where: { title: { equals: name } },
      });
      expect(asAdmin.docs).toHaveLength(1);
    });

    it("refuses an anonymous write to the index", async () => {
      await expect(
        payload.create({
          collection: "search",
          overrideAccess: false,
          user: undefined,
          data: {
            title: unique("Ingeslopen"),
            doc: { relationTo: "gestures", value: 1 },
          },
        })
      ).rejects.toThrow();
    });
  });
});
