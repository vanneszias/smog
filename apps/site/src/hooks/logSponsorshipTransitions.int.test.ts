// @vitest-environment node
import { Forbidden, getPayload } from "payload";
import { beforeAll, describe, expect, it, vi } from "vitest";
import config from "../payload.config";

/*
 * Unique per run: the local D1 under `.wrangler/state/vitest` is never
 * cleared, and a collision on a unique column throws inside `beforeAll` —
 * which Vitest reports as *skipped* rather than failed, so the file looks
 * green having asserted nothing.
 */
const RUN = crypto.randomUUID();

const PASSWORD = "correct-horse-battery-staple";
const DAY = 24 * 60 * 60 * 1000;
const ACTION = "sponsorship.status_changed";

type Status =
  | "active"
  | "cancelled"
  | "expired"
  | "pending_approval"
  | "pending_payment"
  | "pending_resubmission"
  | "rejected";

/**
 * `logSponsorshipTransitions`, through the collection it is registered on and
 * against a real database.
 *
 * There is no unit test beside this one, on purpose. Everything the hook does
 * is a property of the pair it sits between — Payload deciding what
 * `previousDoc` holds, and `admin-logs` refusing every writer that is not
 * going through `overrideAccess`. A hand-built argument object would let both
 * halves be wrong at once and still pass.
 */
describe("logSponsorshipTransitions", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let gestureId: number;
  let adminId: number;

  const seed = async (label: string, status: Status): Promise<number> => {
    const now = Date.now();
    const row = await payload.create({
      collection: "sponsorships",
      data: {
        contactFullName: "Jan Janssens",
        durationYears: 1,
        endDate: new Date(now + 365 * DAY).toISOString(),
        gesture: gestureId,
        originalVideoPlaybackId: `logs-${RUN}-${label}`,
        overlayText: `Met dank aan ${label}`,
        paymentAmount: 5000,
        sponsorEmail: `log-${label}-${RUN}@example.com`,
        sponsorName: `Acme ${label}`,
        startDate: new Date(now).toISOString(),
        status,
      },
    });

    return row.id;
  };

  const adminUser = () =>
    ({ collection: "users", id: adminId, role: "admin" }) as never;

  /** Every log row filed against one sponsorship, oldest first. */
  const logsFor = async (id: number | string) => {
    const { docs } = await payload.find({
      collection: "admin-logs",
      depth: 0,
      limit: 50,
      overrideAccess: true,
      sort: "createdAt",
      where: {
        and: [
          { targetType: { equals: "sponsorships" } },
          { targetId: { equals: String(id) } },
        ],
      },
    });

    return docs;
  };

  beforeAll(async () => {
    payload = await getPayload({ config });

    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Logs ${RUN}` },
      locale: "nl",
    });

    const gesture = await payload.create({
      collection: "gestures",
      data: {
        categories: [category.id],
        isActive: true,
        name: `Logboek ${RUN}`,
        playbackId: `pb-logs-${RUN}`,
      },
      locale: "nl",
    });
    gestureId = gesture.id;

    const admin = await payload.create({
      collection: "users",
      data: {
        email: `logs-admin-${RUN}@example.com`,
        password: PASSWORD,
        role: "admin",
      },
    });
    adminId = admin.id;
  });

  it("boots with the fixtures this file assumes", () => {
    // `beforeAll` throwing is reported as *skipped*, not failed, so a run that
    // seeded nothing would look green. This turns that into a named failure.
    expect(gestureId).toBeGreaterThan(0);
    expect(adminId).toBeGreaterThan(0);
  });

  it("writes a log row when the status changes", async () => {
    const id = await seed("changed", "pending_payment");

    await payload.update({
      collection: "sponsorships",
      data: { status: "pending_approval" },
      id,
      overrideAccess: true,
    });

    const logs = await logsFor(id);

    expect(logs).toHaveLength(1);
    expect(logs[0]?.action).toBe(ACTION);
    expect(logs[0]?.targetType).toBe("sponsorships");
    expect(logs[0]?.targetId).toBe(String(id));
  });

  it("writes nothing when an update leaves the status alone", async () => {
    const id = await seed("renamed", "active");

    await payload.update({
      collection: "sponsorships",
      data: { sponsorName: `Acme Renamed ${RUN}` },
      id,
      overrideAccess: true,
    });

    // And again with `status` explicitly re-submitted at its current value,
    // which is what the admin panel posts on every save: the hook sees a
    // `status` key either way, so "the caller did not send one" is not what
    // distinguishes these.
    await payload.update({
      collection: "sponsorships",
      data: { sponsorName: `Acme Renamed Twice ${RUN}`, status: "active" },
      id,
      overrideAccess: true,
    });

    expect(await logsFor(id)).toHaveLength(0);
  });

  it("writes nothing when a sponsorship is created", async () => {
    // A create is not a transition — there is no status to have moved from.
    // `previousDoc` is `{}` rather than undefined on a create, so without the
    // `operation` test every new row would be born with an
    // `undefined -> pending_payment` entry.
    const id = await seed("born", "pending_payment");

    expect(await logsFor(id)).toHaveLength(0);
  });

  it("records both the old and the new status", async () => {
    const id = await seed("both-ends", "pending_approval");

    await payload.update({
      collection: "sponsorships",
      data: { status: "rejected" },
      id,
      overrideAccess: true,
    });

    const [entry] = await logsFor(id);

    expect(entry?.metadata).toEqual({
      from: "pending_approval",
      to: "rejected",
    });
  });

  it("records a chain of transitions in order, each naming where it came from", async () => {
    // One row is not enough to show that `from` tracks the row rather than
    // being a constant: a hook that always wrote `from: "pending_approval"`
    // passes the test above. Three moves through three different statuses
    // cannot be satisfied by any fixed value.
    const id = await seed("chain", "pending_approval");

    for (const status of [
      "rejected",
      "pending_resubmission",
      "pending_approval",
    ] as const) {
      await payload.update({
        collection: "sponsorships",
        data: { status },
        id,
        overrideAccess: true,
      });
    }

    expect((await logsFor(id)).map((entry) => entry.metadata)).toEqual([
      { from: "pending_approval", to: "rejected" },
      { from: "rejected", to: "pending_resubmission" },
      { from: "pending_resubmission", to: "pending_approval" },
    ]);
  });

  it("records who made the change, and null for the webhook", async () => {
    const byAdmin = await seed("by-admin", "pending_approval");

    await payload.update({
      collection: "sponsorships",
      data: { status: "active" },
      id: byAdmin,
      overrideAccess: false,
      user: adminUser(),
    });

    const [adminEntry] = await logsFor(byAdmin);

    expect(adminEntry?.user).toBe(adminId);

    // The same transition with no session — which is every job and the Mollie
    // webhook, neither of which has a user to blame. The null is the point:
    // `admin-logs.user` is optional precisely so an entry with an unknown
    // actor is still written.
    const byWebhook = await seed("by-webhook", "pending_approval");

    await payload.update({
      collection: "sponsorships",
      data: { status: "active" },
      id: byWebhook,
      overrideAccess: true,
    });

    const [webhookEntry] = await logsFor(byWebhook);

    expect(webhookEntry?.user).toBeNull();
  });

  it("writes through overrideAccess, because admin-logs refuses everyone", async () => {
    // The spec: `admin-logs` is append-only to everyone *including admins*,
    // so a hook going through the local API with `overrideAccess: true` is
    // the only way in. Both halves are asserted, because either alone is
    // satisfied by a broken implementation: the refusal alone passes against
    // a hook that never writes, and the log row alone passes against a
    // collection whose `create` was quietly opened up.
    await expect(
      payload.create({
        collection: "admin-logs",
        data: {
          action: ACTION,
          targetId: "0",
          targetType: "sponsorships",
        },
        overrideAccess: false,
        user: adminUser(),
      })
    ).rejects.toThrow(Forbidden);

    const id = await seed("override", "pending_approval");

    await payload.update({
      collection: "sponsorships",
      data: { status: "active" },
      id,
      overrideAccess: false,
      user: adminUser(),
    });

    expect(await logsFor(id)).toHaveLength(1);
  });

  it("does not fail the transition when the log write fails", async () => {
    // Ordering under no transactions: the sponsorship has already changed by
    // the time an `afterChange` hook runs. Throwing here would report a
    // failure for a write that happened — and for the Mollie webhook that is
    // worse than a missing log line, because Mollie retries every non-2xx.
    const id = await seed("resilient", "pending_payment");

    const create = payload.create.bind(payload);
    const spy = vi
      .spyOn(payload, "create")
      .mockImplementation((args: Parameters<typeof create>[0]) =>
        args.collection === "admin-logs"
          ? Promise.reject(new Error("admin-logs is on fire"))
          : create(args)
      );

    try {
      const updated = await payload.update({
        collection: "sponsorships",
        data: { status: "pending_approval" },
        id,
        overrideAccess: true,
      });

      expect(updated.status).toBe("pending_approval");
    } finally {
      spy.mockRestore();
    }

    // Read the row back through a path the spy never touched: the promise
    // resolving proves the call did not throw, and this proves the write
    // landed rather than being rolled back by something.
    const after = await payload.findByID({
      collection: "sponsorships",
      depth: 0,
      id,
    });

    expect(after.status).toBe("pending_approval");
    // And the negative beside the positive: the log really did fail, so the
    // test above is not passing because the spy missed.
    expect(await logsFor(id)).toHaveLength(0);
  });
});
