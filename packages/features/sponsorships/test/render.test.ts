import { renderJob } from "@smog/db";
import { SAMPLE_PLAYBACK_ID } from "@smog/db/testing";
import { renderInputSchema } from "@smog/render/contract";
import { newId } from "@smog/utils";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  completeRender,
  createRenderJob,
  createRenderJobStatements,
  failRender,
  fakeRenderStarter,
  markRenderRunning,
  renderStarterFor,
} from "../src/server/render";
import {
  eventsOf,
  makeAdmin,
  NOW,
  SITE_URL,
  seedCheckout,
  sponsorshipRow,
  statusOf,
  testDb,
} from "./helpers";

const db = testDb();

async function jobsOf(sponsorshipId: string) {
  return await db
    .select()
    .from(renderJob)
    .where(eq(renderJob.sponsorshipId, sponsorshipId));
}

async function rendering(logo = false) {
  const seeded = await seedCheckout(db, {
    count: 1,
    logo,
    paymentStatus: "paid",
    status: "rendering",
  });
  return seeded.sponsorshipIds[0] as string;
}

describe("the render seam (ruling 7)", () => {
  it("creates one queued job with the render contract input and a render_started event", async () => {
    const id = await rendering(true);
    const built = await createRenderJobStatements(db, {
      now: NOW,
      sponsorshipId: id,
    });
    expect(built).not.toBeNull();
    await db.batch(built?.statements as never);
    expect(built?.after).toEqual([
      { renderJobId: built?.renderJobId, type: "render.requested" },
    ]);
    const [job] = await jobsOf(id);
    const row = await sponsorshipRow(db, id);
    expect(job).toMatchObject({
      attempt: 1,
      id: built?.renderJobId,
      status: "queued",
      workflowInstanceId: built?.renderJobId,
    });
    expect(renderInputSchema.parse(job?.input)).toEqual({
      displayName: "Acme BV",
      logoKey: row.logoKey,
      sourcePlaybackId: SAMPLE_PLAYBACK_ID,
      v: 1,
    });
    expect((await eventsOf(db, id)).map((event) => event.type)).toEqual([
      "render_started",
    ]);
  });

  it("creates no second job while one is queued or running (run twice, one job)", async () => {
    const id = await rendering();
    const first = await createRenderJob(db, { now: NOW, sponsorshipId: id });
    const second = await createRenderJob(db, { now: NOW, sponsorshipId: id });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(await jobsOf(id)).toHaveLength(1);
  });

  it("creates nothing for a sponsorship that is not rendering", async () => {
    const seeded = await seedCheckout(db, { count: 1 });
    expect(
      await createRenderJob(db, {
        now: NOW,
        sponsorshipId: seeded.sponsorshipIds[0] as string,
      })
    ).toBeNull();
  });

  it("create → running → complete puts the video on the sponsorship and moves it to in_review", async () => {
    const id = await rendering();
    const job = await createRenderJob(db, { now: NOW, sponsorshipId: id });
    const renderJobId = job?.renderJobId as string;
    expect(await markRenderRunning(db, { now: NOW, renderJobId })).toBe(true);
    expect(await markRenderRunning(db, { now: NOW, renderJobId })).toBe(false);
    const done = await completeRender(db, {
      assetId: "asset-1",
      now: NOW,
      playbackId: "playback-1",
      renderJobId,
    });
    expect(done.outcome).toBe("completed");
    const row = await sponsorshipRow(db, id);
    expect(row).toMatchObject({
      status: "in_review",
      videoAssetId: "asset-1",
      videoPlaybackId: "playback-1",
    });
    const [stored] = await jobsOf(id);
    expect(stored).toMatchObject({
      muxAssetId: "asset-1",
      playbackId: "playback-1",
      status: "succeeded",
    });
    expect(stored?.finishedAt?.getTime()).toBe(NOW.getTime());
    // Complete twice: a final job is a no-op.
    const again = await completeRender(db, {
      assetId: "asset-2",
      now: NOW,
      playbackId: "playback-2",
      renderJobId,
    });
    expect(again.outcome).toBe("noop");
    expect((await sponsorshipRow(db, id)).videoPlaybackId).toBe("playback-1");
    expect((await eventsOf(db, id)).map((event) => event.type)).toEqual([
      "render_started",
      "render_succeeded",
    ]);
  });

  it("fail moves the sponsorship to render_failed and plans the admin email, once", async () => {
    const admin = await makeAdmin(db, { locale: "nl" });
    const id = await rendering();
    const job = await createRenderJob(db, { now: NOW, sponsorshipId: id });
    const renderJobId = job?.renderJobId as string;
    const long = `boom ${"x".repeat(400)}`;
    const failed = await failRender(db, {
      error: long,
      now: NOW,
      renderJobId,
      siteUrl: SITE_URL,
    });
    expect(failed.outcome).toBe("failed");
    expect(failed.notify).toContainEqual(
      expect.objectContaining({
        idempotencyKey: `admin_render_failed:${renderJobId}:${admin.id}`,
        locale: "nl",
        props: expect.objectContaining({
          displayName: "Acme BV",
          gestureName: "Gebaar 1",
          url: `${SITE_URL}/admin/sponsorships/${id}`,
        }),
        template: "transactional/admin-render-failed",
        to: admin.email,
      })
    );
    const props = failed.notify[0]?.props as { error?: string } | undefined;
    expect(props?.error?.length).toBeLessThanOrEqual(300);
    expect(await statusOf(db, id)).toBe("render_failed");
    const [stored] = await jobsOf(id);
    expect(stored?.status).toBe("failed");
    const again = await failRender(db, {
      error: "again",
      now: NOW,
      renderJobId,
      siteUrl: SITE_URL,
    });
    // A re-run after the commit (the caller failed to enqueue) re-derives
    // the same keyed emails, with the stored error (fix round 1, I-1).
    expect(again).toEqual({ notify: failed.notify, outcome: "failed" });
    expect((await eventsOf(db, id)).map((event) => event.type)).toEqual([
      "render_started",
      "render_failed",
    ]);
  });

  it("completing a job whose sponsorship left rendering closes the job only: noop (Minor 6)", async () => {
    const seeded = await seedCheckout(db, {
      count: 1,
      paymentStatus: "paid",
      status: "in_review",
    });
    const id = seeded.sponsorshipIds[0] as string;
    const renderJobId = newId();
    // A fixture: a job left queued for a sponsorship already in review.
    await db.insert(renderJob).values({
      id: renderJobId,
      input: {},
      sponsorshipId: id,
      status: "queued",
      workflowInstanceId: renderJobId,
    });
    const done = await completeRender(db, {
      assetId: null,
      now: NOW,
      playbackId: "late",
      renderJobId,
    });
    expect(done.outcome).toBe("noop");
    expect((await jobsOf(id))[0]?.status).toBe("succeeded");
    expect((await sponsorshipRow(db, id)).videoPlaybackId).toBeNull();
  });

  it("a second attempt counts up after a failed one", async () => {
    const id = await rendering();
    const first = await createRenderJob(db, { now: NOW, sponsorshipId: id });
    await failRender(db, {
      error: "x",
      now: NOW,
      renderJobId: first?.renderJobId as string,
      siteUrl: SITE_URL,
    });
    // Phase 7's retry (`render_retried`) brings it back to rendering.
    const { transitionStatements } = await import("../src/server/transition");
    await db.batch(
      transitionStatements(db, {
        actorId: null,
        data: {},
        event: "render_retried",
        from: "render_failed",
        now: NOW,
        sponsorshipId: id,
      })
    );
    const second = await createRenderJob(db, { now: NOW, sponsorshipId: id });
    const jobs = await jobsOf(id);
    expect(jobs.find((job) => job.id === second?.renderJobId)?.attempt).toBe(2);
  });

  it("the fake starter completes at once with the gesture's own video and no asset", async () => {
    const id = await rendering();
    const job = await createRenderJob(db, { now: NOW, sponsorshipId: id });
    const starter = fakeRenderStarter(db, () => NOW);
    const input = renderInputSchema.parse((await jobsOf(id))[0]?.input);
    await starter.start({ input, renderJobId: job?.renderJobId as string });
    expect(await sponsorshipRow(db, id)).toMatchObject({
      status: "in_review",
      videoAssetId: null,
      videoPlaybackId: SAMPLE_PLAYBACK_ID,
    });
  });

  it("RENDER_MODE picks the starter: fake completes, container and local stay queued", async () => {
    const id = await rendering();
    const job = await createRenderJob(db, { now: NOW, sponsorshipId: id });
    const input = renderInputSchema.parse((await jobsOf(id))[0]?.input);
    const renderJobId = job?.renderJobId as string;
    await renderStarterFor("container", { db }).start({ input, renderJobId });
    await renderStarterFor("local", { db }).start({ input, renderJobId });
    expect((await jobsOf(id))[0]?.status).toBe("queued");
    await renderStarterFor("fake", { db }).start({ input, renderJobId });
    expect((await jobsOf(id))[0]?.status).toBe("succeeded");
  });
});
