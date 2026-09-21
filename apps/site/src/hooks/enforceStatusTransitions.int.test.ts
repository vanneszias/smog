// @vitest-environment node
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";

/*
 * Every fixture value that lands on a `unique` column carries this, because
 * the local D1 under `.wrangler/state/vitest` is never cleared between runs
 * and a collision throws inside `beforeAll` — which Vitest reports as
 * *skipped* rather than failed, so the file looks green having tested
 * nothing.
 */
const RUN = crypto.randomUUID();

const PASSWORD = "correct-horse-battery-staple";
const DAY = 24 * 60 * 60 * 1000;

type Status =
  | "active"
  | "cancelled"
  | "expired"
  | "pending_approval"
  | "pending_payment"
  | "pending_resubmission"
  | "rejected";

describe("enforceStatusTransitions, through the collection it is registered on", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let categoryId: number;
  let gestureId: number;
  let adminId: number;

  /** A fresh sponsorship sitting in `status`. Create is not a transition. */
  const seed = async (label: string, status: Status): Promise<number> => {
    const now = Date.now();
    const row = await payload.create({
      collection: "sponsorships",
      data: {
        contactFullName: "Jan Janssens",
        durationYears: 1,
        endDate: new Date(now + 365 * DAY).toISOString(),
        gesture: gestureId,
        originalVideoPlaybackId: `orig-${RUN}-${label}`,
        overlayText: `Met dank aan ${label}`,
        paymentAmount: 4900,
        sponsorEmail: `sponsor-${label}-${RUN}@example.com`,
        sponsorName: `Acme ${label}`,
        startDate: new Date(now).toISOString(),
        status,
      },
    });

    return row.id;
  };

  const adminUser = () =>
    ({ collection: "users", id: adminId, role: "admin" }) as never;

  beforeAll(async () => {
    payload = await getPayload({ config });

    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Transitions ${RUN}` },
      locale: "nl",
    });
    categoryId = category.id;

    const gesture = await payload.create({
      collection: "gestures",
      data: {
        categories: [categoryId],
        isActive: true,
        name: `Overgang ${RUN}`,
        playbackId: `pb-transitions-${RUN}`,
      },
      locale: "nl",
    });
    gestureId = gesture.id;

    const admin = await payload.create({
      collection: "users",
      data: {
        email: `transitions-admin-${RUN}@example.com`,
        password: PASSWORD,
        role: "admin",
      },
    });
    adminId = admin.id;
  });

  it("boots with the fixtures this file assumes", () => {
    // `beforeAll` throwing is reported as *skipped*, not failed, so a run
    // that seeded nothing looks green. This turns that into a named failure.
    expect(categoryId).toBeGreaterThan(0);
    expect(gestureId).toBeGreaterThan(0);
    expect(adminId).toBeGreaterThan(0);
  });

  it("refuses active -> pending_payment through the local API", async () => {
    const id = await seed("refused", "active");

    await expect(
      payload.update({
        collection: "sponsorships",
        data: { status: "pending_payment" },
        id,
        overrideAccess: false,
        user: adminUser(),
      })
    ).rejects.toThrow(/cannot go from active to pending_payment/);

    // The negative on its own proves nothing — an update that refused
    // *everything* would pass it. Read the row back and see it unmoved.
    const after = await payload.findByID({
      collection: "sponsorships",
      id,
      depth: 0,
    });

    expect(after.status).toBe("active");
  });

  it("allows pending_payment -> pending_approval", async () => {
    const id = await seed("advanced", "pending_payment");

    const updated = await payload.update({
      collection: "sponsorships",
      data: { status: "pending_approval" },
      id,
      overrideAccess: false,
      user: adminUser(),
    });

    expect(updated.status).toBe("pending_approval");
  });

  it("allows an update that does not touch status", async () => {
    const id = await seed("renamed", "active");

    const updated = await payload.update({
      collection: "sponsorships",
      data: { sponsorName: `Acme Renamed ${RUN}` },
      id,
      overrideAccess: false,
      user: adminUser(),
    });

    expect(updated.sponsorName).toBe(`Acme Renamed ${RUN}`);
    expect(updated.status).toBe("active");
  });

  it("allows an update that re-submits the status it already has", async () => {
    // The admin panel posts the whole document back, `status` included, so
    // a table without a self-edge would refuse every edit made from it.
    const id = await seed("resubmitted-same", "active");

    const updated = await payload.update({
      collection: "sponsorships",
      data: { sponsorName: `Acme Same ${RUN}`, status: "active" },
      id,
      overrideAccess: false,
      user: adminUser(),
    });

    expect(updated.sponsorName).toBe(`Acme Same ${RUN}`);
    expect(updated.status).toBe("active");
  });

  it("refuses the illegal move even with overrideAccess", async () => {
    // The hook is the policy, not the access layer. Every writer in this
    // stage runs with `overrideAccess: true` — the webhook, the admin-log
    // hook, the re-edit endpoint — so a guard that access could bypass
    // would be a guard nothing in this stage is subject to.
    const id = await seed("override", "active");

    await expect(
      payload.update({
        collection: "sponsorships",
        data: { status: "pending_payment" },
        id,
        overrideAccess: true,
      })
    ).rejects.toThrow(/cannot go from active to pending_payment/);

    const after = await payload.findByID({
      collection: "sponsorships",
      id,
      depth: 0,
    });

    expect(after.status).toBe("active");

    // And the same call with a legal move goes through, so the assertion
    // above is about the transition and not about `overrideAccess: true`
    // being broken.
    const legal = await payload.update({
      collection: "sponsorships",
      data: { status: "expired" },
      id,
      overrideAccess: true,
    });

    expect(legal.status).toBe("expired");
  });

  it("names both statuses in the error, so an admin can see what it refused", async () => {
    const id = await seed("named", "expired");

    let message = "";
    try {
      await payload.update({
        collection: "sponsorships",
        data: { status: "active" },
        id,
        overrideAccess: true,
      });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("expired");
    expect(message).toContain("active");
    expect(message).toBe("A sponsorship cannot go from expired to active.");
  });

  it("lets a rejected sponsorship be re-opened for resubmission", async () => {
    // Transcribed from the shipped product, which offers "Let Sponsor
    // Re-edit" on a rejected sponsorship — not chosen here. The plan's
    // table called `rejected` terminal; the migration's non-goal is that
    // sponsorship behaviour does not change, so the product wins.
    const id = await seed("reopened", "rejected");

    const updated = await payload.update({
      collection: "sponsorships",
      data: { status: "pending_resubmission" },
      id,
      overrideAccess: true,
    });

    expect(updated.status).toBe("pending_resubmission");

    // The only edge out, though: it cannot be approved straight back.
    const other = await seed("reopened-not-active", "rejected");

    await expect(
      payload.update({
        collection: "sponsorships",
        data: { status: "active" },
        id: other,
        overrideAccess: true,
      })
    ).rejects.toThrow(/cannot go from rejected to active/);
  });

  it("does not refuse a create that starts in a non-default status", async () => {
    // A create is not a transition — there is nothing to transition from —
    // and the field's `options` already bound what a new row may hold.
    // Every other test in this file seeds its fixture this way, so this
    // says out loud what they all depend on.
    const id = await seed("created-active", "active");

    const row = await payload.findByID({
      collection: "sponsorships",
      id,
      depth: 0,
    });

    expect(row.status).toBe("active");
  });
});
