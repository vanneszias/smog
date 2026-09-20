import { describe, expect, it } from "vitest";
import {
  ANIMATION_DURATION,
  BORDER_RADIUS,
  colors,
  contrastRatio,
  FONT_SIZE,
  FONT_WEIGHT,
  HIT_SLOP,
  ICON_SIZE,
  SEARCHBAR_HEIGHT,
  SHADOWS,
  SPACING,
  themes,
  tokens,
} from "./index";

/**
 * The deprecated compatibility layer is the reason `apps/native` still
 * compiles. These assertions are written against the values the package
 * exported before the rewrite, taken from git, not from the new code.
 */

const PILL = 999;
const AA_BODY = 4.5;

describe("deprecated scales", () => {
  it("keeps the spacing scale byte for byte", () => {
    expect(SPACING).toEqual({ xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 });
  });

  it("keeps the radius scale, with round still a pill", () => {
    expect(Object.keys(BORDER_RADIUS).sort()).toEqual([
      "lg",
      "md",
      "round",
      "sm",
      "xl",
    ]);
    expect(BORDER_RADIUS.sm).toBe(8);
    expect(BORDER_RADIUS.md).toBe(12);
    expect(BORDER_RADIUS.lg).toBe(16);
    expect(BORDER_RADIUS.xl).toBe(20);
    expect(BORDER_RADIUS.round).toBeGreaterThanOrEqual(PILL);
  });

  it("keeps the animation durations", () => {
    expect(ANIMATION_DURATION).toEqual({ fast: 150, normal: 250, slow: 350 });
  });

  it("keeps the type and icon scales", () => {
    expect(FONT_SIZE).toEqual({
      xs: 12,
      sm: 14,
      md: 16,
      lg: 18,
      xl: 24,
      xxl: 32,
    });
    expect(FONT_WEIGHT).toEqual({
      regular: "400",
      medium: "500",
      semibold: "600",
      bold: "700",
    });
    expect(ICON_SIZE).toEqual({ sm: 16, md: 24, lg: 32, xl: 40 });
  });

  it("keeps the native touch and control sizes", () => {
    expect(SEARCHBAR_HEIGHT).toBe(56);
    expect(HIT_SLOP).toEqual({
      sm: { top: 8, bottom: 8, left: 8, right: 8 },
      md: { top: 12, bottom: 12, left: 12, right: 12 },
      lg: { top: 16, bottom: 16, left: 16, right: 16 },
    });
  });

  it("keeps the React Native shadow objects", () => {
    expect(SHADOWS).toEqual({
      small: {
        shadowColor: "#00805F",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
        elevation: 2,
      },
      medium: {
        shadowColor: "#00805F",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
        elevation: 3,
      },
      large: {
        shadowColor: "#00805F",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 5,
      },
    });
  });
});

describe("deprecated colour aliases", () => {
  const palette = new Set<string>([
    tokens.color.white,
    ...Object.values(tokens.color.neutral),
    ...Object.values(tokens.color.brandScale).flatMap((ramp) =>
      Object.values(ramp)
    ),
  ]);

  it("keeps every key the old flat colours object had", () => {
    expect(Object.keys(colors).sort()).toEqual([
      "accent",
      "background",
      "border",
      "error",
      "primary",
      "secondary",
      "shadow",
      "text",
      "textLight",
      "warning",
    ]);
  });

  it("keeps the brand values in the flat colours object unchanged", () => {
    expect(colors.primary).toBe("#00805F");
    expect(colors.secondary).toBe("#97C699");
    expect(colors.accent).toBe("#EE971C");
    expect(colors.warning).toBe("#F0C814");
    expect(colors.error).toBe("#FF3B30");
    expect(colors.shadow).toBe("#00805F");
    expect(colors.background).toBe("#FFFFFF");
  });

  it("keeps every key the old themes had, in both modes", () => {
    const keys = [
      "accent",
      "background",
      "border",
      "card",
      "error",
      "liked",
      "primary",
      "secondary",
      "statusBar",
      "text",
      "textLight",
      "warning",
    ];
    expect(Object.keys(themes.light).sort()).toEqual(keys);
    expect(Object.keys(themes.dark).sort()).toEqual(keys);
  });

  it("keeps the status bar polarity and the liked colour", () => {
    expect(themes.light.statusBar).toBe("dark");
    expect(themes.dark.statusBar).toBe("light");
    expect(themes.light.liked).toBe("#FF3B7D");
    expect(themes.dark.liked).toBe("#FF3B7D");
  });

  it("draws every deprecated colour from the token palette", () => {
    const values = [
      ...Object.values(colors),
      ...Object.values(themes.light),
      ...Object.values(themes.dark),
    ].filter((value) => value.startsWith("#") && value !== themes.light.liked);

    for (const value of values) {
      expect(palette.has(value), value).toBe(true);
    }
  });

  it("keeps the deprecated themes readable, not just well shaped", () => {
    for (const theme of [themes.light, themes.dark]) {
      expect(
        contrastRatio(theme.text, theme.background)
      ).toBeGreaterThanOrEqual(AA_BODY);
      expect(contrastRatio(theme.text, theme.card)).toBeGreaterThanOrEqual(
        AA_BODY
      );
      expect(contrastRatio(theme.textLight, theme.card)).toBeGreaterThanOrEqual(
        AA_BODY
      );
    }
  });

  it("keeps the light theme light and the dark theme dark", () => {
    expect(themes.light.background).toBe("#FFFFFF");
    expect(themes.dark.background).toBe(tokens.color.neutral[950]);
  });
});
