/**
 * The Mux webhook's render events (phase 7 ruling 9, W-02): this env's
 * `render-job:dev:` event reaches its waiting Workflow instance through
 * the real route (which passes `ENVIRONMENT`); an unknown instance is
 * `gone` (200); a superseded upload's asset, or an unknown job's, is
 * deleted and not forwarded, while a committed one is never deleted;
 * another env's or an untagged render event is ignored and touches
 * nothing (phase 8 ruling 4); without the binding (`fake` mode) a render
 * event is ignored.
 */
import { introspectWorkflowInstance } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { handleMuxWebhook } from "@smog/video";
import {
  createFakeMux,
  createMemoryKv,
  signMuxWebhook,
} from "@smog/video/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWebhookHooks } from "../src/worker/render";
import { MUX_WEBHOOK_TEST_SECRET } from "./mux-secret";
import {
  renderingJob,
  renderJobRow,
  sponsorshipVideo,
  testDb,
} from "./sponsorships";

const ORIGIN = "http://localhost:5173";
const db = testDb();

function binding(): Workflow {
  if (!env.RENDER_WORKFLOW) {
    throw new Error("[test] The RENDER_WORKFLOW test binding is missing");
  }
  return env.RENDER_WORKFLOW;
}

function assetReady(
  renderJobId: string,
  uploadId: string,
  assetId = `asset${crypto.randomUUID().replaceAll("-", "")}`,
  passthrough = `render-job:dev:${renderJobId}`
) {
  return {
    created_at: new Date().toISOString(),
    data: {
      id: assetId,
      passthrough,
      playback_ids: [{ id: `pb-${assetId}`, policy: "public" }],
      status: "ready",
      upload_id: uploadId,
    },
    id: crypto.randomUUID(),
    object: { id: assetId, type: "asset" },
    type: "video.asset.ready",
  };
}

async function signed(event: unknown): Promise<Request> {
  const body = JSON.stringify(event);
  return new Request(`${ORIGIN}/api/webhooks/mux`, {
    body,
    headers: {
      "cf-connecting-ip": crypto.randomUUID(),
      "content-type": "application/json",
      "mux-signature": await signMuxWebhook(body, MUX_WEBHOOK_TEST_SECRET),
    },
    method: "POST",
  });
}

async function setUpload(renderJobId: string, uploadId: string) {
  await env.DB?.prepare("UPDATE render_job SET mux_upload_id = ? WHERE id = ?")
    .bind(uploadId, renderJobId)
    .run();
}

beforeEach(() => {
  for (const method of ["log", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => undefined);
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/webhooks/mux: render events", () => {
  it("a render-job: asset.ready reaches the waiting instance, which commits it", async () => {
    const job = await renderingJob();
    const uploadId = `up${crypto.randomUUID().replaceAll("-", "")}`;
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
        {
          kind: "rendition",
          url: `https://stream.mux.com/${job.input.sourcePlaybackId}/highest.mp4`,
        }
      );
      await m.mockStepResult(
        { name: "render" },
        { frames: 150, height: 1920, uploadId, width: 1080 }
      );
    });
    // What the (mocked) render step stores.
    await setUpload(job.renderJobId, uploadId);
    await binding().create({
      id: job.renderJobId,
      params: { renderJobId: job.renderJobId },
    });
    // Past `render`: the instance is at (or about to reach) its wait.
    await instance.waitForStepResult({ name: "render" });

    const event = assetReady(job.renderJobId, uploadId);
    const response = await exports.default.fetch(await signed(event));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: "OK" });

    await instance.waitForStatus("complete");
    expect(await instance.getOutput()).toEqual({ outcome: "completed" });
    expect((await renderJobRow(job.renderJobId))?.mux_asset_id).toBe(
      event.data.id
    );
    expect((await sponsorshipVideo(job.sponsorshipId))?.status).toBe(
      "in_review"
    );
  });

  it("an event for a job without an instance answers 200 gone", async () => {
    const job = await renderingJob();
    await setUpload(job.renderJobId, "uploadGone");
    const response = await exports.default.fetch(
      await signed(assetReady(job.renderJobId, "uploadGone"))
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: "GONE" });
  });

  it("an event of an unknown job of this env deletes its asset (phase 8 ruling 12)", async () => {
    const fake = createFakeMux();
    const jobId = crypto.randomUUID();
    const asset = fake.addAsset({ passthrough: `render-job:dev:${jobId}` });
    const response = await handleMuxWebhook(
      await signed(assetReady(jobId, "uploadX", asset.id)),
      {
        ...renderWebhookHooks(binding(), db),
        environment: "dev",
        kv: createMemoryKv(),
        limit: () => Promise.resolve(true),
        mux: fake.mux,
        secret: MUX_WEBHOOK_TEST_SECRET,
      }
    );
    expect(await response.json()).toEqual({ code: "SUPERSEDED" });
    expect(fake.assets.has(asset.id)).toBe(false);
  });

  it.each([
    ["another env's", (id: string) => `render-job:staging:${id}`],
    ["an untagged (phase 7)", (id: string) => `render-job:${id}`],
  ])(
    "%s render event is ignored through the real route and touches nothing",
    async (_label, passthrough) => {
      // A job this env knows: the tag alone keeps it out.
      const job = await renderingJob();
      await setUpload(job.renderJobId, "uploadTheirs");
      const response = await exports.default.fetch(
        await signed(
          assetReady(
            job.renderJobId,
            "uploadTheirs",
            undefined,
            passthrough(job.renderJobId)
          )
        )
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ code: "IGNORED" });
      expect((await renderJobRow(job.renderJobId))?.mux_asset_id).toBeNull();

      // With this env's hooks and a Mux client (the route has none in
      // tests), the asset survives and Mux is never called (review N1).
      const fake = createFakeMux();
      const asset = fake.addAsset({
        passthrough: passthrough(job.renderJobId),
      });
      const hooked = await handleMuxWebhook(
        await signed(
          assetReady(
            job.renderJobId,
            "uploadTheirs",
            asset.id,
            passthrough(job.renderJobId)
          )
        ),
        {
          ...renderWebhookHooks(binding(), db),
          environment: "dev",
          kv: createMemoryKv(),
          limit: () => Promise.resolve(true),
          mux: fake.mux,
          secret: MUX_WEBHOOK_TEST_SECRET,
        }
      );
      expect(await hooked.json()).toEqual({ code: "IGNORED" });
      expect(fake.assets.has(asset.id)).toBe(true);
      expect(fake.requests).toEqual([]);
    }
  );

  it("a superseded upload's asset is deleted and not forwarded", async () => {
    const job = await renderingJob();
    await setUpload(job.renderJobId, "uploadCurrent");
    const fake = createFakeMux();
    const asset = fake.addAsset({
      passthrough: `render-job:dev:${job.renderJobId}`,
    });
    const response = await handleMuxWebhook(
      await signed(assetReady(job.renderJobId, "uploadOld", asset.id)),
      {
        ...renderWebhookHooks(binding(), db),
        environment: "dev",
        kv: createMemoryKv(),
        limit: () => Promise.resolve(true),
        mux: fake.mux,
        secret: MUX_WEBHOOK_TEST_SECRET,
      }
    );
    expect(await response.json()).toEqual({ code: "SUPERSEDED" });
    expect(fake.assets.has(asset.id)).toBe(false);
  });

  it("a late asset.ready after the commit (a succeeded job, same upload) keeps the asset", async () => {
    const job = await renderingJob();
    const fake = createFakeMux();
    const asset = fake.addAsset({
      passthrough: `render-job:dev:${job.renderJobId}`,
    });
    await env.DB?.prepare(
      "UPDATE render_job SET status = 'succeeded', mux_upload_id = ?, mux_asset_id = ? WHERE id = ?"
    )
      .bind("uploadDone", asset.id, job.renderJobId)
      .run();
    const response = await handleMuxWebhook(
      await signed(assetReady(job.renderJobId, "uploadDone", asset.id)),
      {
        ...renderWebhookHooks(binding(), db),
        environment: "dev",
        kv: createMemoryKv(),
        limit: () => Promise.resolve(true),
        mux: fake.mux,
        secret: MUX_WEBHOOK_TEST_SECRET,
      }
    );
    expect(await response.json()).toEqual({ code: "GONE" });
    expect(fake.assets.has(asset.id)).toBe(true);
  });

  it("without the RENDER_WORKFLOW binding a render event is logged and answered 200", async () => {
    const job = await renderingJob();
    const hooks = renderWebhookHooks(undefined, db);
    expect(hooks).toEqual({});
    const response = await handleMuxWebhook(
      await signed(assetReady(job.renderJobId, "uploadFake")),
      {
        ...hooks,
        environment: "dev",
        kv: createMemoryKv(),
        limit: () => Promise.resolve(true),
        secret: MUX_WEBHOOK_TEST_SECRET,
      }
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: "IGNORED" });
  });

  it("a sendEvent failure answers 503, so Mux retries", async () => {
    const job = await renderingJob();
    await setUpload(job.renderJobId, "uploadDown");
    const response = await handleMuxWebhook(
      await signed(assetReady(job.renderJobId, "uploadDown")),
      {
        ...renderWebhookHooks(
          {
            get: () =>
              Promise.resolve({
                sendEvent: () => Promise.reject(new Error("engine down")),
                status: () => Promise.resolve({ status: "waiting" as const }),
              }),
          },
          db
        ),
        environment: "dev",
        kv: createMemoryKv(),
        limit: () => Promise.resolve(true),
        secret: MUX_WEBHOOK_TEST_SECRET,
      }
    );
    expect(response.status).toBe(503);
  });
});
