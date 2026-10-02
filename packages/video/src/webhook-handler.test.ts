import { describe, expect, it } from "bun:test";
import { createMemoryKv, signMuxWebhook } from "./testing";
import {
  applyMuxEvent,
  readUploadState,
  UPLOAD_STATE_TTL_SECONDS,
  uploadStateKey,
} from "./upload-state";
import { handleMuxWebhook, MUX_WEBHOOK_MAX_BYTES } from "./webhook-handler";

const SECRET = "mux-webhook-test-secret";
const URL_ = "https://smog.test/api/webhooks/mux";
const PASSTHROUGH = "gesture-upload:00000000-0000-4000-8000-000000000001";

let sequence = 0;

function event(type: string, data: Record<string, unknown>) {
  sequence += 1;
  return {
    created_at: new Date().toISOString(),
    data,
    id: `event-${sequence}`,
    object: { id: String(data.id), type: type.split(".")[1] ?? "" },
    type,
  };
}

async function deliver(
  body: unknown,
  {
    allow = true,
    kv = createMemoryKv(),
    secret = SECRET,
    signWith = SECRET,
  }: {
    allow?: boolean;
    kv?: ReturnType<typeof createMemoryKv>;
    /** `null`: not configured. */
    secret?: string | null;
    signWith?: string;
  } = {}
) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const signature = await signMuxWebhook(
    raw,
    signWith,
    Math.floor(Date.now() / 1000)
  );
  const request = new Request(URL_, {
    body: raw,
    headers: {
      "cf-connecting-ip": "203.0.113.9",
      "content-type": "application/json",
      "mux-signature": signature,
    },
    method: "POST",
  });
  const response = await handleMuxWebhook(request, {
    kv,
    limit: () => Promise.resolve(allow),
    secret: secret ?? undefined,
  });
  return { kv, response };
}

const uploadCreated = (uploadId: string, assetId: string) =>
  event("video.upload.asset_created", {
    asset_id: assetId,
    id: uploadId,
    new_asset_settings: { passthrough: PASSTHROUGH },
    status: "asset_created",
  });

const assetReady = (uploadId: string, assetId: string) =>
  event("video.asset.ready", {
    id: assetId,
    passthrough: PASSTHROUGH,
    playback_ids: [
      { id: "signed-pb", policy: "signed" },
      { id: "public-pb", policy: "public" },
    ],
    status: "ready",
    upload_id: uploadId,
  });

describe("handleMuxWebhook", () => {
  it("stores video.asset.ready for a gesture upload (24 h)", async () => {
    const { kv, response } = await deliver(assetReady("up-1", "as-1"));
    expect(response.status).toBe(200);
    expect(await readUploadState(kv, "up-1")).toMatchObject({
      asset: { id: "as-1", playbackId: "public-pb", status: "ready" },
      upload: "asset_created",
      uploadId: "up-1",
    });
    expect(kv.ttl(uploadStateKey("up-1"))).toBe(UPLOAD_STATE_TTL_SECONDS);
  });

  it("answers 400 on a bad signature and writes nothing", async () => {
    const { kv, response } = await deliver(assetReady("up-2", "as-2"), {
      signWith: "wrong",
    });
    expect(response.status).toBe(400);
    expect(kv.size()).toBe(0);
  });

  it("answers 400 on a missing signature", async () => {
    const kv = createMemoryKv();
    const response = await handleMuxWebhook(
      new Request(URL_, { body: "{}", method: "POST" }),
      { kv, limit: () => Promise.resolve(true), secret: SECRET }
    );
    expect(response.status).toBe(400);
  });

  it("answers 503 when the webhook secret is not configured", async () => {
    const { response } = await deliver(assetReady("up-3", "as-3"), {
      secret: null,
    });
    expect(response.status).toBe(503);
  });

  it("counts only rejected deliveries against the rate limit (429)", async () => {
    // Over the limit, a forged delivery is a 429 …
    const forged = await deliver(assetReady("up-4", "as-4"), {
      allow: false,
      signWith: "wrong",
    });
    expect(forged.response.status).toBe(429);
    // … and a genuine one is never limited.
    const genuine = await deliver(assetReady("up-4", "as-4"), {
      allow: false,
    });
    expect(genuine.response.status).toBe(200);
  });

  it("asks the limiter only for rejected deliveries", async () => {
    const keys: string[] = [];
    const limit = (key: string) => {
      keys.push(key);
      return Promise.resolve(true);
    };
    const body = JSON.stringify(assetReady("up-11", "as-11"));
    const signed = await signMuxWebhook(body, SECRET);
    const request = (signature: string) =>
      new Request(URL_, {
        body,
        headers: {
          "cf-connecting-ip": "203.0.113.7",
          "mux-signature": signature,
        },
        method: "POST",
      });
    const kv = createMemoryKv();
    await handleMuxWebhook(request(signed), { kv, limit, secret: SECRET });
    expect(keys).toEqual([]);
    await handleMuxWebhook(request("t=1,v1=00"), { kv, limit, secret: SECRET });
    expect(keys).toEqual(["mux-webhook:203.0.113.7"]);
  });

  it(`answers 413 above ${MUX_WEBHOOK_MAX_BYTES} bytes`, async () => {
    const big = {
      pad: "x".repeat(MUX_WEBHOOK_MAX_BYTES),
      ...assetReady("u", "a"),
    };
    const { response } = await deliver(big);
    expect(response.status).toBe(413);
  });

  it("ignores other events and other passthroughs with 200", async () => {
    const kv = createMemoryKv();
    const other = event("video.asset.created", {
      id: "as-5",
      status: "preparing",
    });
    const render = event("video.asset.ready", {
      id: "as-6",
      passthrough: "render:job-1",
      status: "ready",
      upload_id: "up-6",
    });
    expect((await deliver(other, { kv })).response.status).toBe(200);
    expect((await deliver(render, { kv })).response.status).toBe(200);
    expect(await readUploadState(kv, "up-6")).toBeNull();
    // Ignored events are idempotent already: no dedupe marker, no KV at all.
    expect(kv.size()).toBe(0);
  });

  it("is idempotent per event id", async () => {
    const kv = createMemoryKv();
    const ready = assetReady("up-7", "as-7");
    await deliver(ready, { kv });
    // A later, different event, then the first one redelivered.
    const errored = event("video.asset.errored", {
      errors: { messages: ["bad file"], type: "invalid_input" },
      id: "as-7",
      passthrough: PASSTHROUGH,
      status: "errored",
      upload_id: "up-7",
    });
    await kv.delete(uploadStateKey("up-7"));
    await deliver(errored, { kv });
    const { response } = await deliver(ready, { kv });
    expect(response.status).toBe(200);
    expect((await readUploadState(kv, "up-7"))?.asset?.status).toBe("errored");
  });

  it("records upload errors and cancellations", async () => {
    const kv = createMemoryKv();
    await deliver(
      event("video.upload.errored", {
        error: { message: "Unsupported file", type: "invalid_input" },
        id: "up-8",
        new_asset_settings: { passthrough: PASSTHROUGH },
        status: "errored",
      }),
      { kv }
    );
    await deliver(
      event("video.upload.cancelled", {
        id: "up-9",
        new_asset_settings: { passthrough: PASSTHROUGH },
        status: "cancelled",
      }),
      { kv }
    );
    expect(await readUploadState(kv, "up-8")).toMatchObject({
      error: "Unsupported file",
      upload: "errored",
    });
    expect((await readUploadState(kv, "up-9"))?.upload).toBe("cancelled");
  });

  it("never downgrades a ready asset (out-of-order delivery)", async () => {
    const kv = createMemoryKv();
    await deliver(assetReady("up-10", "as-10"), { kv });
    await deliver(uploadCreated("up-10", "as-10"), { kv });
    expect((await readUploadState(kv, "up-10"))?.asset).toEqual({
      id: "as-10",
      playbackId: "public-pb",
      status: "ready",
    });
  });
});

describe("applyMuxEvent", () => {
  it("marks the asset preparing on video.upload.asset_created", () => {
    const next = applyMuxEvent(null, uploadCreated("up-1", "as-1"), 5);
    expect(next).toEqual({
      asset: { id: "as-1", status: "preparing" },
      updatedAt: 5,
      upload: "asset_created",
      uploadId: "up-1",
    });
  });

  it("is null for an event without an upload id", () => {
    const orphan = event("video.asset.ready", {
      id: "as-1",
      passthrough: PASSTHROUGH,
      status: "ready",
    });
    expect(applyMuxEvent(null, orphan, 1)).toBeNull();
  });
});
