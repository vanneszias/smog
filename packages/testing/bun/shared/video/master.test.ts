import { describe, expect, it } from "bun:test";
import { MuxApiError } from "../../../../video/src/client";
import { assetIdForPlayback } from "../../../../video/src/master";
import { createFakeMux } from "../../../support/video/index";

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
