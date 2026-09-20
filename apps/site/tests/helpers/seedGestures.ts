import { getPayload } from "payload";
import config from "../../src/payload.config.js";
import { withBusyRetry } from "./d1Retry";

/** Two pages at twelve per page, with a short last page. */
const BIG_COUNT = 15;
/** One page, so filtering visibly changes the page count. */
const SMALL_COUNT = 3;

export interface GestureFixtures {
  bigCategoryId: string;
  bigCategoryName: string;
  bigCount: number;
  run: string;
  smallCategoryId: string;
  smallCategoryName: string;
  smallCount: number;
}

/**
 * Gestures for the list page's e2e spec.
 *
 * Seeded rather than assumed: the dev server's D1 at `.wrangler/state/v3` is
 * whatever the last person left behind, and a spec that asserts "twelve cards
 * then three" against a database it did not fill is a spec that passes on one
 * machine.
 *
 * Every name carries a `crypto.randomUUID()` so a run cannot collide with a
 * leftover of the run before it, and so the category buttons this spec clicks
 * are unambiguous among whatever else is in there.
 *
 * `withBusyRetry` for the same reason `seedUser.ts` uses it: this opens a
 * second Payload instance against the file the dev server already holds, and
 * SQLite answers the second writer with `SQLITE_BUSY` rather than queuing.
 */
export async function seedGestureFixtures(): Promise<GestureFixtures> {
  const payload = await getPayload({ config });
  const run = crypto.randomUUID().slice(0, 8);

  const bigCategoryName = `E2E groot ${run}`;
  const smallCategoryName = `E2E klein ${run}`;

  const big = await withBusyRetry("create the big e2e category", () =>
    payload.create({
      collection: "categories",
      data: { isActive: true, name: bigCategoryName },
      locale: "nl",
    })
  );

  const small = await withBusyRetry("create the small e2e category", () =>
    payload.create({
      collection: "categories",
      data: { isActive: true, name: smallCategoryName },
      locale: "nl",
    })
  );

  for (let index = 0; index < BIG_COUNT; index++) {
    await withBusyRetry(`create e2e gesture ${index}`, () =>
      payload.create({
        collection: "gestures",
        data: {
          categories: index < SMALL_COUNT ? [big.id, small.id] : [big.id],
          isActive: true,
          // Zero-padded and prefixed, so the alphabetical sort the page uses
          // makes the page boundary predictable.
          name: `E2E ${run} gebaar ${String(index).padStart(2, "0")}`,
          playbackId: `e2e-${run}-${index}`,
        },
        locale: "nl",
      })
    );
  }

  return {
    bigCategoryId: String(big.id),
    bigCategoryName,
    bigCount: BIG_COUNT,
    run,
    smallCategoryId: String(small.id),
    smallCategoryName,
    smallCount: SMALL_COUNT,
  };
}

/** Removes everything `seedGestureFixtures` created, gestures first. */
export async function cleanupGestureFixtures(
  fixtures: GestureFixtures
): Promise<void> {
  const payload = await getPayload({ config });

  await withBusyRetry("delete the e2e gestures", () =>
    payload.delete({
      collection: "gestures",
      where: { playbackId: { like: `e2e-${fixtures.run}-` } },
    })
  );

  await withBusyRetry("delete the e2e categories", () =>
    payload.delete({
      collection: "categories",
      where: {
        id: { in: [fixtures.bigCategoryId, fixtures.smallCategoryId] },
      },
    })
  );
}
