import { describe, expect, it } from "bun:test";
import {
  AA_BODY,
  AA_LARGE,
  CONTRAST_PAIRS,
  type ContrastPair,
  contrastRatio,
  NON_TEXT_ROLES,
} from "./contrast";
import { type ColorRole, tokens } from "./tokens";

const HEX_ERROR = /hex/i;

describe("contrastRatio", () => {
  it("returns 21 for black on white", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
  });

  it("returns 1 for identical colours", () => {
    expect(contrastRatio("#00805F", "#00805F")).toBeCloseTo(1, 5);
  });

  it("matches WebAIM's published AA boundary greys on white", () => {
    expect(contrastRatio("#767676", "#FFFFFF")).toBeCloseTo(4.54, 2);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
  });

  it("is symmetric and case-insensitive", () => {
    expect(contrastRatio("#ee971c", "#0F1210")).toBeCloseTo(
      contrastRatio("#0F1210", "#EE971C"),
      10
    );
  });

  it("rejects anything that is not a six-digit hex colour", () => {
    expect(() => contrastRatio("#FFF", "#000000")).toThrow(HEX_ERROR);
    expect(() => contrastRatio("red", "#000000")).toThrow(HEX_ERROR);
  });
});

describe("contrast pairs", () => {
  it("put every colour role in a pair or in the non-text list", () => {
    const paired = new Set(
      CONTRAST_PAIRS.flatMap((pair) => [pair.foreground, pair.background])
    );
    for (const role of Object.keys(tokens.color.light) as ColorRole[]) {
      expect({
        covered: paired.has(role) !== NON_TEXT_ROLES.includes(role),
        role,
      }).toEqual({
        covered: true,
        role,
      });
    }
  });

  it("hold every *Strong text role to body contrast on its tint", () => {
    for (const hue of ["primary", "success", "warning", "danger"] as const) {
      expect(CONTRAST_PAIRS).toContainEqual({
        background: `${hue}Subtle`,
        foreground: `${hue}Strong`,
        min: AA_BODY,
      });
    }
    expect(CONTRAST_PAIRS).toContainEqual({
      background: "accent",
      foreground: "accentForeground",
      min: AA_BODY,
    });
  });

  it("cover every text colour role on every background role", () => {
    const bodyText = CONTRAST_PAIRS.filter((pair) => pair.min === AA_BODY);
    for (const foreground of ["foreground", "foregroundMuted"] as const) {
      for (const background of [
        "background",
        "surface",
        "surfaceRaised",
        "surfaceSunken",
      ] as const) {
        expect(bodyText).toContainEqual({
          background,
          foreground,
          min: AA_BODY,
        });
      }
    }
  });

  it("hold primary on background to the large-text/UI minimum", () => {
    expect(CONTRAST_PAIRS).toContainEqual({
      background: "background",
      foreground: "primary",
      min: AA_LARGE,
    });
  });
});

describe.each(["light", "dark"] as const)("%s theme", (theme) => {
  const colours = tokens.color[theme];

  it.each(
    CONTRAST_PAIRS.map((pair: ContrastPair) => [
      `${pair.foreground} on ${pair.background} ≥ ${pair.min}`,
      pair,
    ])
  )("%s", (_name, pair) => {
    const { foreground, background, min } = pair as ContrastPair;
    const ratio = contrastRatio(colours[foreground], colours[background]);
    expect(ratio).toBeGreaterThanOrEqual(min);
  });
});

describe("brand", () => {
  it("keeps the brand green as the light primary", () => {
    expect(tokens.color.light.primary).toBe("#00805F");
    expect(tokens.color.brand.green).toBe("#00805F");
    expect(tokens.color.brand.orange).toBe("#EE971C");
  });
});
