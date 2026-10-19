/**
 * The real `RenderSponsorshipVideo` class on the test-only
 * `RENDER_WORKFLOW` binding (vitest.config.ts), driven with
 * `introspectWorkflowInstance` (phase 7 ruling 15). Sleeps and retry
 * delays are off; `source-lookup`, `source-resolve` and `render` are
 * mocked, so no Mux and no renderer are needed, except in the third test,
 * which runs the real `render` step against the Mux fake and a renderer
 * held open while the event is sent.
 */
import { introspectWorkflowInstance } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import type { RendererPort } from "@smog/render/contract";
import { FAKE_RENDER_RESULT } from "@smog/render/testing";
import type { RenderMuxEvent } from "@smog/video";
import { createFakeMux } from "@smog/video/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workflowRenderStarter } from "../src/worker/render";
import { RenderSponsorshipVideo } from "../src/worker/render-workflow";
import {
  isInstanceNotFound,
  workflowStatusPort,
} from "../src/worker/scheduled";
import { waitForMail } from "./helpers";
import {
  kv,
  makeAdmin,
  recordingQueue,
  renderingJob,
  renderJobRow,
  sponsorshipVideo,
  testDb,
} from "./sponsorships";

const ORIGIN = "http://localhost:5173";
/** How long the slow render may take to store its upload on the job. */
const UPLOAD_STORED_WITHIN_MS = 20_000;

function binding(): Workflow {
  if (!env.RENDER_WORKFLOW) {
    throw new Error("[test] The RENDER_WORKFLOW test binding is missing");
  }
  return env.RENDER_WORKFLOW;
}

function starter() {
  return workflowRenderStarter(binding(), {
    db: testDb(),
    queues: { email: recordingQueue(), events: recordingQueue() },
    siteUrl: ORIGIN,
  });
}

function rendition(playbackId: string) {
  return {
    kind: "rendition",
    url: `https://stream.mux.com/${playbackId}/highest.mp4`,
  };
}

beforeEach(() => {
  for (const method of ["log", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => undefined);
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RenderSponsorshipVideo (introspected)", () => {
  it("the happy path: the mux-asset event ends the wait and the commit moves the sponsorship to in_review", async () => {
    const job = await renderingJob();
    const uploadId = `up${crypto.randomUUID().replaceAll("-", "")}`;
    const ready: RenderMuxEvent = {
      assetId: `asset-${uploadId}`,
      playbackId: `pb-${uploadId}`,
      renderJobId: job.renderJobId,
      type: "asset.ready",
      uploadId,
    };
    await using instance = await introspectWorkflowInstance(
      binding(),
      job.renderJobId
    );
    await instance.modify(async (m) => {
      await m.disableSleeps();
      await m.disableRetryDelays();
      await m.mockStepResult(
        { name: "source-lookup" },
        { assetId: null, master: "none" }
      );
      await m.mockStepResult(
        { name: "source-resolve" },
        rendition(job.input.sourcePlaybackId)
      );
      await m.mockStepResult(
        { name: "render" },
        { frames: 150, height: 1920, uploadId, width: 1080 }
      );
      await m.mockEvent({ payload: ready, type: `mux-asset-${uploadId}` });
    });

    await starter().start(job);
    await instance.waitForStatus("complete");

    expect(await instance.getOutput()).toEqual({ outcome: "completed" });
    expect(await instance.waitForStepResult({ name: "start" })).toMatchObject({
      input: job.input,
      state: "started",
    });
    expect(await renderJobRow(job.renderJobId)).toMatchObject({
      mux_asset_id: ready.assetId,
      playback_id: ready.playbackId,
      status: "succeeded",
    });
    expect(await sponsorshipVideo(job.sponsorshipId)).toEqual({
      status: "in_review",
      video_asset_id: ready.assetId,
      video_playback_id: ready.playbackId,
    });
  });

  it("a renderer 422 (invalidInput) is not retried: fail runs, the instance completes as failed, one email per admin", async () => {
    const admin = await makeAdmin();
    const job = await renderingJob();
    await using instance = await introspectWorkflowInstance(
      binding(),
      job.renderJobId
    );
    await instance.modify(async (m) => {
      await m.disableSleeps();
      await m.disableRetryDelays();
      await m.mockStepResult(
        { name: "source-lookup" },
        { assetId: null, master: "none" }
      );
      await m.mockStepResult(
        { name: "source-resolve" },
        rendition(job.input.sourcePlaybackId)
      );
      // What the adapter throws for the renderer's 422: once, then a
      // success that a retry would have reached.
      await m.mockStepError(
        { name: "render" },
        new NonRetryableError("[render:invalidInput] the request was refused"),
        1
      );
      await m.mockStepResult(
        { name: "render" },
        { frames: 1, height: 2, uploadId: "never", width: 2 }
      );
    });

    await starter().start(job);
    await instance.waitForStatus("complete");

    expect(await instance.getOutput()).toEqual({
      code: "invalidInput",
      outcome: "failed",
    });
    expect(await instance.waitForStepResult({ name: "fail" })).toEqual({
      outcome: "failed",
    });
    expect(await renderJobRow(job.renderJobId)).toMatchObject({
      error: "invalidInput: the request was refused",
      status: "failed",
    });
    expect((await sponsorshipVideo(job.sponsorshipId))?.status).toBe(
      "render_failed"
    );
    // The real EMAIL_QUEUE: the admin gets the render-failed email once.
    const mails = await waitForMail(admin.email);
    expect(mails).toHaveLength(1);
  });

  it("an event sent before the wait is reached (during a slow render) is kept and ends the wait (I-5)", async () => {
    const job = await renderingJob();
    const fake = createFakeMux();
    // The render is held until a KV flag is set. Not a promise: the
    // instance runs in its own request context, and workerd cancels a
    // context that waits on another one's promise as hung.
    const flag = `test:render-release:${job.renderJobId}`;
    const renderer: RendererPort = {
      render: async () => {
        // biome-ignore lint/performance/noAwaitInLoops: polling the test's flag.
        while ((await kv().get(flag)) === null) {
          await scheduler.wait(20);
        }
        return FAKE_RENDER_RESULT;
      },
    };
    const original = RenderSponsorshipVideo.prototype.renderDeps;
    vi.spyOn(RenderSponsorshipVideo.prototype, "renderDeps").mockImplementation(
      function (this: RenderSponsorshipVideo) {
        return { ...original.call(this), mux: fake.mux, renderer };
      }
    );
    await using instance = await introspectWorkflowInstance(
      binding(),
      job.renderJobId
    );
    await instance.modify(async (m) => {
      await m.disableSleeps();
      await m.disableRetryDelays();
      await m.mockStepResult(
        { name: "source-lookup" },
        { assetId: null, master: "none" }
      );
      await m.mockStepResult(
        { name: "source-resolve" },
        rendition(job.input.sourcePlaybackId)
      );
    });

    await starter().start(job);
    // The render is running once its upload is stored on the job: the
    // wait is not reached until the flag releases the renderer.
    // Bounded (review M-8): a regression fails with its own message, not
    // with the generic test timeout.
    let uploadId: string | null = null;
    const deadline = Date.now() + UPLOAD_STORED_WITHIN_MS;
    while (uploadId === null) {
      if (Date.now() > deadline) {
        throw new Error("[test] the render step stored no upload");
      }
      // biome-ignore lint/performance/noAwaitInLoops: polling D1 until the render step stored its upload.
      uploadId = (await renderJobRow(job.renderJobId))?.mux_upload_id ?? null;
      await scheduler.wait(20);
    }
    const upload = fake.uploads.get(uploadId);
    if (!upload) {
      throw new Error("[test] The render step created no upload");
    }
    const asset = fake.readyAsset(fake.completeUpload(upload.id).id);
    await (await binding().get(job.renderJobId)).sendEvent({
      payload: {
        assetId: asset.id,
        playbackId: asset.playbackId ?? undefined,
        renderJobId: job.renderJobId,
        type: "asset.ready",
        uploadId: upload.id,
      } satisfies RenderMuxEvent,
      type: `mux-asset-${upload.id}`,
    });
    await kv().put(flag, "1");
    await instance.waitForStatus("complete");

    expect(await instance.getOutput()).toEqual({ outcome: "completed" });
    expect(await renderJobRow(job.renderJobId)).toMatchObject({
      mux_asset_id: asset.id,
      status: "succeeded",
    });
  });

  it("get() of an unknown id fails with the code the watchdog maps to not-found (task 7 I-1)", async () => {
    const id = crypto.randomUUID();
    const failure = await binding()
      .get(id)
      .then(
        () => null,
        (error: unknown) => error
      );
    expect(failure).toBeInstanceOf(Error);
    expect(isInstanceNotFound(failure)).toBe(true);
    expect(await workflowStatusPort(binding())?.status(id)).toBe("not-found");
  });
});
