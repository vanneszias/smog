import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";
import { tokens } from "./tokens";

const AA_BODY = 4.5;
const AA_LARGE = 3;

describe("contrastRatio", () => {
  it("returns 21 for black on white", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
  });

  it("returns 1 for identical colors", () => {
    expect(contrastRatio("#00805F", "#00805F")).toBeCloseTo(1, 2);
  });

  it("matches the published ratio for the WCAG boundary grey on white", () => {
    // WebAIM's canonical example: #767676 is the lightest grey that clears AA
    // on white at 4.54:1, and #777777 is the one that just misses at 4.48:1.
    expect(contrastRatio("#767676", "#FFFFFF")).toBeCloseTo(4.54, 2);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
  });

  it("matches the published ratio for the AAA grey on white", () => {
    expect(contrastRatio("#595959", "#FFFFFF")).toBeCloseTo(7.0, 2);
  });

  it("matches the published ratio for white on pure blue", () => {
    expect(contrastRatio("#FFFFFF", "#0000FF")).toBeCloseTo(8.59, 2);
  });

  it("is symmetric, because a ratio has no foreground", () => {
    expect(contrastRatio("#EE971C", "#0E1013")).toBeCloseTo(
      contrastRatio("#0E1013", "#EE971C"),
      10
    );
  });

  it("accepts lowercase hex and a missing leading hash", () => {
    expect(contrastRatio("000000", "#ffffff")).toBeCloseTo(21, 1);
  });

  it("rejects anything that is not a six-digit hex colour", () => {
    expect(() => contrastRatio("#FFF", "#000000")).toThrow(/hex/i);
    expect(() => contrastRatio("rebeccapurple", "#000000")).toThrow(/hex/i);
  });
});

describe.each(["light", "dark"] as const)("%s theme contrast", (theme) => {
  const s = tokens.semantic[theme];

  const bodyPairs: [string, string, string][] = [
    ["foreground on background", s.foreground, s.background],
    ["foreground on surface", s.foreground, s.surface],
    ["foreground on surfaceRaised", s.foreground, s.surfaceRaised],
    ["foregroundMuted on background", s.foregroundMuted, s.background],
    ["foregroundMuted on surface", s.foregroundMuted, s.surface],
    ["primaryForeground on primary", s.primaryForeground, s.primary],
    ["accentForeground on accent", s.accentForeground, s.accent],
    ["dangerForeground on danger", s.dangerForeground, s.danger],
    ["warningForeground on warning", s.warningForeground, s.warning],
    ["successForeground on success", s.successForeground, s.success],
  ];

  it.each(bodyPairs)("%s meets AA body text", (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_BODY);
  });

  const uiPairs: [string, string, string][] = [
    ["border on background", s.border, s.background],
    ["border on surface", s.border, s.surface],
    ["borderStrong on background", s.borderStrong, s.background],
    ["ring on background", s.ring, s.background],
    ["ring on surface", s.ring, s.surface],
  ];

  it.each(uiPairs)("%s meets AA for UI boundaries", (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_LARGE);
  });

  /*
   * `borderSubtle` is deliberately exempt from 3:1 — WCAG 1.4.11 covers UI
   * components and meaningful graphics, not decoration. What must hold is that
   * the three border roles stay in strength order, so `borderSubtle` cannot be
   * quietly dropped in where `border` belongs without this failing.
   */
  it("keeps the three border roles in strength order", () => {
    const subtle = contrastRatio(s.borderSubtle, s.background);
    const functional = contrastRatio(s.border, s.background);
    const strong = contrastRatio(s.borderStrong, s.background);

    expect(subtle).toBeLessThan(functional);
    expect(functional).toBeLessThan(strong);
    expect(functional).toBeGreaterThanOrEqual(AA_LARGE);
  });
});

describe("surface hierarchy", () => {
  // A card must be distinguishable from the page behind it without relying
  // on its border. 1.06:1 is not a boundary anyone can see; WCAG's 3:1 is
  // for meaningful boundaries and is too strong for a fill, so this asserts
  // a modest but real step. Measured in a browser during Stage 2: light
  // `background` and `surfaceRaised` were literally the same #ffffff.
  /**
   * The floor is deliberately below both themes' actual values rather than
   * just under them. This guard exists to catch the regression Stage 2 shipped
   * — light `background` and `surfaceRaised` were both `#ffffff` (1.00) and
   * `surface` was 1.06 — not to pin an exact aesthetic.
   *
   * At 1.12 the dark theme cleared by 0.007 (1.127), which is 0.6% of
   * headroom: any future nudge to `neutral[900]` or `[950]` would fail a test
   * whose message points at a number rather than at the cause. A guard that
   * fires on legitimate work gets deleted, and then the real regression has
   * nothing standing in its way.
   *
   * 1.10 still fails hard on both original values while leaving room to move
   * the greys. Actuals when this was written: light 1.153, dark 1.127.
   */
  const MIN_SURFACE_STEP = 1.1;

  for (const theme of ["light", "dark"] as const) {
    it(`separates surface from background in the ${theme} theme`, () => {
      expect(
        contrastRatio(
          tokens.semantic[theme].surface,
          tokens.semantic[theme].background
        )
      ).toBeGreaterThanOrEqual(MIN_SURFACE_STEP);
      // If this failed: a card is no longer distinguishable from the page
      // behind it without its border. Move the theme's `background` further
      // from its surfaces; do not lower the floor.
    });

    it(`separates surfaceRaised from background in the ${theme} theme`, () => {
      expect(
        contrastRatio(
          tokens.semantic[theme].surfaceRaised,
          tokens.semantic[theme].background
        )
      ).toBeGreaterThanOrEqual(MIN_SURFACE_STEP);
      // If this failed: a card is no longer distinguishable from the page
      // behind it without its border. Move the theme's `background` further
      // from its surfaces; do not lower the floor.
    });
  }
});
