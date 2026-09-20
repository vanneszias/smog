import { describe, expect, it } from "vitest";
import { tokens } from "./tokens";

describe("tokens", () => {
  it("preserves the brand primary", () => {
    expect(tokens.color.brand.primary).toBe("#00805F");
  });

  it("preserves the brand secondary and accent", () => {
    expect(tokens.color.brand.secondary).toBe("#97C699");
    expect(tokens.color.brand.accent).toBe("#EE971C");
  });

  it("defines a light and a dark semantic theme", () => {
    expect(tokens.semantic.light).toBeDefined();
    expect(tokens.semantic.dark).toBeDefined();
  });

  it("defines the same semantic keys in both themes", () => {
    expect(Object.keys(tokens.semantic.light).sort()).toEqual(
      Object.keys(tokens.semantic.dark).sort()
    );
  });

  it("exposes a spacing scale in unitless numbers so native can use it", () => {
    expect(typeof tokens.spacing.md).toBe("number");
  });

  it("exposes a type scale with matching line heights", () => {
    expect(Object.keys(tokens.fontSize).sort()).toEqual(
      Object.keys(tokens.lineHeight).sort()
    );
  });
  it("anchors every brand ramp on the fixed brand value", () => {
    expect(tokens.color.brandScale.primary[600]).toBe(
      tokens.color.brand.primary
    );
    expect(tokens.color.brandScale.secondary[300]).toBe(
      tokens.color.brand.secondary
    );
    expect(tokens.color.brandScale.accent[500]).toBe(tokens.color.brand.accent);
    expect(tokens.color.brandScale.warning[400]).toBe(
      tokens.color.brand.warning
    );
    expect(tokens.color.brandScale.error[500]).toBe(tokens.color.brand.error);
  });

  it("gives every ramp the same eleven steps, light to dark", () => {
    const steps = [
      "50",
      "100",
      "200",
      "300",
      "400",
      "500",
      "600",
      "700",
      "800",
      "900",
      "950",
    ];
    for (const [name, ramp] of Object.entries(tokens.color.brandScale)) {
      expect(Object.keys(ramp), name).toEqual(steps);
      for (const value of Object.values(ramp)) {
        expect(value, name).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
    expect(Object.keys(tokens.color.neutral)).toEqual(steps);
  });

  it("draws every semantic value from the palette rather than a loose hex", () => {
    const palette = new Set<string>([
      tokens.color.white,
      ...Object.values(tokens.color.neutral),
      ...Object.values(tokens.color.brandScale).flatMap((ramp) =>
        Object.values(ramp)
      ),
    ]);

    for (const theme of Object.values(tokens.semantic)) {
      for (const [role, value] of Object.entries(theme)) {
        expect(palette.has(value), `${role} = ${value}`).toBe(true);
      }
    }
  });
});
