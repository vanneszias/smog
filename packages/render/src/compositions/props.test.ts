import { describe, expect, it } from "bun:test";
import { sponsoredVideoPropsSchema } from "./props";

const VALID = {
  background: { kind: "video", src: "https://stream.mux.com/abc/highest.mp4" },
  displayName: "SMOG & Co",
  durationInFrames: 150,
  height: 1920,
  logoUrl: null,
  width: 1080,
} as const;

function accepts(patch: Record<string, unknown>): boolean {
  return sponsoredVideoPropsSchema.safeParse({ ...VALID, ...patch }).success;
}

describe("sponsoredVideoPropsSchema", () => {
  it("accepts a video or an image background and an optional logo", () => {
    expect(accepts({})).toBe(true);
    expect(
      accepts({
        background: { kind: "image", src: "https://image.mux.com/abc/x.webp" },
        logoUrl: "blob:http://localhost:5173/1234",
      })
    ).toBe(true);
  });

  it("refuses odd sizes and sizes under 2", () => {
    expect(accepts({ width: 1081 })).toBe(false);
    expect(accepts({ height: 1919 })).toBe(false);
    expect(accepts({ width: 0 })).toBe(false);
    expect(accepts({ height: 2, width: 2 })).toBe(true);
  });

  it("refuses a display name of 36 characters or an empty one", () => {
    expect(accepts({ displayName: "x".repeat(35) })).toBe(true);
    expect(accepts({ displayName: "x".repeat(36) })).toBe(false);
    expect(accepts({ displayName: "" })).toBe(false);
  });

  it("refuses a duration under one frame and an unknown background", () => {
    expect(accepts({ durationInFrames: 0 })).toBe(false);
    expect(accepts({ durationInFrames: 1.5 })).toBe(false);
    expect(accepts({ background: { kind: "audio", src: "x" } })).toBe(false);
    expect(accepts({ background: { kind: "video", src: "" } })).toBe(false);
  });
});
