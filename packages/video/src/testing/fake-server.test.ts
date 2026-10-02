import { afterAll, describe, expect, it } from "bun:test";
import { getAsset } from "../assets";
import { createMux } from "../client";
import { createDirectUpload, getUpload } from "../uploads";
import { verifyMuxWebhook } from "../webhooks";
import { FAKE_MUX_TOKEN } from "./fake-mux";
import { startFakeMuxServer } from "./fake-server";

const SECRET = "fake-server-webhook-secret";
const received: string[] = [];

const receiver = Bun.serve({
  fetch: async (request) => {
    const body = await request.text();
    const event = await verifyMuxWebhook(
      body,
      request.headers,
      SECRET,
      Date.now()
    );
    received.push(event.type);
    return new Response(null, { status: 200 });
  },
  port: 0,
});

const server = startFakeMuxServer({
  readyAfterMs: 20,
  webhook: { secret: SECRET, url: `http://localhost:${receiver.port}/` },
});

afterAll(async () => {
  await server.stop();
  await receiver.stop(true);
});

async function until(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 3000;
  // biome-ignore lint/performance/noAwaitInLoops: polling a condition.
  while (!(await check())) {
    if (Date.now() > deadline) {
      throw new Error("timed out");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("the fake Mux server", () => {
  it("takes the browser's PUT with CORS, then readies the asset and signs the webhooks", async () => {
    const mux = createMux({
      MUX_API_URL: server.url,
      MUX_TOKEN_ID: FAKE_MUX_TOKEN.id,
      MUX_TOKEN_SECRET: FAKE_MUX_TOKEN.secret,
    });
    if (!mux) {
      throw new Error("expected a client");
    }
    const upload = await createDirectUpload(mux, {
      corsOrigin: "http://localhost:5173",
      passthrough: "gesture-upload:e2e",
      test: true,
    });
    expect(new URL(upload.url).origin).toBe(server.url);

    const preflight = await fetch(upload.url, {
      headers: {
        "access-control-request-method": "PUT",
        origin: "http://localhost:5173",
      },
      method: "OPTIONS",
    });
    expect(preflight.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173"
    );

    const put = await fetch(upload.url, {
      body: new Uint8Array([1, 2, 3]),
      headers: { origin: "http://localhost:5173" },
      method: "PUT",
    });
    expect(put.status).toBe(200);

    const assetId = (await getUpload(mux, upload.id))?.assetId;
    expect(assetId).toBeString();
    await until(
      async () => (await getAsset(mux, assetId as string))?.status === "ready"
    );
    await until(() => received.length === 2);
    expect(received).toEqual([
      "video.upload.asset_created",
      "video.asset.ready",
    ]);
  });
});
