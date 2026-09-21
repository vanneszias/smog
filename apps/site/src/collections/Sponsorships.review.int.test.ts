// @vitest-environment node
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";

/**
 * @fileoverview Admin review, against a real database.
 *
 * The Payload panel already renders this collection, so Task 9 is the
 * transitions rather than a screen: approve, reject with a reason, ask for
 * a resubmission. Everything asserted here is a claim about what the database
 * ends up holding after a write, because the guard under test is a
 * `beforeChange` hook and a unit test of it would assert the shape of an
 * object this app never builds.
 *
 * **Why the guards are a hook rather than the field access the plan named.**
 * `sponsorships.update` is `isAdmin` at the document level, and the writers
 * that get past it — the Mollie webhook, the re-edit endpoint — all run
 * `overrideAccess: true`, which skips field access as well. So
 * `access.update: isAdminField` on `reviewedBy` would be unreachable from
 * both directions at once, and every mutation of it would survive. See
 * `hooks/stampReviewDecision.ts`.
 */

/*
 * Unique per run: `.wrangler/state/vitest` is never cleared between runs, and
 * a collision on a unique column throws inside `beforeAll` — which Vitest
 * reports as *skipped* rather than failed, i.e. a green run that asserted
 * nothing.
 */
const RUN = crypto.randomUUID();

const DAY = 24 * 60 * 60 * 1000;
const PASSWORD = "correct-horse-battery-staple";

type Payload = Awaited<ReturnType<typeof getPayload>>;

describe("reviewing a sponsorship", () => {
  let payload: Payload;
  let gestureId: number;
  let adminId: number;
  let otherAdminId: number;
  let userId: number;

  const admin = () =>
    ({ collection: "users", id: adminId, role: "admin" }) as const;

  const sponsor = async (overrides: Record<string, unknown> = {}) =>
    await payload.create({
      collection: "sponsorships",
      data: {
        contactFullName: `Jan Janssens ${RUN}`,
        durationYears: 1,
        endDate: new Date(Date.now() + 300 * DAY).toISOString(),
        gesture: gestureId,
        originalVideoPlaybackId: `pb-review-${RUN}`,
        overlayText: `Met dank aan Acme ${RUN}`,
        paymentAmount: 5000,
        sponsorEmail: `review-${crypto.randomUUID()}@example.com`,
        sponsorName: `Acme ${RUN}`,
        startDate: new Date().toISOString(),
        status: "pending_approval",
        ...overrides,
      },
      overrideAccess: true,
    });

  /** The row as the database holds it, hidden columns and all. */
  const read = async (id: number) =>
    await payload.findByID({
      collection: "sponsorships",
      depth: 0,
      id,
      overrideAccess: true,
      showHiddenFields: true,
    });

  beforeAll(async () => {
    payload = await getPayload({ config });

    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Nakijken ${RUN}` },
      locale: "nl",
    });

    const gesture = await payload.create({
      collection: "gestures",
      data: {
        categories: [category.id],
        isActive: true,
        name: `Nakijken ${RUN}`,
        playbackId: `pb-review-${RUN}`,
      },
      locale: "nl",
    });
    gestureId = gesture.id;

    const reviewer = await payload.create({
      collection: "users",
      data: {
        email: `review-admin-${RUN}@example.com`,
        password: PASSWORD,
        role: "admin",
      },
    });
    adminId = reviewer.id;

    const second = await payload.create({
      collection: "users",
      data: {
        email: `review-admin-2-${RUN}@example.com`,
        password: PASSWORD,
        role: "admin",
      },
    });
    otherAdminId = second.id;

    const ordinary = await payload.create({
      collection: "users",
      data: {
        email: `review-user-${RUN}@example.com`,
        password: PASSWORD,
        role: "user",
      },
    });
    userId = ordinary.id;
  });

  it("boots with the fixtures this file assumes", async () => {
    // `beforeAll` throwing is reported as *skipped*, not failed, so a run
    // that seeded nothing would look green.
    const row = await sponsor();

    expect(row.status).toBe("pending_approval");
    expect(row.reviewedBy ?? null).toBeNull();
    expect(row.reviewedAt ?? null).toBeNull();
  });

  describe("approving", () => {
    it("stamps reviewedBy and reviewedAt when an admin approves", async () => {
      const row = await sponsor();
      const before = Date.now();

      await payload.update({
        collection: "sponsorships",
        data: { status: "active" },
        id: row.id,
        overrideAccess: false,
        user: admin(),
      });

      const after = await read(row.id);

      expect(after.status).toBe("active");
      expect(after.reviewedBy).toBe(adminId);
      expect(new Date(after.reviewedAt ?? 0).getTime()).toBeGreaterThanOrEqual(
        before
      );
    });

    it("does not require a rejection reason when approving", async () => {
      const row = await sponsor();

      await expect(
        payload.update({
          collection: "sponsorships",
          data: { status: "active" },
          id: row.id,
          overrideAccess: false,
          user: admin(),
        })
      ).resolves.toMatchObject({ status: "active" });
    });

    it("stamps the admin who actually approved, not the one the form named", async () => {
      // `reviewedBy` is a fact about the request. A posted one is a claim,
      // and the panel is not the only thing that can post.
      const row = await sponsor();

      await payload.update({
        collection: "sponsorships",
        data: { reviewedBy: otherAdminId, status: "active" },
        id: row.id,
        overrideAccess: false,
        user: admin(),
      });

      expect((await read(row.id)).reviewedBy).toBe(adminId);
    });
  });

  describe("rejecting", () => {
    it("requires a rejection reason when rejecting", async () => {
      // A rejected sponsor is owed a sentence, and this is the only place it
      // can be required: the panel's own `required` is per field and not per
      // transition, so a required `rejectionReason` would make every
      // approval unsaveable instead.
      const row = await sponsor();

      await expect(
        payload.update({
          collection: "sponsorships",
          data: { status: "rejected" },
          id: row.id,
          overrideAccess: false,
          user: admin(),
        })
      ).rejects.toThrow(/needs a reason/);

      expect((await read(row.id)).status).toBe("pending_approval");
    });

    it("refuses a rejection reason that is only whitespace", async () => {
      const row = await sponsor();

      await expect(
        payload.update({
          collection: "sponsorships",
          data: { rejectionReason: "   ", status: "rejected" },
          id: row.id,
          overrideAccess: false,
          user: admin(),
        })
      ).rejects.toThrow(/needs a reason/);
    });

    it("accepts the same rejection once it carries a reason", async () => {
      // The positive case beside the two refusals: the same transition, the
      // same user, the same row, and the only difference is the sentence.
      const row = await sponsor();

      await payload.update({
        collection: "sponsorships",
        data: {
          rejectionReason: "Het logo is onleesbaar op een zwarte achtergrond.",
          status: "rejected",
        },
        id: row.id,
        overrideAccess: false,
        user: admin(),
      });

      const after = await read(row.id);

      expect(after.status).toBe("rejected");
      expect(after.reviewedBy).toBe(adminId);
      expect(after.reviewedAt).not.toBeNull();
    });

    it("keeps the reason a sponsorship already carries when it is rejected again", async () => {
      // `data` is the merged document, so a second rejection inherits the
      // first one's sentence rather than being refused for not repeating it.
      const row = await sponsor({
        rejectionReason: "Te weinig contrast.",
        status: "rejected",
      });

      await payload.update({
        collection: "sponsorships",
        data: { status: "pending_resubmission" },
        id: row.id,
        overrideAccess: false,
        user: admin(),
      });

      await payload.update({
        collection: "sponsorships",
        data: { status: "pending_approval" },
        id: row.id,
        overrideAccess: true,
      });

      await expect(
        payload.update({
          collection: "sponsorships",
          data: { status: "rejected" },
          id: row.id,
          overrideAccess: false,
          user: admin(),
        })
      ).resolves.toMatchObject({ status: "rejected" });
    });
  });

  describe("who may stamp a review", () => {
    it("refuses a non-admin setting reviewedBy", async () => {
      // The shape a future endpoint has: a server-side write with
      // `overrideAccess: true`, which is past both the document access rule
      // and the field pass, carrying a `reviewedBy` from a form.
      const row = await sponsor();

      await payload.update({
        collection: "sponsorships",
        data: { reviewedBy: adminId, sponsorName: `Acme herwerkt ${RUN}` },
        id: row.id,
        overrideAccess: true,
        user: { collection: "users", id: userId, role: "user" },
      });

      const after = await read(row.id);

      // The positive half beside the negative one: the request went through
      // and its legitimate change landed, so the absence below is the guard
      // rather than a write that never happened.
      expect(after.sponsorName).toBe(`Acme herwerkt ${RUN}`);
      expect(after.reviewedBy ?? null).toBeNull();
    });

    it("refuses an anonymous write setting reviewedAt", async () => {
      const row = await sponsor();

      await payload.update({
        collection: "sponsorships",
        data: {
          overlayText: `Herwerkt ${RUN}`,
          reviewedAt: new Date().toISOString(),
        },
        id: row.id,
        overrideAccess: true,
      });

      const after = await read(row.id);

      expect(after.overlayText).toBe(`Herwerkt ${RUN}`);
      expect(after.reviewedAt ?? null).toBeNull();
    });

    it("does not wipe an existing stamp when the sponsor re-edits", async () => {
      // The restore puts the *stored* values back, not nulls. A sponsorship
      // that has been through the queue once keeps the record of it.
      const row = await sponsor();

      await payload.update({
        collection: "sponsorships",
        data: { rejectionReason: "Onleesbaar.", status: "rejected" },
        id: row.id,
        overrideAccess: false,
        user: admin(),
      });

      await payload.update({
        collection: "sponsorships",
        data: { sponsorName: `Acme opnieuw ${RUN}` },
        id: row.id,
        overrideAccess: true,
      });

      expect((await read(row.id)).reviewedBy).toBe(adminId);
    });

    it("lets an admin correct the stamp by hand", async () => {
      // The other side of the same branch, and the reason it tests
      // `req.user?.role` rather than refusing everybody: fixing the record in
      // the panel is a legitimate thing for an administrator to do, and
      // nothing else can.
      const row = await sponsor();

      await payload.update({
        collection: "sponsorships",
        data: { reviewedBy: otherAdminId },
        id: row.id,
        overrideAccess: false,
        user: admin(),
      });

      expect((await read(row.id)).reviewedBy).toBe(otherAdminId);
    });

    it("refuses a re-edit token holder approving their own sponsorship", async () => {
      const token = crypto.randomUUID();
      const row = await sponsor({
        reEditToken: token,
        reEditTokenExpiresAt: new Date(Date.now() + 7 * DAY).toISOString(),
        status: "pending_resubmission",
      });

      await expect(
        payload.update({
          collection: "sponsorships",
          data: { reviewedBy: adminId, status: "active" },
          id: row.id,
          overrideAccess: false,
          req: { searchParams: new URLSearchParams({ reEditToken: token }) },
        })
      ).rejects.toThrow();

      const after = await read(row.id);

      expect(after.status).toBe("pending_resubmission");
      expect(after.reviewedBy ?? null).toBeNull();
    });
  });

  describe("what is not a review decision", () => {
    it("does not stamp a reviewer when the webhook advances a payment", async () => {
      // `pending_payment -> pending_approval` is the Mollie webhook putting a
      // paid sponsorship in the queue. Stamping it would put a reviewer on
      // every sponsorship before anybody had looked at one.
      const row = await sponsor({ status: "pending_payment" });

      await payload.update({
        collection: "sponsorships",
        data: { status: "pending_approval" },
        id: row.id,
        overrideAccess: true,
      });

      expect((await read(row.id)).reviewedBy ?? null).toBeNull();
    });

    it("does not stamp a reviewer when an admin asks for a resubmission", async () => {
      // Transcribed from the shipped product: `setReEditToken` writes no
      // `reviewedBy` and no `reviewedAt`, where `approve` and `reject` both
      // do. Asking for changes is not yet a verdict.
      const row = await sponsor();

      await payload.update({
        collection: "sponsorships",
        data: { status: "pending_resubmission" },
        id: row.id,
        overrideAccess: false,
        user: admin(),
      });

      const after = await read(row.id);

      expect(after.status).toBe("pending_resubmission");
      expect(after.reviewedBy ?? null).toBeNull();
    });

    it("does not stamp a reviewer on an edit that changes no status", async () => {
      const row = await sponsor();

      await payload.update({
        collection: "sponsorships",
        data: { sponsorName: `Acme hernoemd ${RUN}` },
        id: row.id,
        overrideAccess: false,
        user: admin(),
      });

      expect((await read(row.id)).reviewedBy ?? null).toBeNull();
    });
  });

  it("files the approval in admin-logs like every other transition", async () => {
    // Task 5's hook gets this for free, and the assertion is here so that a
    // second logger added for review decisions would show up as a duplicate.
    const row = await sponsor();

    await payload.update({
      collection: "sponsorships",
      data: { status: "active" },
      id: row.id,
      overrideAccess: false,
      user: admin(),
    });

    const { docs } = await payload.find({
      collection: "admin-logs",
      overrideAccess: true,
      where: {
        and: [
          { action: { equals: "sponsorship.status_changed" } },
          { targetId: { equals: String(row.id) } },
        ],
      },
    });

    expect(docs).toHaveLength(1);
    expect(docs[0]?.metadata).toEqual({
      from: "pending_approval",
      to: "active",
    });
  });
});
