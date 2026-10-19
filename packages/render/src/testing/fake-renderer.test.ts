import { describe, expect, it } from "bun:test";
import type { RenderRequest } from "../contract";
import { createFakeRenderer, FAKE_RENDER_RESULT } from "./index";

const REQUEST: RenderRequest = {
  input: {
    displayName: "Acme BV",
    logoKey: null,
    sourcePlaybackId: "playback-1",
    v: 1,
  },
  logoDataUrl: null,
  renderJobId: "6f1c2a4e-8b3d-4f7a-9c2e-1d5b7a9e3f20",
  sourceUrl: "https://stream.mux.com/playback-1/highest.mp4",
  uploadUrl: "https://storage.googleapis.com/video-uploads/x",
  v: 1,
};

describe("createFakeRenderer", () => {
  it("answers a successful render by default and records the request", async () => {
    const renderer = createFakeRenderer();
    expect(await renderer.render(REQUEST)).toEqual(FAKE_RENDER_RESULT);
    expect(renderer.requests).toEqual([REQUEST]);
    expect(FAKE_RENDER_RESULT.ok).toBe(true);
  });

  it("answers the given result, or one computed from the request", async () => {
    const failure = {
      code: "sourceUnreadable" as const,
      message: "no video track",
      ok: false as const,
    };
    expect(
      await createFakeRenderer({ result: failure }).render(REQUEST)
    ).toEqual(failure);
    const computed = createFakeRenderer({
      result: (request) => ({
        code: "busy",
        message: request.renderJobId,
        ok: false,
      }),
    });
    expect(await computed.render(REQUEST)).toEqual({
      code: "busy",
      message: REQUEST.renderJobId,
      ok: false,
    });
  });

  it("throws the given error, as a network fault would", async () => {
    const renderer = createFakeRenderer({ error: new Error("socket hang up") });
    await expect(renderer.render(REQUEST)).rejects.toThrow("socket hang up");
    expect(renderer.requests).toHaveLength(1);
  });

  it("answers invalidInput for a request the real server would refuse", async () => {
    const renderer = createFakeRenderer();
    const result = await renderer.render({
      ...REQUEST,
      renderJobId: "not-a-uuid",
    });
    expect(result).toMatchObject({ code: "invalidInput", ok: false });
  });

  it("refuses an invalid request at once, before the delay or the error", async () => {
    const renderer = createFakeRenderer({
      delayMs: 5000,
      error: new Error("socket hang up"),
    });
    const started = performance.now();
    const result = await renderer.render({ ...REQUEST, v: 2 as 1 });
    expect(result).toMatchObject({ code: "invalidInput", ok: false });
    expect(performance.now() - started).toBeLessThan(1000);
    expect(renderer.requests).toHaveLength(1);
  });

  it("waits delayMs before answering", async () => {
    const renderer = createFakeRenderer({ delayMs: 30 });
    const started = performance.now();
    await renderer.render(REQUEST);
    expect(performance.now() - started).toBeGreaterThanOrEqual(25);
  });
});
