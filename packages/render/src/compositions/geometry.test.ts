import { describe, expect, it } from "bun:test";
import { RENDER_FPS } from "../contract";
import { overlayGeometry, overlayStartFrame, overlayTiming } from "./geometry";

describe("overlayGeometry (the old SponsorOverlay's formulas, the preset layout)", () => {
  it("at 1080 × 1920", () => {
    const fontSize = 0.04 * 1920;
    const geometry = overlayGeometry({ fontSize, height: 1920, width: 1080 });
    expect(geometry.logo.width).toBeCloseTo(162, 6);
    expect(geometry.logo.height).toBeCloseTo(288, 6);
    expect(geometry.logo.left + geometry.logo.width / 2).toBeCloseTo(540, 6);
    expect(geometry.logo.top + geometry.logo.height / 2).toBeCloseTo(1497.6, 6);
    expect(geometry.line1Top).toBeCloseTo(1632, 6);
    // Old: textY + lineHeight (1.2 × fontSize) + 0.3 × fontSize.
    expect(geometry.line2Top).toBeCloseTo(1632 + 1.5 * fontSize, 6);
  });

  it("at 720 × 1280", () => {
    const fontSize = 0.04 * 1280;
    const geometry = overlayGeometry({ fontSize, height: 1280, width: 720 });
    expect(geometry.logo.width).toBeCloseTo(0.15 * 720, 6);
    expect(geometry.logo.height).toBeCloseTo(0.15 * 1280, 6);
    expect(geometry.logo.left).toBeCloseTo(0.5 * 720 - (0.15 * 720) / 2, 6);
    expect(geometry.logo.top).toBeCloseTo(0.78 * 1280 - (0.15 * 1280) / 2, 6);
    expect(geometry.line1Top).toBeCloseTo(0.85 * 1280, 6);
    expect(geometry.line2Top).toBeCloseTo(0.85 * 1280 + 1.5 * fontSize, 6);
  });
});

describe("overlayTiming (the last 5 s, a 1 s spring and a 30 px slide)", () => {
  const fps = RENDER_FPS;
  const durationInFrames = 10 * fps;
  const start = overlayStartFrame({ durationInFrames, fps });

  it("starts 5 s before the end", () => {
    expect(start).toBe(durationInFrames - 5 * fps);
  });

  it("renders nothing before the start frame", () => {
    expect(overlayTiming({ durationInFrames, fps, frame: start - 1 })).toBe(
      null
    );
    expect(overlayTiming({ durationInFrames, fps, frame: 0 })).toBe(null);
  });

  it("fades in from 0 and slides up from 30 px at the start frame", () => {
    const timing = overlayTiming({ durationInFrames, fps, frame: start });
    expect(timing?.opacity).toBeCloseTo(0, 3);
    expect(timing?.translateY).toBeCloseTo(30, 3);
  });

  it("is in place one fade (1 s) after the start", () => {
    const timing = overlayTiming({ durationInFrames, fps, frame: start + fps });
    expect(timing?.opacity).toBeCloseTo(1, 2);
    // The damped spring settles to within half a pixel.
    expect(timing?.translateY).toBeCloseTo(0, 0);
    const last = overlayTiming({
      durationInFrames,
      fps,
      frame: durationInFrames - 1,
    });
    expect(last?.opacity).toBeCloseTo(1, 3);
  });

  it("shows the overlay from frame 0 on a 3 s clip", () => {
    const short = 3 * fps;
    expect(overlayStartFrame({ durationInFrames: short, fps })).toBeLessThan(0);
    const timing = overlayTiming({ durationInFrames: short, fps, frame: 0 });
    expect(timing).not.toBe(null);
    expect(timing?.opacity).toBeCloseTo(1, 2);
  });
});
