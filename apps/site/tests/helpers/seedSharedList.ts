import { getPayload } from "payload";
import config from "../../src/payload.config.js";
import { withBusyRetry } from "./d1Retry";

export interface SharedListFixtures {
  categoryName: string;
  gestureName: string;
  listId: number;
  listName: string;
  ownerEmail: string;
  run: string;
  viewShareToken: string;
}

/**
 * One shared list, with one gesture on it, and the link to reach it by.
 *
 * Seeded rather than assumed, for the reason `seedGestures.ts` gives: the dev
 * server's D1 at `.wrangler/state/v3` is whatever the last person left
 * behind. It matters more here than elsewhere, because the thing under test is
 * a *token*, so there is no "find a suitable existing row" fallback at all.
 *
 * The token is read back from the created document rather than supplied,
 * which is the point: nothing in this file writes one. If `Lists`' minting
 * hook regressed, `viewShareToken` would come back null and the spec would
 * fail in its `beforeAll` with a message that says so.
 */
export async function seedSharedListFixtures(): Promise<SharedListFixtures> {
  const payload = await getPayload({ config });
  const run = crypto.randomUUID().slice(0, 8);

  const categoryName = `E2E lijst ${run}`;
  const gestureName = `E2E lijst ${run} gebaar`;
  const listName = `E2E gedeelde lijst ${run}`;
  const ownerEmail = `e2e-list-owner-${run}@example.com`;

  const category = await withBusyRetry("create the shared-list category", () =>
    payload.create({
      collection: "categories",
      data: { isActive: true, name: categoryName },
      locale: "nl",
    })
  );

  const gesture = await withBusyRetry("create the shared-list gesture", () =>
    payload.create({
      collection: "gestures",
      data: {
        categories: [category.id],
        isActive: true,
        name: gestureName,
        playbackId: `e2elist-${run}-gebaar`,
      },
      locale: "nl",
    })
  );

  const owner = await withBusyRetry("create the shared-list owner", () =>
    payload.create({
      collection: "users",
      data: {
        email: ownerEmail,
        password: crypto.randomUUID(),
        role: "user",
      },
    })
  );

  const list = await withBusyRetry("create the shared list", () =>
    payload.create({
      collection: "lists",
      data: {
        description: `Gedeeld door de e2e-suite (${run}).`,
        items: [{ gesture: gesture.id }],
        name: listName,
        owner: owner.id,
        visibility: "shared",
      },
      overrideAccess: true,
    })
  );

  if (!list.viewShareToken) {
    throw new Error(
      "The list was created without a viewShareToken — token minting is broken, so there is no link to test."
    );
  }

  return {
    categoryName,
    gestureName,
    listId: list.id,
    listName,
    ownerEmail,
    run,
    viewShareToken: list.viewShareToken,
  };
}

/** Makes the list private, which rotates both tokens and kills the link. */
export async function unshareList(listId: number): Promise<void> {
  const payload = await getPayload({ config });

  await withBusyRetry("un-share the e2e list", () =>
    payload.update({
      collection: "lists",
      data: { visibility: "private" },
      id: listId,
      overrideAccess: true,
    })
  );
}

/**
 * Removes everything the seed created, the list first.
 *
 * Order is not tidiness: Payload emits `lists_items.gesture_id` as
 * `NOT NULL` with `ON DELETE set null`, so
 * deleting the gesture while a list row points at it fails with a raw SQL
 * error and leaves the whole fixture set behind.
 */
export async function cleanupSharedListFixtures(
  fixtures: SharedListFixtures
): Promise<void> {
  const payload = await getPayload({ config });

  await withBusyRetry("delete the e2e shared list", () =>
    payload.delete({
      collection: "lists",
      id: fixtures.listId,
      overrideAccess: true,
    })
  );

  await withBusyRetry("delete the e2e list owner", () =>
    payload.delete({
      collection: "users",
      where: { email: { equals: fixtures.ownerEmail } },
    })
  );

  await withBusyRetry("delete the e2e list gesture", () =>
    payload.delete({
      collection: "gestures",
      where: { playbackId: { like: `e2elist-${fixtures.run}-` } },
    })
  );

  await withBusyRetry("delete the e2e list category", () =>
    payload.delete({
      collection: "categories",
      where: { name: { equals: fixtures.categoryName } },
    })
  );
}
