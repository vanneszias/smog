// @vitest-environment node
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";

describe("Gestures locale fallback", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let categoryId: number;

  beforeAll(async () => {
    payload = await getPayload({ config });
    const category = await payload.create({
      collection: "categories",
      locale: "nl",
      data: { name: "Begroetingen", isActive: true },
    });
    categoryId = category.id;
  });

  it("serves the Dutch value when the French translation is missing", async () => {
    const created = await payload.create({
      collection: "gestures",
      locale: "nl",
      data: {
        name: "Hallo",
        categories: [categoryId],
        playbackId: "test-playback-id",
        isActive: true,
      },
    });

    const inFrench = await payload.findByID({
      collection: "gestures",
      id: created.id,
      locale: "fr",
      fallbackLocale: "nl",
    });

    expect(inFrench.name).toBe("Hallo");
  });

  it("serves the Dutch concepts and info when the French translation is missing", async () => {
    const created = await payload.create({
      collection: "gestures",
      locale: "nl",
      data: {
        name: "Dank je wel",
        categories: [categoryId],
        playbackId: "test-playback-id-2",
        isActive: true,
        info: "Een gebaar om dank te betuigen.",
        concepts: ["bedankt", "dankjewel"],
      },
    });

    const inFrench = await payload.findByID({
      collection: "gestures",
      id: created.id,
      locale: "fr",
      fallbackLocale: "nl",
    });

    expect(inFrench.info).toBe("Een gebaar om dank te betuigen.");
    expect(inFrench.concepts).toEqual(["bedankt", "dankjewel"]);
  });

  it("returns a genuinely different value per locale once translated, proving the field is actually localized", async () => {
    const created = await payload.create({
      collection: "gestures",
      locale: "nl",
      data: {
        name: "Tot ziens",
        categories: [categoryId],
        playbackId: "test-playback-id-3",
        isActive: true,
      },
    });

    await payload.update({
      collection: "gestures",
      id: created.id,
      locale: "fr",
      data: { name: "Au revoir" },
    });

    const inDutch = await payload.findByID({
      collection: "gestures",
      id: created.id,
      locale: "nl",
    });
    const inFrench = await payload.findByID({
      collection: "gestures",
      id: created.id,
      locale: "fr",
    });

    // This is the discriminating assertion: if `localized: true` were
    // removed from `name`, both reads would return whichever value was
    // written last (there'd be only one, global, value), and this would
    // fail. The two fallback tests above pass identically whether or not
    // the field is localized, since they never write a second value.
    expect(inDutch.name).toBe("Tot ziens");
    expect(inFrench.name).toBe("Au revoir");
    expect(inDutch.name).not.toBe(inFrench.name);
  });
});
