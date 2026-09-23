// @vitest-environment node
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";

/**
 * `isListOwnerField` is unit-tested against plain args in `lists.test.ts`,
 * but that alone doesn't prove Payload actually calls it with a `doc` that
 * has the pre-update `owner`, or that returning `false` from a field-level
 * `access.update` really does silently drop just that one field rather than
 * failing the whole request or leaking it through anyway. Both require a
 * real update against a real database, which is what this file exercises.
 *
 * Review-round finding: `listUpdateAccess` alone lets an anonymous request
 * holding a valid edit link update a list's `items`, but with no field-level
 * guard on `viewShareToken` / `editShareToken` / `allowSharedEditing`, that
 * same anonymous editor could rotate both tokens in the same request and
 * lock the owner out of their own list.
 */
describe("share-token field protection against a real database", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let ownerId: number;
  let gestureId: number;
  let listId: number;

  // Suffixed with Date.now(), like every other fixture value in this test
  // suite, because viewShareToken/editShareToken are `unique: true`. A run
  // against a local D1 persistence directory left over from an earlier
  // invocation (apps/site/.wrangler/state/vitest/worker-N, not cleared between
  // separate `bun run test` calls) hit a real
  // `UNIQUE constraint failed: lists.view_share_token` in this file's own
  // `beforeAll`, which skipped all 4 of its tests without any one of them
  // failing individually — this file colliding with its own prior run's data,
  // not a cross-file cascade.
  const originalViewToken = `view-original-${Date.now()}`;
  const editToken = `edit-original-${Date.now()}`;

  beforeAll(async () => {
    payload = await getPayload({ config });

    const category = await payload.create({
      collection: "categories",
      data: { name: "Field access", isActive: true },
    });

    const gesture = await payload.create({
      collection: "gestures",
      data: {
        name: "Acht",
        categories: [category.id],
        playbackId: "pb-acht",
        isActive: true,
      },
    });
    gestureId = gesture.id;

    const owner = await payload.create({
      collection: "users",
      data: {
        email: `list-field-access-${Date.now()}@example.com`,
        password: "test-password-123",
        role: "user",
      },
    });
    ownerId = owner.id;

    const list = await payload.create({
      collection: "lists",
      overrideAccess: true,
      data: {
        name: "Field access lijst",
        owner: ownerId,
        visibility: "shared",
        viewShareToken: originalViewToken,
        editShareToken: editToken,
        allowSharedEditing: true,
        isDefaultFavorites: false,
        items: [],
      },
    });
    listId = list.id;
  });

  it("lets an anonymous edit-link holder update items", async () => {
    const updated = await payload.update({
      collection: "lists",
      id: listId,
      overrideAccess: false,
      req: {
        user: null,
        searchParams: new URLSearchParams({ shareToken: editToken }),
      },
      data: { items: [{ gesture: gestureId }] },
    });

    const ids = (updated.items ?? []).map((item) =>
      typeof item.gesture === "object" ? item.gesture.id : item.gesture
    );
    expect(ids).toEqual([gestureId]);
  });

  it("does not let that same anonymous edit-link holder rotate viewShareToken", async () => {
    await payload.update({
      collection: "lists",
      id: listId,
      overrideAccess: false,
      req: {
        user: null,
        searchParams: new URLSearchParams({ shareToken: editToken }),
      },
      data: { viewShareToken: "hijacked-view-token" },
    });

    const after = await payload.findByID({
      collection: "lists",
      id: listId,
      overrideAccess: true,
    });

    expect(after.viewShareToken).toBe(originalViewToken);
    expect(after.viewShareToken).not.toBe("hijacked-view-token");
  });

  it("does not let that same anonymous edit-link holder turn off allowSharedEditing and back on", async () => {
    await payload.update({
      collection: "lists",
      id: listId,
      overrideAccess: false,
      req: {
        user: null,
        searchParams: new URLSearchParams({ shareToken: editToken }),
      },
      data: { allowSharedEditing: false },
    });

    const after = await payload.findByID({
      collection: "lists",
      id: listId,
      overrideAccess: true,
    });

    expect(after.allowSharedEditing).toBe(true);
  });

  it("does let the list's owner rotate editShareToken", async () => {
    // This one actually gets persisted (unlike the hijack attempts above,
    // which the field guard rejects before they ever reach storage), so it
    // needs the same per-run uniqueness as the fixture tokens above —
    // this is the second, independent instance of the R3 unique-token
    // collision this file had.
    const rotatedToken = `edit-rotated-by-owner-${Date.now()}`;
    const updated = await payload.update({
      collection: "lists",
      id: listId,
      overrideAccess: false,
      user: { id: ownerId, role: "user", collection: "users" },
      data: { editShareToken: rotatedToken },
    });

    expect(updated.editShareToken).toBe(rotatedToken);
  });
});
