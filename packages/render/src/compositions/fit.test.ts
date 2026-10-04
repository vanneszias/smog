import { describe, expect, it } from "bun:test";
import { RENDER_OVERLAY_LAYOUT } from "../contract";
import { overlayFontSize, type TextMeasure } from "./fit";

const { intro } = RENDER_OVERLAY_LAYOUT.text;

/** A fixed-advance font: every character is `advance` × the font size. */
function monospace(advance: number): TextMeasure {
  return (text, fontSize) => text.length * advance * fontSize;
}

describe("overlayFontSize", () => {
  it("keeps the old 3.8 % of the height for a short name", () => {
    const size = overlayFontSize({
      displayName: "SMOG & Co",
      height: 1920,
      intro,
      measure: monospace(0.5),
      width: 1080,
    });
    expect(size).toBeCloseTo(0.038 * 1920, 6);
  });

  it("shrinks 35 wide characters at 1080 × 1920 to fit 90 % of the width", () => {
    const measure = monospace(0.5);
    const displayName = "W".repeat(35);
    const size = overlayFontSize({
      displayName,
      height: 1920,
      intro,
      measure,
      width: 1080,
    });
    expect(size).toBeLessThan(0.038 * 1920);
    expect(measure(displayName, size)).toBeCloseTo(0.9 * 1080, 6);
    // Both lines share that size, and the shorter intro fits too.
    expect(measure(intro, size)).toBeLessThan(0.9 * 1080);
  });

  it("measures both lines at the base size and fits the wider one", () => {
    const calls: [string, number][] = [];
    const measure: TextMeasure = (text, fontSize) => {
      calls.push([text, fontSize]);
      return text === intro ? 2000 : 100;
    };
    const size = overlayFontSize({
      displayName: "A",
      height: 1000,
      intro,
      measure,
      width: 1000,
    });
    expect(calls.map(([text]) => text).sort()).toEqual(["A", intro].sort());
    expect(calls.every(([, fontSize]) => fontSize === 38)).toBe(true);
    expect(size).toBeCloseTo((38 * 900) / 2000, 6);
  });
});
