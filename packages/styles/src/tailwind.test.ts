import { describe, expect, it } from "bun:test";
import { compile } from "@tailwindcss/node";
import { renderWebThemeCss } from "./generate-web";

/**
 * Compiles the generated theme with the real Tailwind v4 compiler, so the
 * checks are about the CSS the site ships, not about the theme's text.
 */
async function build(candidates: string[]): Promise<string> {
  const input = [
    '@import "tailwindcss/theme.css" layer(theme);',
    '@import "tailwindcss/utilities.css" layer(utilities);',
    renderWebThemeCss(),
  ].join("\n");
  const compiler = await compile(input, {
    base: import.meta.dir,
    onDependency: () => undefined,
  });
  return compiler.build(candidates);
}

function rule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  return start < 0 ? "" : css.slice(start, css.indexOf("}", start) + 1);
}

describe("generated theme under Tailwind v4", () => {
  it("builds token utilities", async () => {
    const css = await build([
      "bg-primary",
      "p-4",
      "p-0.5",
      "min-h-touch",
      "text-display",
      "rounded-lg",
      "shadow-2",
      "max-w-reading",
      "ease-standard",
      "duration-fast",
      "dark:bg-surface",
    ]);
    expect(rule(css, ".bg-primary")).toContain("var(--color-primary)");
    expect(rule(css, ".p-0\\.5")).toContain("var(--spacing-0_5)");
    expect(rule(css, ".min-h-touch")).toContain("var(--spacing-touch)");
    expect(rule(css, ".text-display")).toContain("var(--text-display)");
    expect(rule(css, ".max-w-reading")).toContain("var(--container-reading)");
    expect(rule(css, ".duration-fast")).toContain("var(--duration-fast)");
    expect(css).toContain(".dark\\:bg-surface:where(.dark, .dark *)");
  });

  it("builds nothing for Tailwind's default scales", async () => {
    const css = await build([
      "bg-red-500",
      "bg-white",
      "p-7",
      "text-sm",
      "shadow-sm",
      "rounded-2xl",
      "max-w-3xl",
      "ease-in-out",
      "font-bold",
    ]);
    expect(css).not.toContain(".bg-red-500");
    expect(css).not.toContain(".bg-white");
    expect(css).not.toContain(".p-7");
    expect(css).not.toContain(".text-sm");
    expect(css).not.toContain(".shadow-sm");
    expect(css).not.toContain(".rounded-2xl");
    expect(css).not.toContain(".max-w-3xl");
    expect(css).not.toContain(".ease-in-out");
    expect(css).not.toContain(".font-bold");
  });

  it("routes default transitions through the zeroed reduced-motion durations", async () => {
    const css = await build(["transition-colors"]);
    expect(rule(css, ".transition-colors")).toContain(
      "var(--tw-duration, var(--default-transition-duration))"
    );
    expect(css).toContain(
      "--default-transition-duration: var(--duration-normal)"
    );
    const reduced = css.slice(
      css.indexOf("@media (prefers-reduced-motion: reduce)")
    );
    expect(reduced).toContain("--duration-normal: 0ms");
  });
});
