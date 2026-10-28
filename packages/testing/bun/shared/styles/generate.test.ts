import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { renderNativeTailwindConfig } from "../../../../styles/src/generate-native";
import { kebab, renderWebThemeCss } from "../../../../styles/src/generate-web";
import { nativeThemeVariables } from "../../../../styles/src/native-variables";
import { tokens } from "../../../../styles/src/tokens";

const SHADOW_1 = /--shadow-1: [^;]+;/;
const HEX_VALUE = /#[0-9A-Fa-f]{6}\b/g;
const GENERATED = new URL("../../../../styles/generated", import.meta.url)
  .pathname;

function committed(name: string): string {
  return readFileSync(join(GENERATED, name), "utf8");
}

describe("generated files (drift)", () => {
  it("theme.css equals a fresh render", () => {
    expect(committed("theme.css")).toBe(renderWebThemeCss());
  });

  it("tailwind-preset.cjs equals a fresh render", () => {
    expect(committed("tailwind-preset.cjs")).toBe(renderNativeTailwindConfig());
  });
});

describe("renderWebThemeCss", () => {
  const css = renderWebThemeCss();

  it("declares the dark variant on the .dark class", () => {
    expect(css).toContain("@custom-variant dark (&:where(.dark, .dark *));");
  });

  it("keeps Tailwind's default scales and resets only the colours", () => {
    expect(css).toContain("--color-*: initial;");
    for (const namespace of [
      "spacing",
      "radius",
      "text",
      "shadow",
      "ease",
      "breakpoint",
      "font-weight",
      "container",
    ]) {
      expect(css).not.toContain(`--${namespace}-*: initial;`);
    }
  });

  it("emits every colour role in light and overrides it in .dark", () => {
    const [theme = "", dark = ""] = css.split(".dark {");
    expect(theme).toContain("--color-popover: #FFFFFF;");
    expect(theme).toContain("--color-primary: #00805F;");
    expect(dark).toContain("--color-primary: #2BB38A;");
    expect(dark).toContain("--color-background: #0C110E;");
    expect(dark).toContain("color-scheme: dark;");
  });

  it("adds the touch target to the default spacing scale", () => {
    expect(css).toContain("--spacing-touch: 2.75rem;");
    expect(css).not.toContain("--spacing-4:");
  });

  it("emits the shadcn vocabulary in light and overrides it in .dark", () => {
    const [theme = "", dark = ""] = css.split(".dark {");
    for (const name of [
      "card",
      "popover",
      "secondary",
      "muted",
      "accent",
      "destructive",
      "input",
      "ring",
      "sidebar",
      "sidebar-primary",
      "sidebar-accent",
      "chart-1",
      "chart-5",
    ]) {
      expect(theme).toContain(`--color-${name}: #`);
      expect(dark).toContain(`--color-${name}: #`);
    }
  });

  it("emits radius, type, shadow, motion and breakpoints", () => {
    expect(css).toContain("--radius-md: 0.625rem;");
    expect(css).toContain("--radius-full: 9999px;");
    expect(css).toContain("--text-title-1: 1.75rem;");
    expect(css).toContain("--text-title-1--line-height: 2.125rem;");
    expect(css).toContain("--text-body-sm: 0.875rem;");
    expect(css).toContain("--font-weight-semibold: 600;");
    expect(css).toMatch(SHADOW_1);
    expect(css).toContain("--ease-standard: cubic-bezier(0.2, 0, 0, 1);");
    expect(css).toContain("--duration-fast: 120ms;");
    expect(css).toContain("--duration-slow: 320ms;");
    expect(css).toContain("--motion-pop-scale: 1.25;");
    expect(css).toContain("--breakpoint-lg: 64rem;");
    expect(css).toContain('--font-sans: Figtree, "Figtree Fallback",');
  });

  it("grows the display size from md", () => {
    expect(css).toContain("@media (width >= 48rem)");
    expect(css).toContain("--text-display: 3.5rem;");
  });

  it("turns durations off for reduced motion", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("writes no value that is not a token", () => {
    for (const hex of css.match(HEX_VALUE) ?? []) {
      const known = [
        ...Object.values(tokens.color.light),
        ...Object.values(tokens.color.dark),
        ...Object.values(tokens.color.brand),
      ];
      expect(known).toContain(hex);
    }
  });
});

interface Preset {
  corePlugins: Record<string, boolean>;
  darkMode: string;
  plugins: ((api: { addUtilities: (utilities: object) => void }) => void)[];
  theme: {
    colors: Record<string, string>;
    extend: {
      borderRadius: Record<string, string>;
      fontFamily: Record<string, string[]>;
      fontSize: Record<string, [string, { lineHeight: string }]>;
      lineHeight: Record<string, string>;
      spacing: Record<string, string>;
    };
  };
}

describe("renderNativeTailwindConfig", () => {
  const preset = createRequire(import.meta.url)(
    "../../../../styles/generated/tailwind-preset.cjs"
  ) as Preset;

  it("uses class-based dark mode", () => {
    expect(preset.darkMode).toBe("class");
  });

  it("turns off Tailwind's opacity variables", () => {
    // `bg-primary` would otherwise set `--tw-bg-opacity`, and css-interop
    // remounts a view that starts setting a variable after its first render.
    expect(preset.corePlugins).toEqual({
      backgroundOpacity: false,
      borderOpacity: false,
      divideOpacity: false,
      fontWeight: false,
      placeholderOpacity: false,
      ringOpacity: false,
      textOpacity: false,
    });
  });

  it("maps every colour role to its CSS variable, with alpha support", () => {
    expect(preset.theme.colors.primary).toBe(
      "rgb(var(--color-primary) / <alpha-value>)"
    );
    expect(preset.theme.colors.popover).toBe(
      "rgb(var(--color-popover) / <alpha-value>)"
    );
    for (const role of Object.keys(tokens.color.light)) {
      expect(Object.keys(preset.theme.colors)).toContain(kebab(role));
    }
  });

  it("has no *-dark colour keys (the variables switch instead)", () => {
    expect(
      Object.keys(preset.theme.colors).filter((key) => key.endsWith("-dark"))
    ).toEqual([]);
  });

  it("extends the line heights with the type scale", () => {
    expect(preset.theme.extend.lineHeight).toEqual({
      body: "24px",
      "body-sm": "20px",
      caption: "16px",
      display: "48px",
      "title-1": "34px",
      "title-2": "28px",
      "title-3": "24px",
    });
  });

  it("uses pixel values", () => {
    expect(preset.theme.extend.spacing["4"]).toBe("16px");
    expect(preset.theme.extend.spacing.touch).toBe("44px");
    expect(preset.theme.extend.borderRadius.lg).toBe("14px");
    expect(preset.theme.extend.fontSize.body).toEqual([
      "16px",
      { lineHeight: "24px" },
    ]);
  });
});

describe("the native weights and Figtree", () => {
  const preset = createRequire(import.meta.url)(
    "../../../../styles/generated/tailwind-preset.cjs"
  ) as Preset;

  it("keeps Tailwind's default scales and white, and no raw palette", () => {
    expect(preset.theme.colors.white).toBe(tokens.color.brand.white);
    expect(Object.keys(preset.theme.colors)).not.toContain("red");
    expect(preset.theme).not.toHaveProperty("spacing");
  });

  it("makes font-sans the regular Figtree file", () => {
    expect(preset.theme.extend.fontFamily.sans).toEqual(["Figtree-Regular"]);
  });

  it("sets the Figtree file with every weight utility", () => {
    const added: Record<string, Record<string, string>> = {};
    for (const plugin of preset.plugins) {
      plugin({
        addUtilities: (utilities) => Object.assign(added, utilities),
      });
    }
    expect(added[".font-medium"]).toEqual({
      fontFamily: tokens.fontFamily.native.medium,
      fontWeight: "500",
    });
    expect(Object.keys(added).sort()).toEqual([
      ".font-bold",
      ".font-medium",
      ".font-regular",
      ".font-semibold",
    ]);
  });
});

describe("nativeThemeVariables", () => {
  it("holds every role as space-separated RGB channels in both themes", () => {
    for (const theme of ["light", "dark"] as const) {
      const variables = nativeThemeVariables[theme];
      expect(Object.keys(variables)).toHaveLength(
        Object.keys(tokens.color[theme]).length
      );
      for (const [role, hex] of Object.entries(tokens.color[theme])) {
        const channels = [1, 3, 5].map((start) =>
          Number.parseInt(hex.slice(start, start + 2), 16)
        );
        expect(variables[`--color-${kebab(role)}`]).toBe(channels.join(" "));
      }
    }
  });

  it("switches the brand primary between the themes", () => {
    expect(nativeThemeVariables.light["--color-primary"]).toBe("0 128 95");
    expect(nativeThemeVariables.dark["--color-primary"]).toBe("43 179 138");
  });
});
