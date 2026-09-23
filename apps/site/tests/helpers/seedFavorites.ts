import { getPayload } from "payload";
import config from "../../src/payload.config.js";
import { withBusyRetry } from "./d1Retry";

export interface FavoriteFixtures {
  categoryName: string;
  firstId: string;
  firstName: string;
  run: string;
  secondId: string;
  secondName: string;
}

/**
 * Two gestures to favourite, and nothing else.
 *
 * Seeded rather than assumed for the reason the other e2e helpers give: the
 * dev server's D1 at `.wrangler/state/v3` is whatever the last person left
 * behind. Two is the smallest number that can tell "the list rendered" from
 * "the list rendered *these* ids, in this order".
 */
export async function seedFavoriteFixtures(): Promise<FavoriteFixtures> {
  const payload = await getPayload({ config });
  const run = crypto.randomUUID().slice(0, 8);
  const categoryName = `E2E fav ${run}`;

  const category = await withBusyRetry(
    "create the favorites e2e category",
    () =>
      payload.create({
        collection: "categories",
        data: { isActive: true, name: categoryName },
        locale: "nl",
      })
  );

  const createGesture = (label: string) =>
    withBusyRetry(`create the ${label} favorites e2e gesture`, () =>
      payload.create({
        collection: "gestures",
        data: {
          categories: [category.id],
          isActive: true,
          name: `E2E fav ${run} ${label}`,
          playbackId: `e2efav-${run}-${label}`,
        },
        locale: "nl",
      })
    );

  const first = await createGesture("een");
  const second = await createGesture("twee");

  return {
    categoryName,
    firstId: String(first.id),
    firstName: `E2E fav ${run} een`,
    run,
    secondId: String(second.id),
    secondName: `E2E fav ${run} twee`,
  };
}

export async function cleanupFavoriteFixtures(
  fixtures: FavoriteFixtures
): Promise<void> {
  const payload = await getPayload({ config });

  await withBusyRetry("delete the favorites e2e gestures", () =>
    payload.delete({
      collection: "gestures",
      where: { playbackId: { like: `e2efav-${fixtures.run}-` } },
    })
  );

  await withBusyRetry("delete the favorites e2e category", () =>
    payload.delete({
      collection: "categories",
      where: { name: { equals: fixtures.categoryName } },
    })
  );
}
