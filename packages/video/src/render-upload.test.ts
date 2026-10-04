import { describe, expect, it } from "bun:test";
import { MuxApiError } from "./client";
import { createRenderUpload } from "./render-upload";
import { createFakeMux } from "./testing";
import {
  cancelUpload,
  isGestureUpload,
  RENDER_JOB_PREFIX,
  renderJobIdOf,
  renderJobPassthrough,
} from "./uploads";

const JOB_ID = "00000000-0000-4000-8000-0000000000aa";

describe("render-job passthroughs", () => {
  it("round-trips the job id", () => {
    const passthrough = renderJobPassthrough(JOB_ID);
    expect(passthrough).toBe(`${RENDER_JOB_PREFIX}${JOB_ID}`);
    expect(renderJobIdOf(passthrough)).toBe(JOB_ID);
    expect(isGestureUpload(passthrough)).toBe(false);
  });

  it("is null for anything else", () => {
    expect(renderJobIdOf(null)).toBeNull();
    expect(renderJobIdOf(undefined)).toBeNull();
    expect(renderJobIdOf("render-job:")).toBeNull();
    expect(renderJobIdOf("render:job-1")).toBeNull();
    expect(renderJobIdOf("gesture-upload:abc")).toBeNull();
  });
});

describe("createRenderUpload", () => {
  it("sends the passthrough and public playback, without cors_origin or master_access", async () => {
    const fake = createFakeMux();
    const upload = await createRenderUpload(fake.mux, {
      renderJobId: JOB_ID,
      test: false,
    });
    expect(upload.url).toStartWith("https://");
    expect(upload.status).toBe("waiting");
    expect(upload.passthrough).toBe(`render-job:${JOB_ID}`);
    expect(fake.requests.at(-1)).toEqual({
      body: {
        new_asset_settings: {
          passthrough: `render-job:${JOB_ID}`,
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
    await createRenderUpload(fake.mux, { renderJobId: JOB_ID, test: true });
    expect(fake.requests.at(-1)?.body).toMatchObject({ test: true });
  });

  it("creates the asset with the upload's passthrough on the server's PUT", async () => {
    const fake = createFakeMux();
    const upload = await createRenderUpload(fake.mux, {
      renderJobId: JOB_ID,
      test: false,
    });
    const put = await fake.fetch(upload.url, {
      body: new Uint8Array([0, 0, 0, 24]),
      headers: { "content-type": "video/mp4" },
      method: "PUT",
    });
    expect(put.status).toBe(200);
    const assetId = fake.uploads.get(upload.id)?.assetId as string;
    expect(fake.assets.get(assetId)?.passthrough).toBe(`render-job:${JOB_ID}`);
    expect(fake.assets.get(assetId)?.file).toEqual(
      new Uint8Array([0, 0, 0, 24])
    );
  });
});

describe("cancelUpload", () => {
  it("cancels a waiting upload", async () => {
    const fake = createFakeMux();
    const upload = await createRenderUpload(fake.mux, {
      renderJobId: JOB_ID,
      test: false,
    });
    expect(await cancelUpload(fake.mux, upload.id)).toBe("cancelled");
    expect(fake.uploads.get(upload.id)?.status).toBe("cancelled");
    expect(fake.requests.at(-1)).toEqual({
      method: "PUT",
      path: `/video/v1/uploads/${upload.id}/cancel`,
    });
    // A second cancel finds it final.
    expect(await cancelUpload(fake.mux, upload.id)).toBe("already-final");
  });

  it("leaves an upload that already has its asset (already-final)", async () => {
    const fake = createFakeMux();
    const upload = await createRenderUpload(fake.mux, {
      renderJobId: JOB_ID,
      test: false,
    });
    const asset = fake.completeUpload(upload.id);
    expect(await cancelUpload(fake.mux, upload.id)).toBe("already-final");
    expect(fake.uploads.get(upload.id)?.status).toBe("asset_created");
    expect(fake.assets.has(asset.id)).toBe(true);
  });

  it("is already-final for an upload Mux does not know", async () => {
    const fake = createFakeMux();
    expect(await cancelUpload(fake.mux, "unknown")).toBe("already-final");
  });

  it("throws on a Mux outage", async () => {
    const fake = createFakeMux();
    fake.failNext(503);
    await expect(cancelUpload(fake.mux, "any")).rejects.toBeInstanceOf(
      MuxApiError
    );
  });
});
