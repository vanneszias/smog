import { describe, expect, it } from "bun:test";
import type { Mux } from "./client";
import type { RenderMuxEvent } from "./render-events";
import { createFakeMux, createMemoryKv, signMuxWebhook } from "./testing";
import { muxEventKey, readUploadState } from "./upload-state";
import { handleMuxWebhook, type MuxWebhookOptions } from "./webhook-handler";

const SECRET = "mux-webhook-render-secret";
const URL_ = "https://smog.test/api/webhooks/mux";
const JOB = "00000000-0000-4000-8000-0000000000cc";
const PASSTHROUGH = `render-job:production:${JOB}`;

let sequence = 0;

function event(type: string, data: Record<string, unknown>) {
  sequence += 1;
  return {
    created_at: new Date().toISOString(),
    data,
    id: `render-event-${sequence}`,
    object: { id: String(data.id), type: type.split(".")[1] ?? "" },
    type,
  };
}

const assetReady = (
  uploadId: string,
  assetId: string,
  passthrough = PASSTHROUGH
) =>
  event("video.asset.ready", {
    id: assetId,
    passthrough,
    playback_ids: [{ id: "public-pb", policy: "public" }],
    status: "ready",
    upload_id: uploadId,
  });

type Hooks = Pick<
  MuxWebhookOptions,
  "isCurrentUpload" | "mux" | "onRenderEvent"
>;

async function deliver(
  body: unknown,
  kv: ReturnType<typeof createMemoryKv>,
  hooks: Hooks
) {
  const raw = JSON.stringify(body);
  const request = new Request(URL_, {
    body: raw,
    headers: {
      "content-type": "application/json",
      "mux-signature": await signMuxWebhook(raw, SECRET),
    },
    method: "POST",
  });
  const response = await handleMuxWebhook(request, {
    environment: "production",
    kv,
    limit: () => Promise.resolve(true),
    secret: SECRET,
    ...hooks,
  });
  return {
    code: ((await response.json()) as { code: string }).code,
    status: response.status,
  };
}

function recorder(answers: ("sent" | "gone" | Error)[] = []) {
  const forwarded: RenderMuxEvent[] = [];
  const onRenderEvent = (render: RenderMuxEvent) => {
    forwarded.push(render);
    const answer = answers.shift() ?? "sent";
    return answer instanceof Error
      ? Promise.reject(answer)
      : Promise.resolve(answer);
  };
  return { forwarded, onRenderEvent };
}

describe("handleMuxWebhook for render-job events", () => {
  it("forwards a render event once; a redelivery is a DUPLICATE", async () => {
    const kv = createMemoryKv();
    const { forwarded, onRenderEvent } = recorder();
    const ready = assetReady("up-1", "as-1");
    expect(await deliver(ready, kv, { onRenderEvent })).toEqual({
      code: "OK",
      status: 200,
    });
    expect(await deliver(ready, kv, { onRenderEvent })).toEqual({
      code: "DUPLICATE",
      status: 200,
    });
    expect(forwarded).toEqual([
      {
        assetId: "as-1",
        playbackId: "public-pb",
        renderJobId: JOB,
        type: "asset.ready",
        uploadId: "up-1",
      },
    ]);
    // Render events never touch the gesture upload records.
    expect(await readUploadState(kv, "up-1")).toBeNull();
    expect(await kv.get(muxEventKey(ready.id))).toBe("1");
  });

  it('answers 200 when the instance is "gone"', async () => {
    const kv = createMemoryKv();
    const { forwarded, onRenderEvent } = recorder(["gone"]);
    const ready = assetReady("up-2", "as-2");
    expect(await deliver(ready, kv, { onRenderEvent })).toEqual({
      code: "GONE",
      status: 200,
    });
    expect(forwarded).toHaveLength(1);
  });

  it("answers 503 without a dedupe marker when the hook throws, then forwards the retry", async () => {
    const kv = createMemoryKv();
    const { forwarded, onRenderEvent } = recorder([new Error("sendEvent")]);
    const errored = event("video.upload.errored", {
      error: { message: "Bad file", type: "invalid_input" },
      id: "up-3",
      new_asset_settings: { passthrough: PASSTHROUGH },
      status: "errored",
    });
    expect(await deliver(errored, kv, { onRenderEvent })).toEqual({
      code: "UNAVAILABLE",
      status: 503,
    });
    expect(await kv.get(muxEventKey(errored.id))).toBeNull();
    expect(await deliver(errored, kv, { onRenderEvent })).toEqual({
      code: "OK",
      status: 200,
    });
    expect(forwarded).toHaveLength(2);
    expect(forwarded[1]).toEqual({
      error: "Bad file",
      renderJobId: JOB,
      type: "upload.errored",
      uploadId: "up-3",
    });
  });

  it("deletes a non-current asset.ready's asset and does not forward it", async () => {
    const fake = createFakeMux();
    const asset = fake.addAsset({ passthrough: PASSTHROUGH, uploadId: "old" });
    const kv = createMemoryKv();
    const { forwarded, onRenderEvent } = recorder();
    const asked: [string, string, string][] = [];
    const isCurrentUpload = (
      renderJobId: string,
      uploadId: string,
      assetId: string
    ) => {
      asked.push([renderJobId, uploadId, assetId]);
      return Promise.resolve(false);
    };
    const ready = assetReady("old", asset.id);
    expect(
      await deliver(ready, kv, {
        isCurrentUpload,
        mux: fake.mux,
        onRenderEvent,
      })
    ).toEqual({ code: "SUPERSEDED", status: 200 });
    expect(asked).toEqual([[JOB, "old", asset.id]]);
    expect(forwarded).toEqual([]);
    expect(fake.assets.has(asset.id)).toBe(false);
    // The redelivery deletes nothing more.
    expect(
      await deliver(ready, kv, {
        isCurrentUpload,
        mux: fake.mux,
        onRenderEvent,
      })
    ).toEqual({ code: "DUPLICATE", status: 200 });
  });

  it("forwards a current asset.ready and keeps the asset", async () => {
    const fake = createFakeMux();
    const asset = fake.addAsset({ passthrough: PASSTHROUGH, uploadId: "cur" });
    const kv = createMemoryKv();
    const { forwarded, onRenderEvent } = recorder();
    const result = await deliver(assetReady("cur", asset.id), kv, {
      isCurrentUpload: () => Promise.resolve(true),
      mux: fake.mux,
      onRenderEvent,
    });
    expect(result).toEqual({ code: "OK", status: 200 });
    expect(forwarded).toHaveLength(1);
    expect(fake.assets.has(asset.id)).toBe(true);
  });

  it("deletes a non-current asset.errored's asset too, and does not forward it", async () => {
    const fake = createFakeMux();
    const asset = fake.addAsset({
      passthrough: PASSTHROUGH,
      status: "errored",
      uploadId: "old",
    });
    const kv = createMemoryKv();
    const { forwarded, onRenderEvent } = recorder();
    const errored = event("video.asset.errored", {
      errors: { messages: ["bad"], type: "invalid_input" },
      id: asset.id,
      passthrough: PASSTHROUGH,
      status: "errored",
      upload_id: "old",
    });
    expect(
      await deliver(errored, kv, {
        isCurrentUpload: () => Promise.resolve(false),
        mux: fake.mux,
        onRenderEvent,
      })
    ).toEqual({ code: "SUPERSEDED", status: 200 });
    expect(forwarded).toEqual([]);
    expect(fake.assets.has(asset.id)).toBe(false);
  });

  it("answers 503 when the forward succeeded but the marker write failed, and forwards the retry", async () => {
    const memory = createMemoryKv();
    let failPut = true;
    const kv = {
      ...memory,
      put: (
        key: string,
        value: string,
        options?: { expirationTtl?: number }
      ) => {
        if (failPut) {
          failPut = false;
          return Promise.reject(new Error("kv"));
        }
        return memory.put(key, value, options);
      },
    };
    const { forwarded, onRenderEvent } = recorder();
    const ready = assetReady("up-12", "as-12");
    expect(
      await deliver(ready, kv as typeof memory, { onRenderEvent })
    ).toEqual({ code: "UNAVAILABLE", status: 503 });
    expect(
      await deliver(ready, kv as typeof memory, { onRenderEvent })
    ).toEqual({ code: "OK", status: 200 });
    expect(forwarded).toHaveLength(2);
  });

  it("asks isCurrentUpload only for asset events", async () => {
    const kv = createMemoryKv();
    const { forwarded, onRenderEvent } = recorder();
    let asked = 0;
    const cancelled = event("video.upload.cancelled", {
      id: "up-4",
      new_asset_settings: { passthrough: PASSTHROUGH },
      status: "cancelled",
    });
    await deliver(cancelled, kv, {
      isCurrentUpload: () => {
        asked += 1;
        return Promise.resolve(false);
      },
      onRenderEvent,
    });
    expect(asked).toBe(0);
    expect(forwarded).toHaveLength(1);
  });

  it("answers 503 without a marker when the delete fails, so Mux retries it", async () => {
    const fake = createFakeMux();
    const asset = fake.addAsset({ passthrough: PASSTHROUGH, uploadId: "old" });
    const kv = createMemoryKv();
    const broken: Mux = {
      ...fake.mux,
      fetch: () => Promise.reject(new Error("network")),
    };
    const ready = assetReady("old", asset.id);
    const hooks = {
      isCurrentUpload: () => Promise.resolve(false),
      onRenderEvent: recorder().onRenderEvent,
    };
    expect(await deliver(ready, kv, { ...hooks, mux: broken })).toEqual({
      code: "UNAVAILABLE",
      status: 503,
    });
    expect(await kv.get(muxEventKey(ready.id))).toBeNull();
    expect(fake.assets.has(asset.id)).toBe(true);
    expect(await deliver(ready, kv, { ...hooks, mux: fake.mux })).toEqual({
      code: "SUPERSEDED",
      status: 200,
    });
    expect(fake.assets.has(asset.id)).toBe(false);
  });

  it("treats an asset Mux no longer knows as deleted (404)", async () => {
    const fake = createFakeMux();
    const kv = createMemoryKv();
    expect(
      await deliver(assetReady("old", "as-gone"), kv, {
        isCurrentUpload: () => Promise.resolve(false),
        mux: fake.mux,
        onRenderEvent: recorder().onRenderEvent,
      })
    ).toEqual({ code: "SUPERSEDED", status: 200 });
  });

  it("logs and keeps a superseded asset when Mux is not configured", async () => {
    const kv = createMemoryKv();
    const ready = assetReady("old", "as-10");
    expect(
      await deliver(ready, kv, {
        isCurrentUpload: () => Promise.resolve(false),
        mux: null,
        onRenderEvent: recorder().onRenderEvent,
      })
    ).toEqual({ code: "SUPERSEDED", status: 200 });
    expect(await kv.get(muxEventKey(ready.id))).toBe("1");
  });

  it("answers 503 when isCurrentUpload throws", async () => {
    const kv = createMemoryKv();
    const ready = assetReady("up-5", "as-5");
    expect(
      await deliver(ready, kv, {
        isCurrentUpload: () => Promise.reject(new Error("d1")),
        onRenderEvent: recorder().onRenderEvent,
      })
    ).toEqual({ code: "UNAVAILABLE", status: 503 });
    expect(await kv.get(muxEventKey(ready.id))).toBeNull();
  });

  it("logs and answers 200 without onRenderEvent, writing nothing", async () => {
    const kv = createMemoryKv();
    expect(await deliver(assetReady("up-6", "as-6"), kv, {})).toEqual({
      code: "IGNORED",
      status: 200,
    });
    expect(kv.size()).toBe(0);
  });

  it.each([
    ["another env's", `render-job:staging:${JOB}`],
    ["an untagged (phase 7)", `render-job:${JOB}`],
  ])(
    "ignores %s render event: no hook, no delete, no KV (phase 8 ruling 4)",
    async (_label, passthrough) => {
      const fake = createFakeMux();
      const asset = fake.addAsset({ passthrough, uploadId: "theirs" });
      const kv = createMemoryKv();
      const { forwarded, onRenderEvent } = recorder();
      let asked = 0;
      const hooks = {
        isCurrentUpload: () => {
          asked += 1;
          return Promise.resolve(false);
        },
        mux: fake.mux,
        onRenderEvent,
      };
      const errored = event("video.upload.errored", {
        error: { message: "Bad file", type: "invalid_input" },
        id: "theirs",
        new_asset_settings: { passthrough },
        status: "errored",
      });
      for (const body of [
        assetReady("theirs", asset.id, passthrough),
        errored,
      ]) {
        // biome-ignore lint/performance/noAwaitInLoops: deliveries in order.
        expect(await deliver(body, kv, hooks)).toEqual({
          code: "IGNORED",
          status: 200,
        });
      }
      expect(asked).toBe(0);
      expect(forwarded).toEqual([]);
      expect(fake.assets.has(asset.id)).toBe(true);
      expect(fake.requests).toEqual([]);
      expect(kv.size()).toBe(0);
    }
  );

  it("ignores this env's video.upload.asset_created (not routed, ruling 9)", async () => {
    const kv = createMemoryKv();
    const { forwarded, onRenderEvent } = recorder();
    const created = event("video.upload.asset_created", {
      asset_id: "as-created",
      id: "up-created",
      new_asset_settings: { passthrough: PASSTHROUGH },
      status: "asset_created",
    });
    expect(await deliver(created, kv, { onRenderEvent })).toEqual({
      code: "IGNORED",
      status: 200,
    });
    expect(forwarded).toEqual([]);
    expect(kv.size()).toBe(0);
  });

  it("asks this env's hook about its own job, which deletes an unknown job's asset", async () => {
    const fake = createFakeMux();
    const asset = fake.addAsset({ passthrough: PASSTHROUGH, uploadId: "x" });
    const kv = createMemoryKv();
    const { forwarded, onRenderEvent } = recorder();
    // The site's hook (`isCurrentRenderUpload`) answers false for a job
    // this env does not know (phase 8 ruling 12).
    expect(
      await deliver(assetReady("x", asset.id), kv, {
        isCurrentUpload: () => Promise.resolve(false),
        mux: fake.mux,
        onRenderEvent,
      })
    ).toEqual({ code: "SUPERSEDED", status: 200 });
    expect(forwarded).toEqual([]);
    expect(fake.assets.has(asset.id)).toBe(false);
  });

  it("leaves gesture uploads to the KV record, never to the hook", async () => {
    const kv = createMemoryKv();
    const { forwarded, onRenderEvent } = recorder();
    const gesture = assetReady(
      "up-7",
      "as-7",
      "gesture-upload:00000000-0000-4000-8000-000000000007"
    );
    expect(
      await deliver(gesture, kv, {
        isCurrentUpload: () => Promise.resolve(false),
        onRenderEvent,
      })
    ).toEqual({ code: "OK", status: 200 });
    expect(forwarded).toEqual([]);
    expect((await readUploadState(kv, "up-7"))?.asset).toEqual({
      id: "as-7",
      playbackId: "public-pb",
      status: "ready",
    });
  });
});
