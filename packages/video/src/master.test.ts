import { describe, expect, it } from "bun:test";
import { MuxApiError } from "./client";
import { assetIdForPlayback, enableMasterAccess, masterState } from "./master";
import { createFakeMux } from "./testing";

describe("assetIdForPlayback", () => {
  it("finds the asset behind a playback id", async () => {
    const fake = createFakeMux();
    const asset = fake.addAsset();
    expect(await assetIdForPlayback(fake.mux, asset.playbackId as string)).toBe(
      asset.id
    );
    expect(fake.requests.at(-1)).toEqual({
      method: "GET",
      path: `/video/v1/playback-ids/${asset.playbackId}`,
    });
  });

  it("is null when Mux does not know the playback id (404)", async () => {
    const fake = createFakeMux();
    expect(await assetIdForPlayback(fake.mux, "unknown")).toBeNull();
  });

  it("is null for a live stream's playback id", async () => {
    const { mux } = createFakeMux();
    const live = {
      ...mux,
      fetch: () =>
        Promise.resolve(
          Response.json({
            data: {
              id: "pb",
              object: { id: "ls-1", type: "live_stream" },
              policy: "public",
            },
          })
        ),
    };
    expect(await assetIdForPlayback(live, "pb")).toBeNull();
  });

  it("throws on any other failure", async () => {
    const fake = createFakeMux();
    fake.failNext(500);
    await expect(assetIdForPlayback(fake.mux, "pb")).rejects.toBeInstanceOf(
      MuxApiError
    );
  });
});

describe("enableMasterAccess", () => {
  it("turns temporary master access on once (enable twice → one PUT)", async () => {
    const fake = createFakeMux();
    const asset = fake.addAsset();
    expect(await enableMasterAccess(fake.mux, asset.id)).toBe("enabled");
    expect(await enableMasterAccess(fake.mux, asset.id)).toBe("already-on");
    const puts = fake.requests.filter((request) => request.method === "PUT");
    expect(puts).toEqual([
      {
        body: { master_access: "temporary" },
        method: "PUT",
        path: `/video/v1/assets/${asset.id}/master-access`,
      },
    ]);
    expect(fake.assets.get(asset.id)?.masterAccess).toBe("temporary");
  });

  it("is missing for an unknown asset and sends no PUT", async () => {
    const fake = createFakeMux();
    expect(await enableMasterAccess(fake.mux, "gone")).toBe("missing");
    expect(fake.requests.some((request) => request.method === "PUT")).toBe(
      false
    );
  });
});

describe("masterState", () => {
  it("walks none → preparing → ready (with the URL)", async () => {
    const fake = createFakeMux();
    const asset = fake.addAsset();
    expect(await masterState(fake.mux, asset.id)).toEqual({ status: "none" });
    await enableMasterAccess(fake.mux, asset.id);
    expect(await masterState(fake.mux, asset.id)).toEqual({
      status: "preparing",
    });
    const ready = fake.readyMaster(asset.id);
    expect(await masterState(fake.mux, asset.id)).toEqual({
      status: "ready",
      url: ready.master?.url as string,
    });
  });

  it("reports an errored master", async () => {
    const fake = createFakeMux();
    const asset = fake.addAsset();
    await enableMasterAccess(fake.mux, asset.id);
    fake.errorMaster(asset.id);
    expect(await masterState(fake.mux, asset.id)).toEqual({
      status: "errored",
    });
  });

  it("is none for an unknown asset", async () => {
    const fake = createFakeMux();
    expect(await masterState(fake.mux, "gone")).toEqual({ status: "none" });
  });

  it("is preparing for a ready master without a URL or an unknown status", async () => {
    const fake = createFakeMux();
    const asset = fake.addAsset();
    fake.assets.set(asset.id, {
      ...asset,
      master: { status: "ready" },
      masterAccess: "temporary",
    });
    expect(await masterState(fake.mux, asset.id)).toEqual({
      status: "preparing",
    });
    fake.assets.set(asset.id, {
      ...asset,
      master: { status: "archiving" },
      masterAccess: "temporary",
    });
    expect(await masterState(fake.mux, asset.id)).toEqual({
      status: "preparing",
    });
  });
});
