import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMux, type Mux } from "../client";
import { assetIdForPlayback, enableMasterAccess, masterState } from "../master";
import { createRenderUpload } from "../render-upload";
import { cancelUpload, getUpload } from "../uploads";
import { verifyMuxWebhook } from "../webhooks";
import { FAKE_MUX_TOKEN } from "./fake-mux";
import { startFakeMuxServer } from "./fake-server";

const SECRET = "fake-server-render-secret";
const masterBytes = new Uint8Array(Array.from({ length: 64 }, (_, i) => i));
const masterFile = join(
  mkdtempSync(join(tmpdir(), "fake-mux-master-")),
  "source.mp4"
);
writeFileSync(masterFile, masterBytes);

const emitted: string[] = [];
const sink = Bun.serve({
  fetch: async (request) => {
    const event = await verifyMuxWebhook(
      await request.text(),
      request.headers,
      SECRET,
      Date.now()
    );
    emitted.push(event.type);
    return new Response(null, { status: 202 });
  },
  port: 0,
});

const server = startFakeMuxServer({
  masterFile,
  readyAfterMs: 20,
  webhook: { secret: SECRET, url: `http://localhost:${sink.port}/` },
});

const mux = createMux({
  MUX_API_URL: server.url,
  MUX_TOKEN_ID: FAKE_MUX_TOKEN.id,
  MUX_TOKEN_SECRET: FAKE_MUX_TOKEN.secret,
}) as Mux;

afterAll(async () => {
  await server.stop();
  await sink.stop(true);
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

async function readyMasterUrl(assetId: string): Promise<string> {
  let url: string | null = null;
  await until(async () => {
    const state = await masterState(mux, assetId);
    url = state.status === "ready" ? state.url : null;
    return url !== null;
  });
  return url as unknown as string;
}

describe("the fake Mux server for renders", () => {
  it("readies the master after master access and serves the fixture, with ranges", async () => {
    const asset = server.fake.addAsset();
    expect(await assetIdForPlayback(mux, asset.playbackId as string)).toBe(
      asset.id
    );
    expect(await enableMasterAccess(mux, asset.id)).toBe("enabled");
    const url = await readyMasterUrl(asset.id);
    expect(new URL(url).origin).toBe(server.url);

    const whole = await fetch(url);
    expect(whole.status).toBe(200);
    expect(whole.headers.get("content-type")).toBe("video/mp4");
    expect(whole.headers.get("accept-ranges")).toBe("bytes");
    expect(new Uint8Array(await whole.arrayBuffer())).toEqual(masterBytes);

    const part = await fetch(url, { headers: { range: "bytes=4-7" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 4-7/64");
    expect(new Uint8Array(await part.arrayBuffer())).toEqual(
      new Uint8Array([4, 5, 6, 7])
    );

    const tail = await fetch(url, { headers: { range: "bytes=60-" } });
    expect(tail.headers.get("content-range")).toBe("bytes 60-63/64");

    const head = await fetch(url, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe("64");

    const suffix = await fetch(url, { headers: { range: "bytes=-4" } });
    expect(suffix.status).toBe(206);
    expect(suffix.headers.get("content-range")).toBe("bytes 60-63/64");

    const beyond = await fetch(url, { headers: { range: "bytes=100-" } });
    expect(beyond.status).toBe(416);
    expect(beyond.headers.get("content-range")).toBe("bytes */64");

    // An invalid range is ignored (RFC 9110): the whole file.
    for (const range of ["bytes=-", "bytes=5-2"]) {
      // biome-ignore lint/performance/noAwaitInLoops: one range at a time.
      const ignored = await fetch(url, { headers: { range } });
      expect(ignored.status).toBe(200);
      expect(ignored.headers.get("content-length")).toBe("64");
    }
  });

  it("takes a render's server-side PUT and serves the rendered file as its master", async () => {
    emitted.length = 0;
    const upload = await createRenderUpload(mux, {
      corsOrigin: "http://localhost:5173",
      renderJobId: "job-1",
      test: true,
    });
    const rendered = new Uint8Array([9, 8, 7]);
    const put = await fetch(upload.url, {
      body: rendered,
      headers: { "content-type": "video/mp4" },
      method: "PUT",
    });
    expect(put.status).toBe(200);
    const assetId = (await getUpload(mux, upload.id))?.assetId as string;
    expect(server.fake.assets.get(assetId)?.passthrough).toBe(
      "render-job:job-1"
    );
    await until(() => emitted.length === 2);
    expect(emitted).toEqual([
      "video.upload.asset_created",
      "video.asset.ready",
    ]);
    server.fake.readyMaster(assetId);
    const served = await fetch(await readyMasterUrl(assetId));
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(rendered);
  });

  it("cancels a waiting upload over HTTP, and a second cancel finds it final", async () => {
    const waiting = await createRenderUpload(mux, {
      corsOrigin: "http://localhost:5173",
      renderJobId: "job-2",
      test: false,
    });
    expect((await cancelUpload(mux, waiting.id)).state).toBe("cancelled");
    expect((await cancelUpload(mux, waiting.id)).state).toBe("already-final");
  });

  it("answers 404 for the master of an unknown asset", async () => {
    const response = await fetch(`${server.url}/master/nope/master.mp4`);
    expect(response.status).toBe(404);
  });

  it("emits a signed webhook on demand (emitWebhook and /__fake/webhook)", async () => {
    emitted.length = 0;
    expect(
      await server.emitWebhook({
        data: { id: "up-x", status: "cancelled" },
        type: "video.upload.cancelled",
      })
    ).toBe(202);
    const response = await fetch(`${server.url}/__fake/webhook`, {
      body: JSON.stringify({
        data: { id: "as-x", status: "ready" },
        type: "video.asset.ready",
      }),
      method: "POST",
    });
    expect(await response.json()).toEqual({ status: 202 });
    expect(emitted).toEqual(["video.upload.cancelled", "video.asset.ready"]);
  });
});
