import { describe, expect, it } from "bun:test";
import {
  RENDER_INPUT_VERSION,
  RENDER_OVERLAY_LAYOUT,
  renderInputSchema,
} from "./contract";

const VALID = {
  displayName: "Acme BV",
  logoKey: "logos/0b6c6d4e-6c43-4e1c-9a59-8a1b4c0d9e01",
  sourcePlaybackId: "VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU",
  v: 1 as const,
};

describe("renderInputSchema (v1, ruling 7)", () => {
  it("accepts the v1 input, with or without a logo", () => {
    expect(RENDER_INPUT_VERSION).toBe(1);
    expect(renderInputSchema.parse(VALID)).toEqual(VALID);
    expect(renderInputSchema.parse({ ...VALID, logoKey: null }).logoKey).toBe(
      null
    );
  });

  it("refuses another version, a missing logo key and a bad display name", () => {
    expect(renderInputSchema.safeParse({ ...VALID, v: 2 }).success).toBe(false);
    const { logoKey: _, ...noLogoKey } = VALID;
    expect(renderInputSchema.safeParse(noLogoKey).success).toBe(false);
    expect(
      renderInputSchema.safeParse({ ...VALID, displayName: "" }).success
    ).toBe(false);
    expect(
      renderInputSchema.safeParse({ ...VALID, displayName: "x".repeat(36) })
        .success
    ).toBe(false);
    expect(
      renderInputSchema.safeParse({ ...VALID, displayName: "x".repeat(35) })
        .success
    ).toBe(true);
    expect(
      renderInputSchema.safeParse({ ...VALID, sourcePlaybackId: "" }).success
    ).toBe(false);
  });

  it("reads a later optional field without failing (v1 ignores it)", () => {
    const parsed = renderInputSchema.parse({ ...VALID, future: "x" });
    expect(parsed).toMatchObject(VALID);
  });
});

describe("RENDER_OVERLAY_LAYOUT (spec §8.2, ruling 7.7)", () => {
  it("fixes the logo box, the text line and the colour", () => {
    expect(RENDER_OVERLAY_LAYOUT).toEqual({
      fadeInSeconds: 1,
      logo: { centerX: 0.5, centerY: 0.76, size: 0.22 },
      overlaySeconds: 5,
      slideUpPx: 30,
      text: {
        color: "#00805F",
        fontSize: 0.038,
        intro: "Met de warme steun van:",
        y: 0.87,
      },
    });
  });
});
