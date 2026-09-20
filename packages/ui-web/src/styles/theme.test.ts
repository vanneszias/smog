import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tokens } from "@smog/styles";
import { describe, expect, it } from "vitest";
import { renderThemeCss } from "./theme";

/*
 * Resolved from the package root rather than `import.meta.url`: under the
 * jsdom environment a module's `import.meta.url` is an http URL, not a file
 * one. Vitest runs with the package directory as its cwd.
 */
const committed = () =>
  readFileSync(join(process.cwd(), "src/styles/theme.css"), "utf8");

describe("theme.css", () => {
  /*
   * Review Focus item 1: the stylesheet is a rendering of the tokens, not a
   * second copy of them. If someone edits either side by hand, this fails.
   */
  it("matches what the generator produces from the tokens", () => {
    expect(committed()).toBe(renderThemeCss());
  });

  it("names the generator that produced it", () => {
    expect(committed()).toContain("generate:theme");
  });
});

describe("renderThemeCss", () => {
  it("declares every semantic role as a colour variable", () => {
    const css = renderThemeCss();
    for (const role of Object.keys(tokens.semantic.light)) {
      const name = role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      expect(css).toContain(`--color-${name}:`);
    }
  });

  it("re-declares the colours that differ in dark under .dark", () => {
    const dark = renderThemeCss().split(".dark {")[1]?.split("}")[0] ?? "";
    expect(dark).toContain(
      `--color-background: ${tokens.semantic.dark.background};`
    );
    expect(dark).toContain(`--color-primary: ${tokens.semantic.dark.primary};`);
  });

  it("leaves theme-independent scales out of the dark block", () => {
    const dark = renderThemeCss().split(".dark {")[1]?.split("}")[0] ?? "";
    expect(dark).not.toContain("--spacing-md:");
    expect(dark).not.toContain("--radius-md:");
    expect(dark).not.toContain("--font-size-md:");
  });

  it("aliases our type scale into Tailwind's --text-* namespace", () => {
    expect(renderThemeCss()).toContain("--text-md: var(--font-size-md);");
    expect(renderThemeCss()).toContain(
      "--text-md--line-height: var(--line-height-md);"
    );
  });
});
