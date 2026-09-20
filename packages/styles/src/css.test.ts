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
    expect(toCssVariables(tokens, "light")).toContain("--spacing-4: 16px");
  });

  it("emits every numeric spacing step the token object defines", () => {
    const declarations = parse(toCssVariables(tokens, "light"));
    for (const [step, value] of Object.entries(tokens.spacing)) {
      if (/^\d+(\.\d+)?$/.test(step)) {
        expect(declarations[`--spacing-${step}`], step).toBe(`${value}px`);
      }
    }
  });

  /*
   * The t-shirt aliases stay in the token object for the native app and must
   * never reach CSS. Tailwind v4 resolves a t-shirt-named width or height
   * from the spacing namespace before the container namespace, so declaring
   * `--spacing-lg` silently redefines `max-w-lg` from 32rem to 24px — which
   * is how a `Dialog` ended up 50 pixels wide on the kitchen-sink route with
   * every unit test green. The names are listed out rather than derived, so
   * adding a seventh alias to `tokens.ts` does not quietly widen this guard.
   */
  it("emits no t-shirt spacing alias, which would hijack max-w-* and w-*", () => {
    const declared = names(toCssVariables(tokens, "light"));
    for (const alias of ["xs", "sm", "md", "lg", "xl", "xxl"]) {
      expect(declared, alias).not.toContain(`--spacing-${alias}`);
    }
  });

  /*
   * `2xl` is the shape of the next alias anyone adds — it is what Tailwind
   * itself calls that step — and it contains a digit. A filter that merely
   * looked for a digit rather than for a whole number would let it through
   * and hand `max-w-2xl` a 64px value, which is the original bug wearing a
   * different name. Driven through a synthetic token object because the
   * predicate is private and should stay that way: what matters is the
   * output, not the helper.
   */
  it("ignores a future alias that happens to contain a digit", () => {
    const withFutureAlias = {
      ...tokens,
      spacing: { ...tokens.spacing, "2xl": 64 },
    } as unknown as typeof tokens;

    const declared = names(toCssVariables(withFutureAlias, "light"));

    expect(declared).not.toContain("--spacing-2xl");
    expect(declared).toContain("--spacing-24");
  });

  it("keeps the aliases in the token object, which native still reads", () => {
    expect(tokens.spacing.md).toBe(16);
    expect(tokens.spacing.lg).toBe(24);
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
