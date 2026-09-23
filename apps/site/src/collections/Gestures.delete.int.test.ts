// @vitest-environment node
import type { RequiredDataFromCollectionSlug } from "payload";
import { getPayload, NotFound } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";

/**
 * The half of the referential-integrity rules that belongs to
 * `sponsorships.gesture`: deleting a sponsored gesture must be refused, and
 * refused legibly.
 *
 * Every assertion here goes through a real delete against a real database.
 * Payload emits `sponsorships.gesture` as `NOT NULL` with
 * `ON DELETE set null`, a pair SQLite cannot satisfy, so before the hook the
 * delete already failed — with `Failed query: delete from "gestures" where
 * "gestures"."id" = ?`, which names nothing an admin can act on. A test that
 * only asserted `.rejects.toThrow()` would therefore have passed against the
 * bug. The message assertions below are the test.
 */
describe("deleting a gesture a sponsorship points at", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let categoryId: number;

  // `crypto.randomUUID()` rather than `Date.now()` — the local D1 directory
  // is persisted between runs, and `sponsorships.reEditToken` /
  // `molliePaymentId` are unique. See apps/site/README.md.
  const runId = crypto.randomUUID();

  type SponsorshipData = RequiredDataFromCollectionSlug<"sponsorships">;

  const createGesture = async (label: string): Promise<{ id: number }> =>
    await payload.create({
      collection: "gestures",
      data: {
        name: `${label} ${runId}`,
        categories: [categoryId],
        playbackId: `pb-${label}-${runId}`,
        isActive: true,
      },
    });

  const createSponsorship = async (
    gestureId: number,
    overrides: Partial<SponsorshipData> = {}
  ) =>
    await payload.create({
      collection: "sponsorships",
      data: {
        gesture: gestureId,
        sponsorName: "Acme NV",
        sponsorEmail: `sponsor-${runId}@example.com`,
        contactFullName: "Jan Janssens",
        overlayText: "Met dank aan Acme",
        originalVideoPlaybackId: `pb-original-${runId}`,
        status: "active",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2027-01-01T00:00:00.000Z",
        durationYears: 1,
        paymentAmount: 500,
        ...overrides,
      } as SponsorshipData,
    });

  beforeAll(async () => {
    payload = await getPayload({ config });

    const category = await payload.create({
      collection: "categories",
      data: { name: `Gesture delete ${runId}`, isActive: true },
    });
    categoryId = category.id;
  });

  it("refuses the delete and names the sponsorship that blocks it", async () => {
    const gesture = await createGesture("gesponsord");
    const sponsorship = await createSponsorship(gesture.id, {
      sponsorName: `Acme NV ${runId}`,
    });

    const rejection = await payload
      .delete({ collection: "gestures", id: gesture.id })
      .then(
        () => undefined,
        (error: unknown) => error as Error
      );

    expect(rejection).toBeInstanceOf(Error);
    const message = rejection?.message ?? "";

    // A count, so the admin knows the size of the job.
    expect(message).toContain("1 sponsorship references it");
    // The row id, so they can open it.
    expect(message).toContain(`#${sponsorship.id}`);
    // The sponsor, so they recognise it without opening it.
    expect(message).toContain(`Acme NV ${runId}`);
    // The status and end date, so they know whether it is live and whether
    // waiting for expiry is an option.
    expect(message).toContain("active");
    expect(message).toContain(String(sponsorship.endDate).slice(0, 10));
    // And no raw SQL, which is what the admin used to get.
    expect(message).not.toContain("Failed query");
  });

  it("leaves the gesture and the sponsorship in place after refusing", async () => {
    const gesture = await createGesture("intact");
    const sponsorship = await createSponsorship(gesture.id);

    await expect(
      payload.delete({ collection: "gestures", id: gesture.id })
    ).rejects.toThrow();

    const survivingGesture = await payload.findByID({
      collection: "gestures",
      id: gesture.id,
      overrideAccess: true,
    });
    expect(survivingGesture.id).toBe(gesture.id);

    const survivingSponsorship = await payload.findByID({
      collection: "sponsorships",
      id: sponsorship.id,
      depth: 0,
      overrideAccess: true,
    });
    expect(survivingSponsorship.gesture).toBe(gesture.id);
  });

  it("names every blocking sponsorship, not just the first", async () => {
    const gesture = await createGesture("tweevoudig");
    const first = await createSponsorship(gesture.id, {
      sponsorName: `First Sponsor ${runId}`,
    });
    const second = await createSponsorship(gesture.id, {
      sponsorName: `Second Sponsor ${runId}`,
      status: "expired",
    });

    const rejection = await payload
      .delete({ collection: "gestures", id: gesture.id })
      .then(
        () => undefined,
        (error: unknown) => error as Error
      );

    const message = rejection?.message ?? "";
    expect(message).toContain("2 sponsorships reference it");
    expect(message).toContain(`First Sponsor ${runId}`);
    expect(message).toContain(`Second Sponsor ${runId}`);
    expect(message).toContain(`#${first.id}`);
    expect(message).toContain(`#${second.id}`);
  });

  it("surfaces the same message through a bulk delete, which the list view uses", async () => {
    // The bulk path does not rethrow: it collects `{ id, isPublic, message }`
    // per document and only shows the message when the error is public
    // (`collections/operations/delete.js`, 3.89.0). A plain `Error` would be
    // swallowed into "Something went wrong" here, so this covers the
    // `APIError` status/isPublic choice specifically.
    const gesture = await createGesture("bulk");
    await createSponsorship(gesture.id, {
      sponsorName: `Bulk Sponsor ${runId}`,
    });

    const result = await payload.delete({
      collection: "gestures",
      where: { id: { equals: gesture.id } },
    });

    expect(result.docs).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain(`Bulk Sponsor ${runId}`);
    expect(result.errors[0]?.isPublic).toBe(true);

    const survivor = await payload.findByID({
      collection: "gestures",
      id: gesture.id,
      overrideAccess: true,
    });
    expect(survivor.id).toBe(gesture.id);
  });

  it("still deletes a gesture nothing sponsors", async () => {
    // The control. Without it, a hook that refused every delete would pass
    // every assertion above.
    const gesture = await createGesture("ongesponsord");

    await payload.delete({ collection: "gestures", id: gesture.id });

    await expect(
      payload.findByID({
        collection: "gestures",
        id: gesture.id,
        overrideAccess: true,
      })
    ).rejects.toBeInstanceOf(NotFound);
  });

  it("deletes a gesture again once its last sponsorship is gone", async () => {
    const gesture = await createGesture("vrijgegeven");
    const sponsorship = await createSponsorship(gesture.id);

    await expect(
      payload.delete({ collection: "gestures", id: gesture.id })
    ).rejects.toThrow();

    await payload.delete({ collection: "sponsorships", id: sponsorship.id });
    await payload.delete({ collection: "gestures", id: gesture.id });

    await expect(
      payload.findByID({
        collection: "gestures",
        id: gesture.id,
        overrideAccess: true,
      })
    ).rejects.toBeInstanceOf(NotFound);
  });
});
