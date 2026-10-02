import { env, exports } from "cloudflare:workers";
import { signMuxWebhook } from "@smog/video/testing";
import { describe, expect, it } from "vitest";
import { MUX_WEBHOOK_TEST_SECRET } from "./mux-secret";

const ORIGIN = "http://localhost:5173";
const PASSTHROUGH = "gesture-upload:00000000-0000-4000-8000-00000000abcd";

function readyEvent(uploadId: string) {
  return {
    created_at: new Date().toISOString(),
    data: {
      id: `asset-${uploadId}`,
      passthrough: PASSTHROUGH,
      playback_ids: [{ id: `pb-${uploadId}`, policy: "public" }],
      status: "ready",
      upload_id: uploadId,
    },
    id: crypto.randomUUID(),
    object: { id: `asset-${uploadId}`, type: "asset" },
    type: "video.asset.ready",
  };
}

async function deliver(
  body: string,
  signature: string | null,
  headers: Record<string, string> = {}
): Promise<Response> {
  return await exports.default.fetch(`${ORIGIN}/api/webhooks/mux`, {
    body,
    headers: {
      "cf-connecting-ip": crypto.randomUUID(),
      "content-type": "application/json",
      ...(signature ? { "mux-signature": signature } : {}),
      ...headers,
    },
    method: "POST",
  });
}

function kv(): KVNamespace {
  if (!env.KV) {
    throw new Error("[test] The KV binding is missing");
  }
  return env.KV;
}

describe("POST /api/webhooks/mux", () => {
  it("stores video.asset.ready for a gesture upload in KV", async () => {
    const uploadId = crypto.randomUUID();
    const body = JSON.stringify(readyEvent(uploadId));
    const response = await deliver(
      body,
      await signMuxWebhook(body, MUX_WEBHOOK_TEST_SECRET)
    );
    expect(response.status).toBe(200);
    const stored = await kv().get(`mux:upload:${uploadId}`, "json");
    expect(stored).toMatchObject({
      asset: {
        id: `asset-${uploadId}`,
        playbackId: `pb-${uploadId}`,
        status: "ready",
      },
      upload: "asset_created",
    });
  });

  it("answers 400 on a bad or missing signature and stores nothing", async () => {
    const uploadId = crypto.randomUUID();
    const body = JSON.stringify(readyEvent(uploadId));
    const wrong = await deliver(body, await signMuxWebhook(body, "not-it"));
    const missing = await deliver(body, null);
    const stale = await deliver(
      body,
      await signMuxWebhook(
        body,
        MUX_WEBHOOK_TEST_SECRET,
        Math.floor(Date.now() / 1000) - 3600
      )
    );
    expect([wrong.status, missing.status, stale.status]).toEqual([
      400, 400, 400,
    ]);
    expect(await kv().get(`mux:upload:${uploadId}`)).toBeNull();
  });

  it("needs no cookie or same-origin headers (a cross-site POST from Mux)", async () => {
    const body = JSON.stringify(readyEvent(crypto.randomUUID()));
    const response = await deliver(
      body,
      await signMuxWebhook(body, MUX_WEBHOOK_TEST_SECRET),
      { origin: "https://mux.com", "sec-fetch-site": "cross-site" }
    );
    expect(response.status).toBe(200);
  });
});
