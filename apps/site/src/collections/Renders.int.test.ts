// @vitest-environment node
import { Forbidden, getPayload } from "payload";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { claimRenderJob, releaseRenderJob } from "@/lib/renderState";
import config from "../payload.config";

/*
 * Unique per run: the local D1 under `.wrangler/state/vitest` is never cleared
 * between runs, and a collision on `jobId` — which is the one column in this
 * collection that refuses duplicates — throws inside `beforeAll`, which Vitest
 * reports as *skipped* rather than failed. The file would look green having
 * asserted nothing about the mechanism it exists to prove.
 */
const RUN = crypto.randomUUID();

const DAY = 24 * 60 * 60 * 1000;
const PRICE = 5000;

/**
 * The `renders` claim, against a real database.
 *
 * Every assertion here is about something that cannot be observed in a unit
 * test: whether SQLite refuses the second INSERT, what shape the refusal
 * arrives in, and what the claim does with it. A mock of `payload.create`
 * would be a test of the mock.
 */
describe("claiming a render job", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let gestureId: number;
  let sponsorshipId: number;

  const admin = { id: 1, role: "admin", collection: "users" };
  const regularUser = { id: 2, role: "user", collection: "users" };

  /** A job id no other test in this file, or run, uses. */
  const jobId = (label: string) => `render-${label}-${RUN}`;

  const rowsFor = async (id: string) => {
    const { docs } = await payload.find({
      collection: "renders",
      depth: 0,
      limit: 10,
      overrideAccess: true,
      where: { jobId: { equals: id } },
    });

    return docs;
  };

  beforeAll(async () => {
    payload = await getPayload({ config });

    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Render ${RUN}` },
      locale: "nl",
    });

    const gesture = await payload.create({
      collection: "gestures",
      data: {
        categories: [category.id],
        isActive: true,
        name: `Renderen ${RUN}`,
        playbackId: `pb-render-${RUN}`,
      },
      locale: "nl",
    });
    gestureId = gesture.id;

    const now = Date.now();
    const sponsorship = await payload.create({
      collection: "sponsorships",
      data: {
        contactFullName: "Jan Janssens",
        durationYears: 1,
        endDate: new Date(now + 365 * DAY).toISOString(),
        gesture: gesture.id,
        originalVideoPlaybackId: `pb-render-${RUN}`,
        overlayText: `Met dank aan ${RUN}`,
        paymentAmount: PRICE,
        sponsorEmail: `render-${RUN}@example.com`,
        sponsorName: `Acme ${RUN}`,
        startDate: new Date(now).toISOString(),
        status: "pending_approval",
      },
    });
    sponsorshipId = sponsorship.id;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("boots with the fixtures this file assumes", () => {
    // `beforeAll` throwing is reported as *skipped*, not failed, so a run that
    // seeded nothing would look green. This turns that into a named failure.
    expect(gestureId).toBeGreaterThan(0);
    expect(sponsorshipId).toBeGreaterThan(0);
  });

  it("claims a job id exactly once", async () => {
    /*
     * The `webhook-deliveries` lesson, applied. There are no transactions
     * here and a `where` on an update is a SELECT rather than a conditional
     * UPDATE — measured, twice, with both of two concurrent conditional
     * updates reporting a changed row — so the unique index is the only
     * thing that can make two writers disagree about who owns this job.
     *
     * Two claims in flight at once, and exactly one row at the end of it.
     */
    const id = jobId("concurrent");

    const settled = await Promise.allSettled([
      claimRenderJob(payload, { jobId: id, sponsorship: sponsorshipId }),
      claimRenderJob(payload, { jobId: id, sponsorship: sponsorshipId }),
    ]);

    // Neither call may *reject*: a rejection is how this claim reports that
    // the database could not be reached, and a loser that rejected would be
    // indistinguishable from an outage to the one caller that has to tell
    // them apart. The loser resolves to `null`.
    expect(settled.map((result) => result.status)).toEqual([
      "fulfilled",
      "fulfilled",
    ]);

    const results = settled.map((result) =>
      result.status === "fulfilled" ? result.value : undefined
    );

    expect(results.filter((value) => value !== null)).toHaveLength(1);
    expect(results.filter((value) => value === null)).toHaveLength(1);
    expect(await rowsFor(id)).toHaveLength(1);
  });

  it("turns a later claim on the same job away without writing a second row", async () => {
    // The replay, as opposed to the race: Lambda calling back twice, or an
    // operator re-firing a submission. The winner is the row that is already
    // there, and the second caller is told so rather than being handed a
    // second record of the same job.
    const id = jobId("replay");

    const first = await claimRenderJob(payload, {
      jobId: id,
      sponsorship: sponsorshipId,
    });
    const second = await claimRenderJob(payload, {
      jobId: id,
      sponsorship: sponsorshipId,
    });

    expect(first?.jobId).toBe(id);
    expect(first?.state).toBe("queued");
    expect(second).toBeNull();
    expect(await rowsFor(id)).toHaveLength(1);
  });

  it("tells a duplicate claim from a database outage", async () => {
    /*
     * Both of these fail the same way — a raw driver error out of `create`,
     * not a `ValidationError`, because Payload's own `unique` pre-check is a
     * read followed by a write and does not fire under concurrency. The only
     * thing that distinguishes them is whether the row is there afterwards,
     * which is why the claim reads it back.
     *
     * Get this wrong in the direction of "every failure is a duplicate" and a
     * database outage is reported to the caller as "somebody else has this
     * one" — the callback answers 200, Lambda stops retrying, and a render
     * that cost real money is silently dropped.
     */
    const outage = new Error(
      'Failed query: insert into "renders" ... D1_ERROR: Network connection lost.'
    );
    const claimed = jobId("outage-but-claimed");
    const held = await claimRenderJob(payload, {
      jobId: claimed,
      sponsorship: sponsorshipId,
    });
    expect(held).not.toBeNull();

    const create = vi.spyOn(payload, "create").mockRejectedValue(outage);

    // No row: the create failed for a reason that has nothing to do with
    // anyone else holding the job, and the caller must hear about it.
    const unclaimed = jobId("outage");
    await expect(
      claimRenderJob(payload, {
        jobId: unclaimed,
        sponsorship: sponsorshipId,
      })
    ).rejects.toBe(outage);

    // The row is there: the same failure, the same error object, and this
    // time it really is somebody else's job.
    await expect(
      claimRenderJob(payload, { jobId: claimed, sponsorship: sponsorshipId })
    ).resolves.toBeNull();

    expect(create).toHaveBeenCalledTimes(2);
    create.mockRestore();

    // And the outage left nothing behind to turn a retry into a false replay.
    expect(await rowsFor(unclaimed)).toHaveLength(0);
  });

  it("hands the claim back when the work did not complete", async () => {
    // A claim that outlives the work it covers is worse than no claim: the
    // row says the job was handled, so the retry that would have finished it
    // is waved through as a replay.
    const id = jobId("released");

    expect(
      await claimRenderJob(payload, { jobId: id, sponsorship: sponsorshipId })
    ).not.toBeNull();
    expect(
      await claimRenderJob(payload, { jobId: id, sponsorship: sponsorshipId })
    ).toBeNull();

    await releaseRenderJob(payload, id);
    expect(await rowsFor(id)).toHaveLength(0);

    // The point of handing it back: the next attempt wins it.
    expect(
      await claimRenderJob(payload, { jobId: id, sponsorship: sponsorshipId })
    ).not.toBeNull();
    expect(await rowsFor(id)).toHaveLength(1);
  });

  it("refuses a state change the table does not allow, against a real row", async () => {
    // `lib/renderState.ts` decides the policy; this is the assertion that
    // something enforces it. Every server-side writer runs with
    // `overrideAccess: true`, so the enforcement has to be a hook rather than
    // an access rule, and `overrideAccess` here is what proves it.
    const id = jobId("transitions");
    const claim = await claimRenderJob(payload, {
      jobId: id,
      sponsorship: sponsorshipId,
    });

    const forward = await payload.update({
      collection: "renders",
      id: claim?.id ?? 0,
      overrideAccess: true,
      data: { muxAssetId: `asset-${RUN}`, state: "uploading" },
    });
    expect(forward.state).toBe("uploading");

    const ready = await payload.update({
      collection: "renders",
      id: claim?.id ?? 0,
      overrideAccess: true,
      data: { state: "ready" },
    });
    expect(ready.state).toBe("ready");

    await expect(
      payload.update({
        collection: "renders",
        id: claim?.id ?? 0,
        overrideAccess: true,
        data: { state: "rendering" },
      })
    ).rejects.toThrow(/cannot go from ready to rendering/);

    // Refused, not quietly dropped: the row still says what it said.
    const after = await payload.findByID({
      collection: "renders",
      id: claim?.id ?? 0,
      overrideAccess: true,
    });
    expect(after.state).toBe("ready");
    expect(after.muxAssetId).toBe(`asset-${RUN}`);
  });

  it("outlives the sponsorship it was made for", async () => {
    /*
     * Payload writes `ON DELETE set null` for every relationship regardless
     * of whether the column can hold NULL, so a `required: true` here would
     * make this delete fail with a raw `Failed query: delete from
     * "sponsorships"` — probed, and the reason the field is optional.
     * `user_consents.user` is the same defect found the same way.
     *
     * Keeping the row is also what a cleanup needs: `muxAssetId` is what Mux
     * bills for every month, and a render row deleted along with its
     * sponsorship is an asset nobody can name any more.
     */
    const doomed = await payload.create({
      collection: "sponsorships",
      data: {
        contactFullName: "Jan Janssens",
        durationYears: 1,
        endDate: new Date(Date.now() + 365 * DAY).toISOString(),
        gesture: gestureId,
        originalVideoPlaybackId: `pb-render-${RUN}`,
        overlayText: "Tijdelijk",
        paymentAmount: PRICE,
        sponsorEmail: `doomed-${RUN}@example.com`,
        sponsorName: `Acme doomed ${RUN}`,
        startDate: new Date().toISOString(),
        status: "pending_approval",
      },
    });

    const id = jobId("orphaned");
    const claim = await claimRenderJob(payload, {
      jobId: id,
      sponsorship: doomed.id,
    });
    await payload.update({
      collection: "renders",
      id: claim?.id ?? 0,
      overrideAccess: true,
      data: { muxAssetId: `asset-orphaned-${RUN}` },
    });

    await payload.delete({
      collection: "sponsorships",
      id: doomed.id,
      overrideAccess: true,
    });

    const [row] = await rowsFor(id);
    expect(row?.sponsorship ?? null).toBeNull();
    expect(row?.muxAssetId).toBe(`asset-orphaned-${RUN}`);
  });

  it("keeps render rows out of every hand but an admin's", async () => {
    const id = jobId("access");
    const claim = await claimRenderJob(payload, {
      jobId: id,
      sponsorship: sponsorshipId,
    });

    const seen = await payload.find({
      collection: "renders",
      overrideAccess: false,
      user: admin as never,
      where: { jobId: { equals: id } },
    });
    expect(seen.docs).toHaveLength(1);

    await expect(
      payload.find({
        collection: "renders",
        overrideAccess: false,
        user: regularUser as never,
        where: { jobId: { equals: id } },
      })
    ).rejects.toBeInstanceOf(Forbidden);

    await expect(
      payload.find({ collection: "renders", overrideAccess: false })
    ).rejects.toBeInstanceOf(Forbidden);

    // Nothing may be written over the API at all — a lock an admin can POST
    // to or delete is not a lock, and the only legitimate writer is
    // server-side code going through the local API.
    await expect(
      payload.create({
        collection: "renders",
        overrideAccess: false,
        user: admin as never,
        data: {
          jobId: jobId("forged"),
          sponsorship: sponsorshipId,
          state: "ready",
        },
      })
    ).rejects.toBeInstanceOf(Forbidden);

    await expect(
      payload.update({
        collection: "renders",
        id: claim?.id ?? 0,
        overrideAccess: false,
        user: admin as never,
        data: { state: "failed" },
      })
    ).rejects.toBeInstanceOf(Forbidden);

    await expect(
      payload.delete({
        collection: "renders",
        id: claim?.id ?? 0,
        overrideAccess: false,
        user: admin as never,
      })
    ).rejects.toBeInstanceOf(Forbidden);

    expect(await rowsFor(jobId("forged"))).toHaveLength(0);
    expect(await rowsFor(id)).toHaveLength(1);
  });
});
