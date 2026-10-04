/**
 * The starter switch (phase 7 ruling 4, carry 1): `fake` completes at once;
 * `container`/`local` create the job's `RenderSponsorshipVideo` instance
 * (id = the job id) on the test-only `RENDER_WORKFLOW` binding; a second
 * request is a no-op; any other `create` error is thrown (the message is
 * retried); without the binding the job fails with `workflowUnavailable`.
 */
import { introspectWorkflowInstance } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { EmailMessage } from "@smog/jobs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processEventMessage } from "../src/worker/events-queue";
import { renderStarter, workflowRenderStarter } from "../src/worker/render";
import {
  makeAdmin,
  recordingQueue,
  renderingJob,
  renderJobRow,
  sponsorshipVideo,
  testDb,
} from "./sponsorships";

const ORIGIN = "http://localhost:5173";
const ALREADY_EXISTS = /instance\.already_exists/;
const db = testDb();

function binding(): Workflow {
  if (!env.RENDER_WORKFLOW) {
    throw new Error("[test] The RENDER_WORKFLOW test binding is missing");
  }
  return env.RENDER_WORKFLOW;
}

beforeEach(() => {
  for (const method of ["log", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => undefined);
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("workflowRenderStarter", () => {
  it("creates the job's instance with id = the job id; the run fails cleanly without Mux (muxUnavailable)", async () => {
    const job = await renderingJob();
    await using instance = await introspectWorkflowInstance(
      binding(),
      job.renderJobId
    );
    await instance.modify(async (m) => {
      await m.disableSleeps();
      await m.disableRetryDelays();
    });
    const queues = { email: recordingQueue(), events: recordingQueue() };

    await workflowRenderStarter(binding(), {
      db,
      queues,
      siteUrl: ORIGIN,
    }).start(job);

    const created = await binding().get(job.renderJobId);
    expect(created.id).toBe(job.renderJobId);
    await instance.waitForStatus("complete");
    // The test env has no Mux token (ruling 11: no parse error, a clean failure).
    expect(await instance.getOutput()).toEqual({
      code: "muxUnavailable",
      outcome: "failed",
    });
    expect((await renderJobRow(job.renderJobId))?.status).toBe("failed");
  });

  it("a second render.requested is a no-op: the existing instance counts as started", async () => {
    const job = await renderingJob();
    await using instance = await introspectWorkflowInstance(
      binding(),
      job.renderJobId
    );
    await instance.modify(async (m) => {
      await m.disableSleeps();
      await m.disableRetryDelays();
    });
    const starter = workflowRenderStarter(binding(), {
      db,
      queues: { email: recordingQueue(), events: recordingQueue() },
      siteUrl: ORIGIN,
    });

    await starter.start(job);
    await expect(starter.start(job)).resolves.toBeUndefined();
    // The installed runtime's error for an existing id, which the starter
    // recognises by its code.
    const duplicate = await binding()
      .create({ id: job.renderJobId, params: { renderJobId: job.renderJobId } })
      .then(
        () => null,
        (error: unknown) => error
      );
    expect(String((duplicate as Error | null)?.message)).toMatch(
      ALREADY_EXISTS
    );
    await instance.waitForStatus("complete");
  });

  it("any other create error is thrown, so the message is retried", async () => {
    const job = await renderingJob();
    const starter = workflowRenderStarter(
      { create: () => Promise.reject(new Error("Workflow not found")) },
      {
        db,
        queues: { email: recordingQueue(), events: recordingQueue() },
        siteUrl: ORIGIN,
      }
    );
    await expect(starter.start(job)).rejects.toThrow("Workflow not found");
    expect(
      await processEventMessage(
        {
          attempts: 1,
          body: { renderJobId: job.renderJobId, type: "render.requested" },
          id: "m-1",
        },
        {
          db,
          queues: { email: recordingQueue(), events: recordingQueue() },
          renderStarter: starter,
          siteUrl: ORIGIN,
        }
      )
    ).toEqual({ action: "retry", delaySeconds: 30 });
    expect((await renderJobRow(job.renderJobId))?.status).toBe("queued");
  });

  it("without the binding the job fails at once with workflowUnavailable, and each admin is emailed", async () => {
    const admin = await makeAdmin();
    const job = await renderingJob();
    const email = recordingQueue();

    await workflowRenderStarter(undefined, {
      db,
      queues: { email, events: recordingQueue() },
      siteUrl: ORIGIN,
    }).start(job);

    expect(await renderJobRow(job.renderJobId)).toMatchObject({
      error: "workflowUnavailable: this env has no RENDER_WORKFLOW binding",
      status: "failed",
    });
    expect((await sponsorshipVideo(job.sponsorshipId))?.status).toBe(
      "render_failed"
    );
    const sent = (email.messages as EmailMessage[]).filter(
      (message) => message.to === admin.email
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]?.idempotencyKey).toBe(
      `admin_render_failed:${job.renderJobId}:${admin.id}`
    );
  });
});

describe("renderStarter (the RENDER_MODE switch)", () => {
  it("fake completes the job with the gesture's own video", async () => {
    const job = await renderingJob();
    await renderStarter({
      db,
      queues: { email: recordingQueue(), events: recordingQueue() },
      renderWorkflow: binding(),
      vars: { RENDER_MODE: "fake", SITE_URL: ORIGIN },
    }).start(job);
    expect((await renderJobRow(job.renderJobId))?.status).toBe("succeeded");
    expect(await sponsorshipVideo(job.sponsorshipId)).toMatchObject({
      status: "in_review",
      video_playback_id: job.gesture.playbackId,
    });
  });

  it.each(["container", "local"] as const)(
    "%s without the binding fails the job with workflowUnavailable",
    async (mode) => {
      const job = await renderingJob();
      await renderStarter({
        db,
        queues: { email: recordingQueue(), events: recordingQueue() },
        renderWorkflow: undefined,
        vars: { RENDER_MODE: mode, SITE_URL: ORIGIN },
      }).start(job);
      expect((await renderJobRow(job.renderJobId))?.status).toBe("failed");
    }
  );
});
