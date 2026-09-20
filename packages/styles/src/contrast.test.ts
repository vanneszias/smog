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
});
