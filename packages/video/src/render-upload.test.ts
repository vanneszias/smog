import { describe, expect, it } from "bun:test";
import { MuxApiError } from "./client";
import { createRenderUpload } from "./render-upload";
import { createFakeMux } from "./testing";
import {
  cancelUpload,
  createDirectUpload,
  isGestureUpload,
  isRenderJobPassthrough,
  RENDER_JOB_PREFIX,
  renderJobIdOf,
  renderJobPassthrough,
} from "./uploads";

const JOB_ID = "00000000-0000-4000-8000-0000000000aa";
const SITE_ORIGIN = "https://smog.test";

const render = (test = false) => ({
  corsOrigin: SITE_ORIGIN,
  environment: "staging" as const,
  renderJobId: JOB_ID,
  test,
});

describe("render-job passthroughs (phase 8 ruling 4)", () => {
  it("round-trips the job id within its env", () => {
    const passthrough = renderJobPassthrough("production", JOB_ID);
    expect(passthrough).toBe(`${RENDER_JOB_PREFIX}production:${JOB_ID}`);
    expect(renderJobIdOf(passthrough, "production")).toBe(JOB_ID);
    expect(isRenderJobPassthrough(passthrough)).toBe(true);
    expect(isGestureUpload(passthrough)).toBe(false);
  });

  it("is null for another env's job and for the untagged phase 7 form", () => {
    const staging = renderJobPassthrough("staging", JOB_ID);
    expect(renderJobIdOf(staging, "production")).toBeNull();
    expect(renderJobIdOf(staging, "dev")).toBeNull();
    expect(renderJobIdOf(`render-job:${JOB_ID}`, "production")).toBeNull();
    // Both are still render jobs' passthroughs: never a gesture upload's.
    expect(isRenderJobPassthrough(`render-job:${JOB_ID}`)).toBe(true);
  });

  it("is null for anything else", () => {
    expect(renderJobIdOf(null, "dev")).toBeNull();
    expect(renderJobIdOf(undefined, "dev")).toBeNull();
    expect(renderJobIdOf("render-job:", "dev")).toBeNull();
    expect(renderJobIdOf("render-job:dev:", "dev")).toBeNull();
    expect(renderJobIdOf("render:job-1", "dev")).toBeNull();
    expect(renderJobIdOf("gesture-upload:abc", "dev")).toBeNull();
    expect(isRenderJobPassthrough("gesture-upload:abc")).toBe(false);
    expect(isRenderJobPassthrough(null)).toBe(false);
  });
});

describe("createRenderUpload", () => {
  it("sends the env-tagged passthrough, public playback and the site origin as cors_origin, without master_access", async () => {
    const fake = createFakeMux();
    const upload = await createRenderUpload(fake.mux, render());
    expect(upload.url).toStartWith("https://");
    expect(upload.status).toBe("waiting");
    expect(upload.passthrough).toBe(`render-job:staging:${JOB_ID}`);
    expect(fake.requests.at(-1)).toEqual({
      body: {
        cors_origin: SITE_ORIGIN,
        new_asset_settings: {
          passthrough: `render-job:staging:${JOB_ID}`,
          playback_policies: ["public"],
        },
        timeout: 3600,
      },
      method: "POST",
      path: "/video/v1/uploads",
    });
  });

  it("sends test: true only when asked", async () => {
    const fake = createFakeMux();
    await createRenderUpload(fake.mux, render(true));
    expect(fake.requests.at(-1)?.body).toMatchObject({ test: true });
  });

  it("is refused by the fake without cors_origin (Mux's schema requires it)", async () => {
    const fake = createFakeMux();
    await expect(
      createDirectUpload(fake.mux, {
        corsOrigin: undefined as unknown as string,
        passthrough: "gesture-upload:x",
        test: false,
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("creates the asset with the upload's passthrough on the server's PUT", async () => {
    const fake = createFakeMux();
    const upload = await createRenderUpload(fake.mux, render());
    const put = await fake.fetch(upload.url, {
      body: new Uint8Array([0, 0, 0, 24]),
      headers: { "content-type": "video/mp4" },
      method: "PUT",
    });
    expect(put.status).toBe(200);
    const assetId = fake.uploads.get(upload.id)?.assetId as string;
    expect(fake.assets.get(assetId)?.passthrough).toBe(
      `render-job:staging:${JOB_ID}`
    );
    expect(fake.assets.get(assetId)?.file).toEqual(
      new Uint8Array([0, 0, 0, 24])
    );
  });
});

describe("cancelUpload", () => {
  it("cancels a waiting upload", async () => {
    const fake = createFakeMux();
    const upload = await createRenderUpload(fake.mux, render());
    expect(await cancelUpload(fake.mux, upload.id)).toEqual({
      assetId: null,
      state: "cancelled",
    });
    expect(fake.uploads.get(upload.id)?.status).toBe("cancelled");
    expect(fake.requests.at(-1)).toEqual({
      method: "PUT",
      path: `/video/v1/uploads/${upload.id}/cancel`,
    });
    // A second cancel finds it final.
    expect(await cancelUpload(fake.mux, upload.id)).toEqual({
      assetId: null,
      state: "already-final",
    });
  });

  it("leaves an upload that already has its asset, and names the asset", async () => {
    const fake = createFakeMux();
    const upload = await createRenderUpload(fake.mux, render());
    const asset = fake.completeUpload(upload.id);
    expect(await cancelUpload(fake.mux, upload.id)).toEqual({
      assetId: asset.id,
      state: "already-final",
    });
    expect(fake.uploads.get(upload.id)?.status).toBe("asset_created");
    expect(fake.assets.has(asset.id)).toBe(true);
  });

  it("is already-final for an upload Mux does not know", async () => {
    const fake = createFakeMux();
    expect(await cancelUpload(fake.mux, "unknown")).toEqual({
      assetId: null,
      state: "already-final",
    });
  });

  it("throws on a Mux outage", async () => {
    const fake = createFakeMux();
    fake.failNext(503);
    await expect(cancelUpload(fake.mux, "any")).rejects.toBeInstanceOf(
      MuxApiError
    );
  });

  it.each([401, 403, 429])(
    "rethrows %d without reading the upload",
    async (status) => {
      const fake = createFakeMux();
      const upload = await createRenderUpload(fake.mux, render());
      const before = fake.requests.length;
      fake.failNext(status);
      await expect(cancelUpload(fake.mux, upload.id)).rejects.toMatchObject({
        status,
      });
      expect(fake.requests.length).toBe(before + 1);
    }
  );

  it("rethrows a refusal while the upload is still waiting", async () => {
    const fake = createFakeMux();
    const upload = await createRenderUpload(fake.mux, render());
    fake.failNext(400);
    await expect(cancelUpload(fake.mux, upload.id)).rejects.toMatchObject({
      status: 400,
    });
    expect(fake.uploads.get(upload.id)?.status).toBe("waiting");
  });
});
