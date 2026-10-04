/**
 * The rejected video's retention (phase 8 ruling 13): the bounded request
 * for changes from `rejected`, and the daily purge of rejected videos in
 * `runRetentionPurge`. Mux calls run only against the Mux fake.
 */
import { env } from "cloudflare:workers";
import { gesture, sponsorship, sponsorshipEvent } from "@smog/db";
import { DAY_MS, newId } from "@smog/utils";
import { createFakeMux, type FakeMux } from "@smog/video/testing";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REJECTED_VIDEO_PURGE_PER_RUN,
  REJECTED_VIDEO_RETENTION_MS,
} from "../src/schema";
import {
  requestChangesStatements,
  SponsorshipActionError,
} from "../src/server/lifecycle";
import {
  isRejectedTooLongAgo,
  readRejectedAt,
} from "../src/server/rejected-video";
import { rejectedVideoQuery, runRetentionPurge } from "../src/server/sweeps";
import { clearSponsorships } from "./clean";
import {
  makeAdmin,
  NOW,
  SITE_URL,
  seedCheckout,
  sponsorshipRow,
  statusOf,
  testDb,
} from "./helpers";

const db = testDb();
let actorId: string;
let mux: FakeMux;

beforeEach(async () => {
  await clearSponsorships(db);
  actorId = (await makeAdmin(db)).id;
  mux = createFakeMux();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const daysBefore = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

/** Rejected sponsorships with no event yet (a fixture may start anywhere). */
async function rejected(count = 1): Promise<string[]> {
  const seeded = await seedCheckout(db, {
    count,
    paymentStatus: "paid",
    status: "rejected",
  });
  return seeded.sponsorshipIds;
}

async function event(
  sponsorshipId: string,
  type: "rejected" | "legacy" | "changes_requested",
  createdAt: Date,
  data: unknown = type === "rejected" ? { reason: "Niet gepast" } : {}
): Promise<void> {
  await db.insert(sponsorshipEvent).values({
    actorId: null,
    createdAt,
    data,
    id: newId(),
    sponsorshipId,
    type,
  });
}

/** A rejected sponsorship with a rendered video in the Mux fake. */
async function withVideo(
  sponsorshipId: string
): Promise<{ assetId: string; playbackId: string }> {
  const asset = mux.addAsset({ passthrough: `render-job:dev:${newId()}` });
  const playbackId = asset.playbackId as string;
  await db
    .update(sponsorship)
    .set({ videoAssetId: asset.id, videoPlaybackId: playbackId })
    .where(eq(sponsorship.id, sponsorshipId));
  return { assetId: asset.id, playbackId };
}

async function requestChanges(sponsorshipId: string, now = NOW) {
  return await requestChangesStatements(db, {
    actorId,
    now,
    siteUrl: SITE_URL,
    sponsorshipId,
  });
}

async function purge(now = NOW) {
  return await runRetentionPurge({
    db,
    kv: undefined,
    media: undefined,
    mux: mux.mux,
    now,
  });
}

describe("requestChanges from rejected is bounded (ruling 13)", () => {
  it("is allowed 29 days after the rejected event", async () => {
    const [id] = (await rejected()) as [string];
    await event(id, "rejected", daysBefore(29));
    const plan = await requestChanges(id);
    await db.batch(plan.statements as never);
    expect(await statusOf(db, id)).toBe("changes_requested");
  });

  it("is refused 31 days after it (rejectedTooLongAgo), and nothing changes", async () => {
    const [id] = (await rejected()) as [string];
    await event(id, "rejected", daysBefore(31));
    await expect(requestChanges(id)).rejects.toMatchObject({
      reason: "rejectedTooLongAgo",
    });
    expect(await statusOf(db, id)).toBe("rejected");
  });

  it("counts from the latest rejection", async () => {
    const [id] = (await rejected()) as [string];
    await event(id, "rejected", daysBefore(60));
    await event(id, "changes_requested", daysBefore(50));
    await event(id, "rejected", daysBefore(10));
    expect(await readRejectedAt(db, id)).toBe(daysBefore(10).getTime());
    await expect(requestChanges(id)).resolves.toBeDefined();
  });

  it("refuses at exactly the bound", async () => {
    const [id] = (await rejected()) as [string];
    await event(
      id,
      "rejected",
      new Date(NOW.getTime() - REJECTED_VIDEO_RETENTION_MS)
    );
    await expect(requestChanges(id)).rejects.toBeInstanceOf(
      SponsorshipActionError
    );
  });

  it("holds the bound in the batch too (a rejection older than the read saw)", async () => {
    const [id] = (await rejected()) as [string];
    await event(id, "rejected", daysBefore(29));
    const plan = await requestChanges(id);
    // Between the read and the batch the rejection turns out older.
    await db
      .update(sponsorshipEvent)
      .set({ createdAt: daysBefore(31) })
      .where(eq(sponsorshipEvent.sponsorshipId, id));
    const failed = await db
      .batch(plan.statements as never)
      .then(() => null)
      .catch((error: unknown) => error);
    expect(isRejectedTooLongAgo(failed)).toBe(true);
    expect(await statusOf(db, id)).toBe("rejected");
  });

  it("uses a migrated row's legacy reviewedAt when there is no rejected event (epoch ms or ISO)", async () => {
    const [old, recent, iso] = (await rejected(3)) as [string, string, string];
    await event(old, "legacy", daysBefore(400), {
      legacy: { reviewedAt: daysBefore(31).getTime(), status: "rejected" },
    });
    await event(recent, "legacy", daysBefore(400), {
      legacy: { reviewedAt: daysBefore(29).getTime(), status: "rejected" },
    });
    await event(iso, "legacy", daysBefore(400), {
      legacy: { reviewedAt: daysBefore(31).toISOString(), status: "rejected" },
    });
    expect(await readRejectedAt(db, iso)).toBe(daysBefore(31).getTime());
    await expect(requestChanges(old)).rejects.toMatchObject({
      reason: "rejectedTooLongAgo",
    });
    await expect(requestChanges(iso)).rejects.toMatchObject({
      reason: "rejectedTooLongAgo",
    });
    const plan = await requestChanges(recent);
    await db.batch(plan.statements as never);
    expect(await statusOf(db, recent)).toBe("changes_requested");
  });

  it("has no bound for a migrated row with neither (allowed)", async () => {
    const [legacy, bare] = (await rejected(2)) as [string, string];
    await event(legacy, "legacy", daysBefore(900), {
      legacy: { reviewedAt: null, status: "rejected" },
    });
    expect(await readRejectedAt(db, legacy)).toBeNull();
    expect(await readRejectedAt(db, bare)).toBeNull();
    for (const id of [legacy, bare]) {
      // biome-ignore lint/performance/noAwaitInLoops: two rows, in order.
      const plan = await requestChanges(id);
      await db.batch(plan.statements as never);
      expect(await statusOf(db, id)).toBe("changes_requested");
    }
  });

  it("does not bound a request for changes from in_review", async () => {
    const seeded = await seedCheckout(db, {
      count: 1,
      paymentStatus: "paid",
      status: "in_review",
    });
    const id = seeded.sponsorshipIds[0] as string;
    // An old rejection that a later re-edit moved past.
    await event(id, "rejected", daysBefore(90));
    const plan = await requestChanges(id);
    await db.batch(plan.statements as never);
    expect(await statusOf(db, id)).toBe("changes_requested");
  });
});

describe("the rejected video purge (ruling 13, in runRetentionPurge)", () => {
  it("deletes a video rejected 31 days ago once and clears its ids; 29 days is kept", async () => {
    const [old, young] = (await rejected(2)) as [string, string];
    await event(old, "rejected", daysBefore(31));
    await event(young, "rejected", daysBefore(29));
    const oldVideo = await withVideo(old);
    const youngVideo = await withVideo(young);
    const before = (await sponsorshipRow(db, old)).updatedAt;

    const first = await purge();
    const second = await purge();

    expect(first).toMatchObject({
      rejectedVideosDeleted: 1,
      rejectedVideosFailed: 0,
      rejectedVideosRemaining: 0,
    });
    expect(second.rejectedVideosDeleted).toBe(0);
    expect(mux.assets.has(oldVideo.assetId)).toBe(false);
    expect(mux.assets.has(youngVideo.assetId)).toBe(true);
    const deletes = mux.requests.filter((r) => r.method === "DELETE");
    expect(deletes).toEqual([
      { method: "DELETE", path: `/video/v1/assets/${oldVideo.assetId}` },
    ]);
    const row = await sponsorshipRow(db, old);
    expect(row).toMatchObject({
      status: "rejected",
      videoAssetId: null,
      videoPlaybackId: null,
    });
    // Not a sponsorship change: the logo release still counts from it.
    expect(row.updatedAt.getTime()).toBe(before.getTime());
    expect(await sponsorshipRow(db, young)).toMatchObject({
      videoAssetId: youngVideo.assetId,
      videoPlaybackId: youngVideo.playbackId,
    });
  });

  it("never touches a migrated rejected row with only a legacy event", async () => {
    const [migrated] = (await rejected()) as [string];
    await event(migrated, "legacy", daysBefore(900), {
      legacy: { reviewedAt: daysBefore(800).getTime(), status: "rejected" },
    });
    const video = await withVideo(migrated);

    const result = await purge(new Date(NOW.getTime() + 3650 * DAY_MS));

    expect(result.rejectedVideosDeleted).toBe(0);
    expect(result.rejectedVideosRemaining).toBe(0);
    expect(mux.assets.has(video.assetId)).toBe(true);
    expect(mux.requests).toEqual([]);
    expect(await sponsorshipRow(db, migrated)).toMatchObject({
      videoAssetId: video.assetId,
    });
  });

  it(`deletes at most ${REJECTED_VIDEO_PURGE_PER_RUN} per run and logs what remains`, async () => {
    const ids = await rejected(25);
    for (const id of ids) {
      // biome-ignore lint/performance/noAwaitInLoops: fixtures, in order.
      await event(id, "rejected", daysBefore(40));
      await withVideo(id);
    }
    const log = vi.spyOn(console, "log");

    const first = await purge();

    expect(first).toMatchObject({
      rejectedVideosDeleted: 20,
      rejectedVideosFailed: 0,
      rejectedVideosRemaining: 5,
    });
    expect(log).toHaveBeenCalledWith(
      '[retention] rejected videos {"deleted":20,"failed":0,"remaining":5}'
    );
    const second = await purge();
    expect(second).toMatchObject({
      rejectedVideosDeleted: 5,
      rejectedVideosRemaining: 0,
    });
    expect(
      [...mux.assets.values()].filter((asset) =>
        asset.passthrough?.startsWith("render-job:")
      )
    ).toEqual([]);
  });

  it("keeps the ids when Mux fails, and the next run retries", async () => {
    const [id] = (await rejected()) as [string];
    await event(id, "rejected", daysBefore(31));
    const video = await withVideo(id);
    mux.failNext(500);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const first = await purge();

    expect(first).toMatchObject({
      rejectedVideosDeleted: 0,
      rejectedVideosFailed: 1,
      rejectedVideosRemaining: 1,
    });
    expect(await sponsorshipRow(db, id)).toMatchObject({
      videoAssetId: video.assetId,
    });
    const second = await purge();
    expect(second).toMatchObject({
      rejectedVideosDeleted: 1,
      rejectedVideosFailed: 0,
      rejectedVideosRemaining: 0,
    });
    expect(mux.assets.has(video.assetId)).toBe(false);
    expect((await sponsorshipRow(db, id)).videoAssetId).toBeNull();
  });

  it("clears the ids of an asset Mux no longer knows (404)", async () => {
    const [id] = (await rejected()) as [string];
    await event(id, "rejected", daysBefore(31));
    const video = await withVideo(id);
    mux.assets.delete(video.assetId);
    expect((await purge()).rejectedVideosDeleted).toBe(1);
    expect((await sponsorshipRow(db, id)).videoAssetId).toBeNull();
  });

  it("unlinks but never deletes an asset a gesture still uses", async () => {
    const [id] = (await rejected()) as [string];
    await event(id, "rejected", daysBefore(31));
    const row = await sponsorshipRow(db, id);
    const asset = mux.addAsset();
    await db
      .update(gesture)
      .set({ muxAssetId: asset.id })
      .where(eq(gesture.id, row.gestureId));
    await db
      .update(sponsorship)
      .set({ videoAssetId: asset.id, videoPlaybackId: asset.playbackId })
      .where(eq(sponsorship.id, id));

    expect((await purge()).rejectedVideosDeleted).toBe(1);
    expect(mux.assets.has(asset.id)).toBe(true);
    expect((await sponsorshipRow(db, id)).videoAssetId).toBeNull();
  });

  it("keeps everything without a Mux client, and a dry run only counts", async () => {
    const [id] = (await rejected()) as [string];
    await event(id, "rejected", daysBefore(31));
    const video = await withVideo(id);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const none = await runRetentionPurge({
      db,
      kv: undefined,
      media: undefined,
      mux: null,
      now: NOW,
    });
    const dry = await runRetentionPurge({
      db,
      dryRun: true,
      kv: undefined,
      media: undefined,
      mux: mux.mux,
      now: NOW,
    });

    expect(none).toMatchObject({
      rejectedVideosDeleted: 0,
      rejectedVideosRemaining: 1,
    });
    expect(dry).toMatchObject({
      rejectedVideosDeleted: 1,
      rejectedVideosRemaining: 0,
    });
    expect(mux.requests).toEqual([]);
    expect((await sponsorshipRow(db, id)).videoAssetId).toBe(video.assetId);
  });

  it("seeks sponsorship_status_ends_at_idx and the event index (query plan)", async () => {
    const { params, sql } = rejectedVideoQuery(db, NOW).toSQL();
    const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .bind(...params)
      .all<{ detail: string }>();
    const details = plan.results.map((row) => row.detail);
    expect(
      details.some(
        (d) =>
          d.startsWith("SEARCH sponsorship USING INDEX") &&
          d.includes("sponsorship_status_ends_at_idx")
      )
    ).toBe(true);
    expect(
      details.some(
        (d) =>
          d.includes("SEARCH ev USING") &&
          d.includes("sponsorship_event_sponsorship_created_idx")
      )
    ).toBe(true);
    expect(details.some((d) => d.startsWith("SCAN"))).toBe(false);
    expect(details.some((d) => d.includes("TEMP B-TREE"))).toBe(false);
  });
});
