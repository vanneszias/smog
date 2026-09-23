// @vitest-environment node
import { sql } from "@payloadcms/db-d1-sqlite";
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";

/**
 * `publicReadActive` is unit-tested against a plain object in
 * `access/index.test.ts` (it returns `{ isActive: { equals: true } }`, not
 * `true`), but that alone doesn't prove the filter is actually wired onto
 * the `gestures` collection, or that `equals: true` genuinely hides a NULL
 * `isActive` row rather than merely rejecting `false`. Both require a real
 * query against a real database, which is what this file exercises.
 */
describe("publicReadActive against a real database", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let categoryId: number;

  beforeAll(async () => {
    payload = await getPayload({ config });
    const category = await payload.create({
      collection: "categories",
      locale: "nl",
      data: { name: "Access test category", isActive: true },
    });
    categoryId = category.id;
  });

  it("hides an explicitly inactive gesture from an anonymous caller", async () => {
    const created = await payload.create({
      collection: "gestures",
      locale: "nl",
      data: {
        name: "Inactive gesture",
        categories: [categoryId],
        playbackId: "access-inactive-gesture",
        isActive: false,
      },
    });

    const result = await payload.find({
      collection: "gestures",
      overrideAccess: false,
      user: undefined,
      where: { id: { equals: created.id } },
    });

    expect(result.docs).toHaveLength(0);
  });

  it("hides a gesture with a NULL isActive from an anonymous caller", async () => {
    const created = await payload.create({
      collection: "gestures",
      locale: "nl",
      data: {
        name: "Null isActive gesture",
        categories: [categoryId],
        playbackId: "access-null-isactive-gesture",
        isActive: true,
      },
    });

    // The local API's checkbox field always coerces to a boolean, so the only
    // way to reproduce the NULL row an import can leave behind is to write it
    // directly, the same way migrations do.
    await payload.db.drizzle.run(
      sql`UPDATE gestures SET is_active = NULL WHERE id = ${created.id}`
    );

    const anonymousResult = await payload.find({
      collection: "gestures",
      overrideAccess: false,
      user: undefined,
      where: { id: { equals: created.id } },
    });

    expect(anonymousResult.docs).toHaveLength(0);

    // Sanity check on the setup itself: the row genuinely has no isActive
    // value, so an unfiltered read still finds it. If this assertion ever
    // fails, the NULL write above stopped working and the test above would
    // be vacuously true for the wrong reason.
    const unfiltered = await payload.find({
      collection: "gestures",
      overrideAccess: true,
      where: { id: { equals: created.id } },
    });
    expect(unfiltered.docs).toHaveLength(1);
    expect(unfiltered.docs[0]?.isActive).toBeFalsy();
  });

  it("still allows an admin to read the NULL isActive row", async () => {
    const created = await payload.create({
      collection: "gestures",
      locale: "nl",
      data: {
        name: "Null isActive gesture for admin",
        categories: [categoryId],
        playbackId: "access-null-isactive-gesture-admin",
        isActive: true,
      },
    });

    await payload.db.drizzle.run(
      sql`UPDATE gestures SET is_active = NULL WHERE id = ${created.id}`
    );

    const result = await payload.find({
      collection: "gestures",
      overrideAccess: false,
      user: { id: 1, role: "admin", collection: "users" },
      where: { id: { equals: created.id } },
    });

    expect(result.docs).toHaveLength(1);
  });

  it("returns an active gesture to an anonymous caller", async () => {
    const created = await payload.create({
      collection: "gestures",
      locale: "nl",
      data: {
        name: "Active gesture",
        categories: [categoryId],
        playbackId: "access-active-gesture",
        isActive: true,
      },
    });

    const result = await payload.find({
      collection: "gestures",
      overrideAccess: false,
      user: undefined,
      where: { id: { equals: created.id } },
    });

    expect(result.docs).toHaveLength(1);
  });
});
