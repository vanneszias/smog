import { describe, expect, it } from "bun:test";
import { toRenderMuxEvent } from "./render-events";
import type { MuxEvent } from "./webhooks";

const JOB = "00000000-0000-4000-8000-0000000000bb";
const PASSTHROUGH = `render-job:${JOB}`;

function event(type: string, data: Record<string, unknown>): MuxEvent {
  return { data, id: `ev-${type}`, type };
}

describe("toRenderMuxEvent", () => {
  it("reads video.asset.ready with its public playback id", () => {
    expect(
      toRenderMuxEvent(
        event("video.asset.ready", {
          id: "as-1",
          passthrough: PASSTHROUGH,
          playback_ids: [
            { id: "signed-pb", policy: "signed" },
            { id: "public-pb", policy: "public" },
          ],
          status: "ready",
          upload_id: "up-1",
        })
      )
    ).toEqual({
      assetId: "as-1",
      playbackId: "public-pb",
      renderJobId: JOB,
      type: "asset.ready",
      uploadId: "up-1",
    });
  });

  it("reads video.asset.errored with Mux's message", () => {
    expect(
      toRenderMuxEvent(
        event("video.asset.errored", {
          errors: { messages: ["Invalid", "input"], type: "invalid_input" },
          id: "as-2",
          passthrough: PASSTHROUGH,
          status: "errored",
          upload_id: "up-2",
        })
      )
    ).toEqual({
      assetId: "as-2",
      error: "Invalid input",
      renderJobId: JOB,
      type: "asset.errored",
      uploadId: "up-2",
    });
  });

  it("reads video.upload.errored and video.upload.cancelled", () => {
    expect(
      toRenderMuxEvent(
        event("video.upload.errored", {
          error: { message: "Bad file", type: "invalid_input" },
          id: "up-3",
          new_asset_settings: { passthrough: PASSTHROUGH },
          status: "errored",
        })
      )
    ).toEqual({
      error: "Bad file",
      renderJobId: JOB,
      type: "upload.errored",
      uploadId: "up-3",
    });
    expect(
      toRenderMuxEvent(
        event("video.upload.cancelled", {
          id: "up-4",
          new_asset_settings: { passthrough: PASSTHROUGH },
          status: "cancelled",
        })
      )
    ).toEqual({
      renderJobId: JOB,
      type: "upload.cancelled",
      uploadId: "up-4",
    });
  });

  it("is null for another passthrough, another type or no upload id", () => {
    const gesture = event("video.asset.ready", {
      id: "as-5",
      passthrough: "gesture-upload:abc",
      status: "ready",
      upload_id: "up-5",
    });
    const created = event("video.upload.asset_created", {
      asset_id: "as-6",
      id: "up-6",
      new_asset_settings: { passthrough: PASSTHROUGH },
      status: "asset_created",
    });
    const masterReady = event("video.asset.master.ready", {
      id: "as-7",
      passthrough: PASSTHROUGH,
      status: "ready",
      upload_id: "up-7",
    });
    const noUpload = event("video.asset.ready", {
      id: "as-8",
      passthrough: PASSTHROUGH,
      status: "ready",
    });
    const unreadable = event("video.asset.ready", {
      passthrough: PASSTHROUGH,
    });
    for (const candidate of [
      gesture,
      created,
      masterReady,
      noUpload,
      unreadable,
    ]) {
      expect(toRenderMuxEvent(candidate)).toBeNull();
    }
  });
});
