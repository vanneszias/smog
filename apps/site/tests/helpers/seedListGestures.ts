import { getPayload } from "payload";
import config from "../../src/payload.config.js";
import { withBusyRetry } from "./d1Retry";

export interface ListGestureFixtures {
  categoryName: string;
  /** A second member, and a list of theirs the spec must not be able to open. */
  otherListId: number;
  otherOwnerEmail: string;
  run: string;
  /** The gesture the spec searches for and puts on a list. */
  searchName: string;
}

/**
 * What `tests/e2e/account-lists.spec.ts` needs that it cannot make through
 * the UI.
 *
 * Two things. A gesture with a name nothing else in the database shares, so
 * the "add a gesture" search has exactly one hit to click — seeded rather
 * than assumed, for the reason `seedGestures.ts` gives: the dev server's D1 at
 * `.wrangler/state/v3` is whatever the last person left behind. And somebody
 * else's list, because the only way to test that the owner pages refuse one is
 * to have one that is genuinely not yours.
 *
 * `withBusyRetry` because this opens a second Payload instance against the
 * file the dev server already holds, and SQLite answers the second writer with
 * `SQLITE_BUSY` rather than queuing.
 */
export async function seedListGestureFixtures(): Promise<ListGestureFixtures> {
  const payload = await getPayload({ config });
  const run = crypto.randomUUID().slice(0, 8);

  const categoryName = `E2E lijstbeheer ${run}`;
  const searchName = `Lijstgebaar ${run}`;
  const otherOwnerEmail = `e2e-other-owner-${run}@example.test`;

  const category = await withBusyRetry("create the list-admin category", () =>
    payload.create({
      collection: "categories",
      data: { isActive: true, name: categoryName },
      locale: "nl",
    })
  );

  await withBusyRetry("create the list-admin gesture", () =>
    payload.create({
      collection: "gestures",
      data: {
        categories: [category.id],
        isActive: true,
        name: searchName,
        playbackId: `e2elistadmin-${run}-een`,
      },
      locale: "nl",
    })
  );

  const otherOwner = await withBusyRetry("create the other list owner", () =>
    payload.create({
      collection: "users",
      data: {
        email: otherOwnerEmail,
        password: crypto.randomUUID(),
        role: "user",
      },
    })
  );

  const otherList = await withBusyRetry("create somebody else's list", () =>
    payload.create({
      collection: "lists",
      data: {
        name: `Andermans lijst ${run}`,
        owner: otherOwner.id,
        visibility: "private",
      },
      overrideAccess: true,
    })
  );

  return {
    categoryName,
    otherListId: otherList.id,
    otherOwnerEmail,
    run,
    searchName,
  };
}

/**
 * Removes everything the seed created, and every list the spec made.
 *
 * Lists first: `lists_items.gesture_id` carries a foreign key, so deleting the
 * gesture while a list row points at it fails and leaves the fixtures behind.
 */
export async function cleanupListGestureFixtures(
  fixtures: ListGestureFixtures
): Promise<void> {
  const payload = await getPayload({ config });

  await withBusyRetry("delete the e2e list-admin lists", () =>
    payload.delete({
      collection: "lists",
      overrideAccess: true,
      where: { name: { like: fixtures.run } },
    })
  );

  await withBusyRetry("delete the other list owner", () =>
    payload.delete({
      collection: "users",
      where: { email: { equals: fixtures.otherOwnerEmail } },
    })
  );

  await withBusyRetry("delete the e2e list-admin gesture", () =>
    payload.delete({
      collection: "gestures",
      where: { playbackId: { like: `e2elistadmin-${fixtures.run}-` } },
    })
  );

  await withBusyRetry("delete the e2e list-admin category", () =>
    payload.delete({
      collection: "categories",
      where: { name: { equals: fixtures.categoryName } },
    })
  );
}
