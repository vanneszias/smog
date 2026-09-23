// @vitest-environment node
import { getPayload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupStalePayments } from "@/jobs/cleanupStalePayments";
import { CLAIM_KINDS, releaseClaim, takeClaim } from "@/lib/claims";
import { resolveSponsorSelection } from "@/lib/sponsorSelection";
import type { Sponsorship } from "@/payload-types";
import config from "../payload.config";

/*
 * Unique per run: `.wrangler/state/vitest` is persisted and never cleared, so
 * a fixture keyed on a fixed name collides with an earlier run's row. A
 * collision throws inside `beforeAll`, which Vitest reports as *skipped*
 * rather than failed — a file that looks green having asserted nothing.
 */
const RUN = crypto.randomUUID();

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const PRICE = 5000;

/** A moment past the 24-hour window, so a row created now counts as stale. */
const LATER = new Date(Date.now() + 25 * HOUR);

/**
 * `cleanup-stale-payments`, against a real database.
 *
 * **The gap this closes**: a checkout whose Mollie call failed sits in
 * `pending_payment` for ever, and `lib/sponsorSelection.ts` refuses to sell
 * that gesture to anybody else. So every assertion about a cancellation is
 * paired with one about the gesture, through `resolveSponsorSelection` — the
 * same function the wizard's first screen and its checkout both ask — because
 * "the status changed" is not what anybody wanted from this job.
 *
 * **The window is moved rather than the rows.** `createdAt` is Payload's own
 * column and a fixture cannot honestly backdate it, so the tests pass a `now`
 * in the future. That is also why `now` is a parameter of the job at all, for
 * the reason `jobs/expireSponsorships.ts` gives about its own clock: a test
 * should assert a decision rather than race a clock.
 *
 * One consequence worth naming: a sweep is global, so a run with `LATER`
 * cancels every stale `pending_payment` row the persisted database happens to
 * hold, including other files' leftovers. Every assertion below is about this
 * run's own rows and its own gestures, so a neighbour's row can neither
 * satisfy nor fail one.
 */
describe("cleaning up abandoned checkouts", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let categoryId: number;

  const seedGesture = async (label: string): Promise<number> => {
    const gesture = await payload.create({
      collection: "gestures",
      data: {
        categories: [categoryId],
        isActive: true,
        name: `Stale ${label} ${RUN}`,
        playbackId: `pb-stale-${label}-${RUN}`,
      },
      locale: "nl",
    });

    return gesture.id;
  };

  /** One checkout against one gesture nothing else in this file touches. */
  const seedCheckout = async (
    label: string,
    options: {
      molliePaymentId?: string;
      status?: Sponsorship["status"];
    } = {}
  ): Promise<{ gesture: number; id: number }> => {
    const gesture = await seedGesture(label);
    const row = await payload.create({
      collection: "sponsorships",
      data: {
        contactFullName: "Jan Janssens",
        durationYears: 1,
        endDate: new Date(Date.now() + 365 * DAY).toISOString(),
        gesture,
        molliePaymentId: options.molliePaymentId ?? null,
        originalVideoPlaybackId: `pb-stale-${label}-${RUN}`,
        overlayText: `Met dank aan ${label}`,
        paymentAmount: PRICE,
        sponsorEmail: `stale-${label}-${RUN}@example.test`,
        sponsorName: `Acme ${label}`,
        startDate: new Date().toISOString(),
        status: options.status ?? "pending_payment",
      },
    });

    return { gesture, id: row.id };
  };

  const statusOf = async (id: number) =>
    (
      await payload.findByID({
        collection: "sponsorships",
        depth: 0,
        id,
        overrideAccess: true,
      })
    ).status;

  /** Whether the wizard would sell this gesture today. */
  const isBuyable = async (gesture: number) =>
    "gestures" in (await resolveSponsorSelection(payload, [String(gesture)]));

  const claimsFor = async (key: string) => {
    const { totalDocs } = await payload.find({
      collection: "claims",
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { key: { equals: `${CLAIM_KINDS.stalePayment}:${key}` } },
    });

    return totalDocs;
  };

  beforeAll(async () => {
    payload = await getPayload({ config });

    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Stale ${RUN}` },
      locale: "nl",
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    await payload.delete({
      collection: "claims",
      overrideAccess: true,
      where: { kind: { equals: CLAIM_KINDS.stalePayment } },
    });
  });

  it("boots with the fixtures this file assumes", async () => {
    // `beforeAll` throwing is reported as *skipped* rather than failed, so a
    // run that seeded nothing would look green.
    expect(categoryId).toBeGreaterThan(0);

    const { gesture } = await seedCheckout("boot");

    // And the premise of the whole job: a `pending_payment` row is what makes
    // a gesture unsellable. If this were ever false, every assertion below
    // about freeing a gesture would pass without the job doing anything.
    expect(await isBuyable(gesture)).toBe(false);
  });

  it("cancels a pending_payment sponsorship older than the window", async () => {
    const { id } = await seedCheckout("old");

    const report = await cleanupStalePayments(payload, LATER);

    expect(await statusOf(id)).toBe("cancelled");
    expect(report.cancelled).toBeGreaterThanOrEqual(1);
    expect(report.failures).toBe(0);
  });

  it("frees the gesture it was blocking", async () => {
    /*
     * The positive beside the negative, and the reason this job exists. The
     * sponsor of an abandoned checkout is not harmed by the row sitting there;
     * the *next* sponsor is, because `resolveSponsorSelection` refuses to sell
     * a gesture that any `pending_payment` row names.
     */
    const { gesture, id } = await seedCheckout("blocked");

    expect(await isBuyable(gesture)).toBe(false);

    await cleanupStalePayments(payload, LATER);

    expect(await statusOf(id)).toBe("cancelled");
    expect(await isBuyable(gesture)).toBe(true);
  });

  it("leaves a younger one alone", async () => {
    const { gesture, id } = await seedCheckout("young");

    const report = await cleanupStalePayments(payload, new Date());

    expect(await statusOf(id)).toBe("pending_payment");
    expect(await isBuyable(gesture)).toBe(false);
    expect(report.failures).toBe(0);
  });

  it("leaves one alone at the exact instant the window closes", async () => {
    /*
     * The boundary, asserted rather than assumed. A sponsor whose checkout is
     * exactly twenty-four hours old is one second of arithmetic away from
     * being cancelled mid-payment, and `<` versus `<=` is the whole of it.
     */
    const { id } = await seedCheckout("boundary");
    const created = Date.parse(
      (
        await payload.findByID({
          collection: "sponsorships",
          depth: 0,
          id,
          overrideAccess: true,
        })
      ).createdAt
    );

    await cleanupStalePayments(payload, new Date(created + DAY));

    expect(await statusOf(id)).toBe("pending_payment");

    // And one millisecond later it goes, so this is a boundary rather than a
    // job that never cancels anything.
    await cleanupStalePayments(payload, new Date(created + DAY + 1));

    expect(await statusOf(id)).toBe("cancelled");
  });

  it("leaves one that has a molliePaymentId alone", async () => {
    /*
     * A row with a payment id is a checkout in flight at Mollie; the webhook
     * may still arrive. Cancelling it takes money for a sponsorship the sponsor
     * will never get.
     */
    const { gesture, id } = await seedCheckout("inflight", {
      molliePaymentId: `tr_stale_${RUN.slice(0, 8)}`,
    });

    await cleanupStalePayments(payload, LATER);

    expect(await statusOf(id)).toBe("pending_payment");
    // Still blocking its gesture, which is the cost of being careful here and
    // is the correct trade: Mollie delivers its own expiry, and
    // `endpoints/mollie.ts` cancels on it.
    expect(await isBuyable(gesture)).toBe(false);
    /*
     * And the lease is back. `lib/claims.ts`'s contract is that a consumer
     * gives a claim back when the work did *not* happen, and nothing happened
     * here — a row with a payment id is declined by every sweep for as long as
     * it exists, so a lease left behind on each one is a row this job hands
     * its own housekeeping for no reason.
     */
    expect(await claimsFor(String(id))).toBe(0);
  });

  it("leaves a sponsorship in any other status alone", async () => {
    const { gesture, id } = await seedCheckout("live", { status: "active" });

    await cleanupStalePayments(payload, LATER);

    expect(await statusOf(id)).toBe("active");
    expect(await isBuyable(gesture)).toBe(false);
  });

  it("is idempotent, and the second run is stopped by the claim not the status", async () => {
    /*
     * Two different mechanisms could stop a second sweep from touching a row,
     * and a test that simply ran the job twice would not say which one did —
     * the state machine would have stopped it either way. So they are
     * separated.
     *
     * **The claim**, first: the row below is left *exactly* as the candidate
     * query wants it — `pending_payment`, older than the window, no payment id
     * — and the only thing standing between it and a cancellation is a lease
     * somebody else holds.
     */
    const { gesture, id } = await seedCheckout("claimed");

    expect(
      await takeClaim(payload, {
        key: String(id),
        kind: CLAIM_KINDS.stalePayment,
        ttlMs: 60_000,
      })
    ).toBe(true);

    const held = await cleanupStalePayments(payload, LATER);

    /*
     * This assertion has already earned its place. The sweep used to clear its
     * lapsed leases against the `now` it was *given* — and `LATER` is 25 hours
     * ahead, so it deleted the live lease below and cancelled the row. A lock
     * that unlocks itself for whoever asks the biggest question is not a lock;
     * the window's clock and the lease's clock are different clocks.
     */
    expect(await statusOf(id)).toBe("pending_payment");
    expect(await isBuyable(gesture)).toBe(false);
    expect(held.skipped).toBeGreaterThanOrEqual(1);

    // Give it back, and the same row goes on the same terms — so the skip
    // above was the claim and not something about this fixture.
    await releaseClaim(payload, {
      key: String(id),
      kind: CLAIM_KINDS.stalePayment,
      consequence: "test fixture could not release its lease",
    });

    await cleanupStalePayments(payload, LATER);

    expect(await statusOf(id)).toBe("cancelled");
    expect(await isBuyable(gesture)).toBe(true);

    /*
     * **The status**, second. The row is now `cancelled`, so the candidate
     * query never returns it — and this run is stopped before any claim is
     * consulted. The claim from the successful sweep is still there, which is
     * what makes the two mechanisms visible at once rather than one hiding the
     * other.
     */
    const again = await cleanupStalePayments(payload, LATER);

    expect(again.cancelled).toBe(0);
    expect(await claimsFor(String(id))).toBe(1);
    expect(await statusOf(id)).toBe("cancelled");

    /*
     * And that kept claim is a **lease**, not a receipt. This assertion is
     * structural rather than behavioural on purpose: what it guards against is
     * a sweeper dying between claiming a row and cancelling it, and a process
     * that dies is not something a test in that process can stage — the
     * ordinary failure path releases the claim itself, two tests below. The
     * damage would be silent and permanent: that sponsorship claimed for ever,
     * its gesture unsellable for ever, by the lock belonging to the job whose
     * whole purpose is to free it.
     */
    const { docs } = await payload.find({
      collection: "claims",
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { key: { equals: `${CLAIM_KINDS.stalePayment}:${id}` } },
    });

    expect(Date.parse(String(docs[0]?.expiresAt))).toBeGreaterThan(Date.now());
  });

  it("does not cancel a row the webhook advanced mid-sweep", async () => {
    /*
     * The sharp edge. The candidate query answers "abandoned", and then —
     * before the write — Mollie's webhook lands and moves the row into the
     * approval queue. A job that trusted the document it was holding would
     * cancel a sponsorship somebody had just paid for.
     *
     * The webhook is simulated by advancing the row from inside the candidate
     * query itself, which is the exact window: the result is already decided,
     * and the row is not what it says any more. The patch is removed before
     * the job re-reads, so what catches this is the job's own read and not the
     * fixture.
     */
    const { id } = await seedCheckout("midsweep");
    const realFind = payload.find.bind(payload);
    let landed = false;

    payload.find = (async (args: Parameters<typeof payload.find>[0]) => {
      const result = await realFind(args);

      if (
        !landed &&
        args.collection === "sponsorships" &&
        JSON.stringify(args.where ?? {}).includes("pending_payment")
      ) {
        landed = true;
        payload.find = realFind;
        await payload.update({
          collection: "sponsorships",
          data: { status: "pending_approval" },
          id,
          overrideAccess: true,
        });
      }

      return result;
    }) as typeof payload.find;

    let report: Awaited<ReturnType<typeof cleanupStalePayments>>;

    try {
      report = await cleanupStalePayments(payload, LATER);
    } finally {
      payload.find = realFind;
    }

    expect(landed).toBe(true);
    expect(await statusOf(id)).toBe("pending_approval");
    expect(report.skipped).toBeGreaterThanOrEqual(1);
    expect(report.failures).toBe(0);
  });

  it("finishes the sweep when a candidate is deleted under it", async () => {
    /*
     * The same window as the test above, with the other thing that can happen
     * in it: an administrator deletes the row between the query and the write.
     * The re-read answers "there is no such row", and the point of the
     * assertion is not that one row was skipped — it is that the *next* row
     * was still swept. A job that read `.status` off nothing would throw from
     * outside its own `try`, and one deleted row would end the whole sweep and
     * leave every later gesture blocked.
     */
    const doomed = await seedCheckout("doomed");
    const survivor = await seedCheckout("survivor");
    const realFind = payload.find.bind(payload);
    let landed = false;

    payload.find = (async (args: Parameters<typeof payload.find>[0]) => {
      const result = await realFind(args);

      if (
        !landed &&
        args.collection === "sponsorships" &&
        JSON.stringify(args.where ?? {}).includes("pending_payment")
      ) {
        landed = true;
        payload.find = realFind;
        await payload.delete({
          collection: "sponsorships",
          id: doomed.id,
          overrideAccess: true,
        });
      }

      return result;
    }) as typeof payload.find;

    let report: Awaited<ReturnType<typeof cleanupStalePayments>>;

    try {
      report = await cleanupStalePayments(payload, LATER);
    } finally {
      payload.find = realFind;
    }

    expect(landed).toBe(true);
    expect(await statusOf(survivor.id)).toBe("cancelled");
    expect(await isBuyable(survivor.gesture)).toBe(true);
    expect(report.failures).toBe(0);
  });

  it("releases the lease when the cancel fails, so the next sweep retries", async () => {
    /*
     * A lease is held for fifteen minutes, and a row that is blocking a sale
     * must not wait that out because of one failed write. Keeping the lease on
     * a failure would mean a transient error costs a quarter of an hour of
     * unsellability — failing in the expensive direction, for a job that
     * exists to stop exactly that.
     */
    const { gesture, id } = await seedCheckout("unwritable");
    const realUpdate = payload.update.bind(payload);
    let refused = false;

    payload.update = (async (args: Parameters<typeof payload.update>[0]) => {
      if (
        !refused &&
        args.collection === "sponsorships" &&
        "id" in args &&
        args.id === id
      ) {
        refused = true;

        throw new Error("the database said no");
      }

      return await realUpdate(args);
    }) as typeof payload.update;

    let report: Awaited<ReturnType<typeof cleanupStalePayments>>;

    try {
      report = await cleanupStalePayments(payload, LATER);
    } finally {
      payload.update = realUpdate;
    }

    expect(refused).toBe(true);
    expect(report.failures).toBeGreaterThanOrEqual(1);
    expect(await statusOf(id)).toBe("pending_payment");
    expect(await claimsFor(String(id))).toBe(0);

    // And the next sweep really does pick it up again, which is what the
    // release was for.
    await cleanupStalePayments(payload, LATER);

    expect(await statusOf(id)).toBe("cancelled");
    expect(await isBuyable(gesture)).toBe(true);
  });

  it("clears its own lapsed leases", async () => {
    /*
     * The lease is kept when the sweep succeeds — that is what makes a second
     * run distinguishable from the first — so nothing else will ever remove
     * it, and one row per abandoned checkout would accumulate for the life of
     * the product.
     */
    const lapsed = `lapsed-${RUN}`;
    const live = `live-${RUN}`;

    await takeClaim(payload, {
      key: lapsed,
      kind: CLAIM_KINDS.stalePayment,
      ttlMs: -1000,
    });
    await takeClaim(payload, {
      key: live,
      kind: CLAIM_KINDS.stalePayment,
      ttlMs: 60_000,
    });

    await cleanupStalePayments(payload, new Date());

    expect(await claimsFor(lapsed)).toBe(0);
    // And a lease somebody is still holding is untouched, which is the
    // difference between housekeeping and breaking the lock.
    expect(await claimsFor(live)).toBe(1);

    await releaseClaim(payload, {
      key: live,
      kind: CLAIM_KINDS.stalePayment,
      consequence: "test fixture could not release its lease",
    });
  });
});
