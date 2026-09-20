import { describe, expect, it } from "vitest";
import { toCssVariables } from "./css";
import { tokens } from "./tokens";

describe("toCssVariables", () => {
  it("emits a variable for every semantic role", () => {
    const css = toCssVariables(tokens, "light");
    for (const role of Object.keys(tokens.semantic.light)) {
      expect(css).toContain(`--color-${kebab(role)}:`);
    }
  });

  it("emits the brand primary unchanged", () => {
    expect(toCssVariables(tokens, "light")).toContain("#00805F");
  });

  it("emits spacing with px units, because CSS needs them", () => {
    expect(toCssVariables(tokens, "light")).toContain("--spacing-md: 16px");
  });

  it("produces different values for light and dark", () => {
    expect(toCssVariables(tokens, "light")).not.toBe(
      toCssVariables(tokens, "dark")
    );
  });
  it("emits the same variable names for both themes, so neither drifts", () => {
    expect(names(toCssVariables(tokens, "light"))).toEqual(
      names(toCssVariables(tokens, "dark"))
    );
  });

  it("emits each semantic role with the exact token value", () => {
    for (const theme of ["light", "dark"] as const) {
      const declarations = parse(toCssVariables(tokens, theme));
      for (const [role, value] of Object.entries(tokens.semantic[theme])) {
        expect(declarations[`--color-${kebab(role)}`], `${theme}/${role}`).toBe(
          value
        );
      }
    }
  });

  it("emits durations in milliseconds, not pixels", () => {
    const declarations = parse(toCssVariables(tokens, "light"));
    expect(declarations["--duration-fast"]).toBe("150ms");
  });

  it("emits every numeric scale with a unit and no bare numbers", () => {
    const declarations = parse(toCssVariables(tokens, "light"));
    expect(declarations["--radius-full"]).toBe("9999px");
    expect(declarations["--font-size-md"]).toBe("16px");
    expect(declarations["--line-height-md"]).toBe("24px");
    for (const [name, value] of Object.entries(declarations)) {
      expect(value, name).not.toMatch(/^-?\d+(\.\d+)?$/);
    }
  });

  it("terminates every declaration so the output can be pasted into a block", () => {
    for (const line of toCssVariables(tokens, "dark").split("\n")) {
      expect(line).toMatch(/^--[a-z0-9-]+: .+;$/);
    }
  });
});

function parse(css: string): Record<string, string> {
  const declarations: Record<string, string> = {};
  for (const line of css.split("\n")) {
    const match = line.match(/^(--[a-z0-9-]+): (.*);$/);
    if (match?.[1]) {
      declarations[match[1]] = match[2] ?? "";
    }
  }
  return declarations;
}

function names(css: string): string[] {
  return Object.keys(parse(css));
}

function kebab(value: string): string {
  return value.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}
