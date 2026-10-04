import { describe, expect, it } from "bun:test";
import { renderJobPassthroughOf, toRenderMuxEvent } from "./render-events";
import type { MuxEvent } from "./webhooks";

const JOB = "00000000-0000-4000-8000-0000000000bb";
const PASSTHROUGH = `render-job:production:${JOB}`;

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
        }),
        "production"
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
        }),
        "production"
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
        }),
        "production"
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
        }),
        "production"
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
      expect(toRenderMuxEvent(candidate, "production")).toBeNull();
    }
  });

  it("is null for another env's job and for the untagged phase 7 form (ruling 4)", () => {
    const ready = (passthrough: string) =>
      event("video.asset.ready", {
        id: "as-9",
        passthrough,
        status: "ready",
        upload_id: "up-9",
      });
    const cancelled = (passthrough: string) =>
      event("video.upload.cancelled", {
        id: "up-10",
        new_asset_settings: { passthrough },
        status: "cancelled",
      });
    for (const passthrough of [
      `render-job:staging:${JOB}`,
      `render-job:dev:${JOB}`,
      `render-job:${JOB}`,
    ]) {
      expect(toRenderMuxEvent(ready(passthrough), "production")).toBeNull();
      expect(toRenderMuxEvent(cancelled(passthrough), "production")).toBeNull();
      // Still a render job's event: the webhook ignores it explicitly.
      expect(renderJobPassthroughOf(ready(passthrough))).toBe(passthrough);
      expect(renderJobPassthroughOf(cancelled(passthrough))).toBe(passthrough);
    }
    expect(toRenderMuxEvent(ready(PASSTHROUGH), "production")).toMatchObject({
      renderJobId: JOB,
    });
  });

  it("renderJobPassthroughOf is null for a gesture upload or no passthrough", () => {
    expect(
      renderJobPassthroughOf(
        event("video.asset.ready", { id: "a", passthrough: "gesture-upload:x" })
      )
    ).toBeNull();
    expect(
      renderJobPassthroughOf(event("video.asset.ready", { id: "a" }))
    ).toBeNull();
  });
});
