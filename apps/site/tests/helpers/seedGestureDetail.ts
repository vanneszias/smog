import { getPayload } from "payload";
import config from "../../src/payload.config.js";
import { withBusyRetry } from "./d1Retry";

export interface GestureDetailFixtures {
  activeId: string;
  activeName: string;
  activePlaybackId: string;
  categoryName: string;
  expiredId: string;
  expiredOverlayText: string;
  inactiveId: string;
  run: string;
  sponsoredId: string;
  sponsoredOverlayText: string;
  sponsoredPlaybackId: string;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * The four gestures the detail spec needs, plus their sponsorships.
 *
 * Seeded rather than assumed, for the reason `seedGestures.ts` gives: the dev
 * server's D1 at `.wrangler/state/v3` is whatever the last person left
 * behind, and a spec that asserts "this page shows a sponsor credit" against
 * a database it did not fill is a spec that passes on one machine.
 *
 * The expired sponsorship is the important fixture. Its `status` is still
 * `active` and only its `endDate` has passed, which is the row shape a
 * sponsorship has until the expiry job catches up with it — and the one a
 * status-only check would render a paid-for overlay for.
 *
 * No logo image: uploading through the dev server's R2 binding from a second
 * process is a race this spec does not need to take, and the image path is
 * covered against a real upload in `sponsorOverlay.int.test.ts`.
 */
export async function seedGestureDetailFixtures(): Promise<GestureDetailFixtures> {
  const payload = await getPayload({ config });
  const run = crypto.randomUUID().slice(0, 8);
  const now = Date.now();
  const iso = (offset: number) => new Date(now + offset).toISOString();

  const categoryName = `E2E detail ${run}`;

  const category = await withBusyRetry("create the detail e2e category", () =>
    payload.create({
      collection: "categories",
      data: { isActive: true, name: categoryName },
      locale: "nl",
    })
  );

  const createGesture = (label: string, isActive: boolean) =>
    withBusyRetry(`create the ${label} e2e gesture`, () =>
      payload.create({
        collection: "gestures",
        data: {
          categories: [category.id],
          concepts: [`synoniem-${run}`],
          info: `Uitleg voor ${label} ${run}.`,
          isActive,
          name: `E2E detail ${run} ${label}`,
          playbackId: `e2edetail-${run}-${label}`,
        },
        locale: "nl",
      })
    );

  const active = await createGesture("actief", true);
  const inactive = await createGesture("inactief", false);
  const sponsored = await createGesture("gesponsord", true);
  const expired = await createGesture("verlopen", true);

  const sponsoredOverlayText = `Met dank aan Acme ${run}`;
  const expiredOverlayText = `Met dank aan Verlopen BV ${run}`;
  const sponsoredPlaybackId = `e2edetail-${run}-sponsorcut`;

  const createSponsorship = (
    label: string,
    data: {
      endDate: string;
      gesture: number;
      overlayText: string;
      sponsoredVideoPlaybackId?: string;
      startDate: string;
    }
  ) =>
    withBusyRetry(`create the ${label} e2e sponsorship`, () =>
      payload.create({
        collection: "sponsorships",
        data: {
          contactFullName: "Jan Janssens",
          durationYears: 1,
          originalVideoPlaybackId: `e2edetail-${run}-${label}-orig`,
          paymentAmount: 500,
          sponsorEmail: `e2e-${label}-${run}@example.com`,
          sponsorName: `Acme ${label} ${run}`,
          status: "active",
          ...data,
        },
      })
    );

  await createSponsorship("actief", {
    endDate: iso(30 * DAY),
    gesture: sponsored.id,
    overlayText: sponsoredOverlayText,
    sponsoredVideoPlaybackId: sponsoredPlaybackId,
    startDate: iso(-30 * DAY),
  });

  await createSponsorship("verlopen", {
    endDate: iso(-DAY),
    gesture: expired.id,
    overlayText: expiredOverlayText,
    startDate: iso(-365 * DAY),
  });

  return {
    activeId: String(active.id),
    activeName: `E2E detail ${run} actief`,
    activePlaybackId: `e2edetail-${run}-actief`,
    categoryName,
    expiredId: String(expired.id),
    expiredOverlayText,
    inactiveId: String(inactive.id),
    run,
    sponsoredId: String(sponsored.id),
    sponsoredOverlayText,
    sponsoredPlaybackId,
  };
}

/**
 * Removes everything the seed created, sponsorships first.
 *
 * Order is not tidiness: `blockDeleteWhenSponsored` refuses to delete a
 * gesture a sponsorship still points at, so gestures-first leaves the whole
 * fixture set behind.
 */
export async function cleanupGestureDetailFixtures(
  fixtures: GestureDetailFixtures
): Promise<void> {
  const payload = await getPayload({ config });

  await withBusyRetry("delete the detail e2e sponsorships", () =>
    payload.delete({
      collection: "sponsorships",
      where: {
        originalVideoPlaybackId: { like: `e2edetail-${fixtures.run}-` },
      },
    })
  );

  await withBusyRetry("delete the detail e2e gestures", () =>
    payload.delete({
      collection: "gestures",
      where: { playbackId: { like: `e2edetail-${fixtures.run}-` } },
    })
  );

  await withBusyRetry("delete the detail e2e category", () =>
    payload.delete({
      collection: "categories",
      where: { name: { equals: fixtures.categoryName } },
    })
  );
}
