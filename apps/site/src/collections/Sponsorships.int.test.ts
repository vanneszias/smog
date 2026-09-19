// @vitest-environment node
import type { RequiredDataFromCollectionSlug } from "payload";
import { Forbidden, getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";

/**
 * `isAdmin` is unit-tested against a plain object in `access/index.test.ts`,
 * and `Sponsorships.test.ts` proves the collection references it — but
 * neither shows what a real anonymous or non-admin request actually gets
 * back from a real database, nor that `status` defaults before validation
 * rather than after it. Both need a booted Payload, which is what this file
 * exercises.
 *
 * A sponsorship row carries a sponsor's email, contact name, invoice name
 * and VAT number, so "anonymous cannot read this collection" is a
 * personal-data guarantee, not a tidiness one.
 */
describe("Sponsorships access against a real database", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let gestureId: number;
  let sponsorshipId: number;

  // `crypto.randomUUID()` rather than `Date.now()`: the local D1 directory
  // is persisted between runs and two runs in the same millisecond — or two
  // Vitest workers — would otherwise collide on `users.email`, which is
  // `unique: true`. A collision throws inside `beforeAll`, which skips every
  // test in the file without failing any of them individually.
  const runId = crypto.randomUUID();

  const admin = { id: 1, role: "admin", collection: "users" };
  const regularUser = { id: 2, role: "user", collection: "users" };

  type SponsorshipData = RequiredDataFromCollectionSlug<"sponsorships">;

  /**
   * Deliberately omits `status` and `durationYears`, the two fields whose
   * defaults this file is partly about.
   *
   * The cast is load-bearing and narrow: Payload's generated create type
   * marks every `required` field required regardless of whether it has a
   * `defaultValue`, so the exact request the default exists to serve — one
   * that sends neither — does not typecheck without it. Callers that do
   * care about the value pass it through `overrides`, still type-checked.
   */
  const sponsorshipData = (
    overrides: Partial<SponsorshipData> = {}
  ): SponsorshipData =>
    ({
      gesture: gestureId,
      sponsorName: "Acme NV",
      sponsorEmail: `sponsor-${runId}@example.com`,
      contactFullName: "Jan Janssens",
      overlayText: "Met dank aan Acme",
      originalVideoPlaybackId: `pb-original-${runId}`,
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: "2027-01-01T00:00:00.000Z",
      paymentAmount: 500,
      ...overrides,
    }) as SponsorshipData;

  beforeAll(async () => {
    payload = await getPayload({ config });

    const category = await payload.create({
      collection: "categories",
      data: { name: `Sponsorship ${runId}`, isActive: true },
    });

    const gesture = await payload.create({
      collection: "gestures",
      data: {
        name: `Gesponsord gebaar ${runId}`,
        categories: [category.id],
        playbackId: `pb-sponsored-${runId}`,
        isActive: true,
      },
    });
    gestureId = gesture.id;

    const sponsorship = await payload.create({
      collection: "sponsorships",
      // An explicit status, so that the access fixtures here do not depend
      // on `status`'s default — otherwise breaking the default would fail
      // this `beforeAll` and *skip* every test in the file rather than
      // failing the one test that is actually about the default.
      data: sponsorshipData({ status: "active" }),
    });
    sponsorshipId = sponsorship.id;
  });

  it("denies an anonymous read outright", async () => {
    await expect(
      payload.find({
        collection: "sponsorships",
        overrideAccess: false,
        user: undefined,
        where: { id: { equals: sponsorshipId } },
      })
    ).rejects.toBeInstanceOf(Forbidden);
  });

  it("denies a signed-in non-admin read", async () => {
    await expect(
      payload.find({
        collection: "sponsorships",
        overrideAccess: false,
        user: regularUser as never,
        where: { id: { equals: sponsorshipId } },
      })
    ).rejects.toBeInstanceOf(Forbidden);
  });

  it("lets an admin read the sponsorship", async () => {
    const result = await payload.find({
      collection: "sponsorships",
      overrideAccess: false,
      user: admin as never,
      where: { id: { equals: sponsorshipId } },
    });

    expect(result.docs).toHaveLength(1);
    expect(result.docs[0]?.sponsorEmail).toBe(`sponsor-${runId}@example.com`);
  });

  it("denies a signed-in non-admin creating a sponsorship", async () => {
    await expect(
      payload.create({
        collection: "sponsorships",
        overrideAccess: false,
        user: regularUser as never,
        data: sponsorshipData({ sponsorName: "Zelfbediening BV" }),
      })
    ).rejects.toBeInstanceOf(Forbidden);
  });

  it("denies a signed-in non-admin deleting a sponsorship", async () => {
    await expect(
      payload.delete({
        collection: "sponsorships",
        id: sponsorshipId,
        overrideAccess: false,
        user: regularUser as never,
      })
    ).rejects.toBeInstanceOf(Forbidden);

    const survivor = await payload.findByID({
      collection: "sponsorships",
      id: sponsorshipId,
      overrideAccess: true,
    });
    expect(survivor.id).toBe(sponsorshipId);
  });

  it("denies a signed-in non-admin updating a sponsorship, leaving the row untouched", async () => {
    // The most dangerous operation on the collection that carries money:
    // `status`, `paymentAmount` and the playback IDs all live behind this
    // one access rule. The config-shape test in `Sponsorships.test.ts` pins
    // the reference; this pins what a real request gets, and — the part a
    // thrown-error assertion alone would miss — that nothing was written on
    // the way to being refused.
    await expect(
      payload.update({
        collection: "sponsorships",
        id: sponsorshipId,
        overrideAccess: false,
        user: regularUser as never,
        data: {
          status: "active",
          paymentAmount: 1,
          sponsoredVideoPlaybackId: `pb-hijacked-${runId}`,
        },
      })
    ).rejects.toBeInstanceOf(Forbidden);

    const after = await payload.findByID({
      collection: "sponsorships",
      id: sponsorshipId,
      overrideAccess: true,
    });

    expect(after.status).toBe("active");
    expect(after.paymentAmount).toBe(500);
    expect(after.sponsoredVideoPlaybackId).toBeFalsy();
  });

  it("denies an anonymous update too", async () => {
    await expect(
      payload.update({
        collection: "sponsorships",
        id: sponsorshipId,
        overrideAccess: false,
        user: undefined,
        data: { status: "cancelled" },
      })
    ).rejects.toBeInstanceOf(Forbidden);

    const after = await payload.findByID({
      collection: "sponsorships",
      id: sponsorshipId,
      overrideAccess: true,
    });
    expect(after.status).toBe("active");
  });

  it("refuses a second sponsorship carrying the same reEditToken", async () => {
    // `reEditToken` is a bearer credential: whoever holds it edits the
    // sponsorship it names. If two rows could share one, the holder reaches
    // someone else's record. An index makes a collision fast to find; only
    // `unique` makes it impossible.
    const reEditToken = `re-edit-${runId}`;

    await payload.create({
      collection: "sponsorships",
      data: sponsorshipData({ status: "active", reEditToken }),
    });

    await expect(
      payload.create({
        collection: "sponsorships",
        data: sponsorshipData({
          status: "active",
          reEditToken,
          sponsorName: "Token-botsing BV",
        }),
      })
    ).rejects.toThrow();

    const rows = await payload.find({
      collection: "sponsorships",
      overrideAccess: true,
      where: { reEditToken: { equals: reEditToken } },
    });
    expect(rows.docs).toHaveLength(1);
  });

  it("refuses a second sponsorship carrying the same molliePaymentId", async () => {
    // The Mollie webhook looks a sponsorship up by this id. A duplicate
    // means the webhook marks the wrong row paid — money applied to
    // someone else's sponsorship.
    const molliePaymentId = `tr_${runId.replaceAll("-", "")}`;

    await payload.create({
      collection: "sponsorships",
      data: sponsorshipData({ status: "active", molliePaymentId }),
    });

    await expect(
      payload.create({
        collection: "sponsorships",
        data: sponsorshipData({
          status: "active",
          molliePaymentId,
          sponsorName: "Betaling-botsing BV",
        }),
      })
    ).rejects.toThrow();

    const rows = await payload.find({
      collection: "sponsorships",
      overrideAccess: true,
      where: { molliePaymentId: { equals: molliePaymentId } },
    });
    expect(rows.docs).toHaveLength(1);
  });

  it("still allows many sponsorships with no token and no payment id, since NULLs do not collide", async () => {
    // Both columns stay nullable. SQLite permits any number of NULLs under
    // a unique index, so making them unique must not force a value onto the
    // rows that legitimately have neither — which is every sponsorship
    // before the Mollie flow runs.
    const first = await payload.create({
      collection: "sponsorships",
      data: sponsorshipData({ status: "active", sponsorName: "Leeg een" }),
    });
    const second = await payload.create({
      collection: "sponsorships",
      data: sponsorshipData({ status: "active", sponsorName: "Leeg twee" }),
    });

    expect(first.reEditToken).toBeFalsy();
    expect(second.molliePaymentId).toBeFalsy();
    expect(second.id).not.toBe(first.id);
  });

  it("starts a sponsorship at pending_payment when no status is sent", async () => {
    // `status` is both `required` and defaulted. If the default were ever
    // dropped, this create would fail validation rather than quietly
    // storing the wrong value — either way the sponsor flow would begin in
    // the wrong state, before any money has moved.
    const created = await payload.create({
      collection: "sponsorships",
      data: sponsorshipData({ sponsorName: "Standaardstatus BV" }),
    });

    expect(created.status).toBe("pending_payment");
    expect(created.durationYears).toBe(1);
    expect(created.hasLogo).toBe(false);
    expect(created.invoiceRequested).toBe(false);
  });
});
