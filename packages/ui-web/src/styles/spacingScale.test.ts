import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { spacingStepsIn } from "./spacingScale";

/*
 * Why this file exists.
 *
 * `theme.css` declares individual `--spacing-<step>` variables and no
 * `--spacing` base, because the scale is a fixed list of steps rather than a
 * multiplier. Tailwind v4 builds `p-4` from `--spacing-4`, but for a step it
 * has no variable for it still emits the utility — as
 * `calc(var(--spacing) * 1.5)`.
 *
 * What that resolves to was measured for the first time in Stage 2 Task 8,
 * against the real stylesheet the kitchen-sink route compiles. Declaring
 * `--spacing-*` steps does **not** displace Tailwind's own default, so the
 * emitted CSS still carries `--spacing: .25rem` on `:root` and an off-scale
 * step silently resolves to 4px × n. This guard's original note said the
 * declaration would be invalid and the padding would disappear; it does not.
 * The bug is quieter than that, and therefore worse: the control is simply a
 * size this design system never chose, plausible enough that nobody looks.
 *
 * Nothing else catches it: the class is spelled correctly, `cn()` keeps it,
 * every component test passes. `py-1.5`, `size-3.5`, `w-9` and `p-7` are all
 * this bug.
 *
 * The allowed steps are read out of the generated `theme.css` rather than
 * listed here, so this guard cannot drift from the tokens: add a step in
 * `packages/styles/src/tokens.ts`, regenerate, and it is allowed here the same
 * day.
 */

/*
 * Resolved from the package root rather than `import.meta.url`: under the
 * jsdom environment a module's `import.meta.url` is an http URL, not a file
 * one. Vitest runs with the package directory as its cwd.
 */
const PACKAGE_ROOT = process.cwd();

const declaredSpacingSteps = (): Set<string> => {
  const css = readFileSync(join(PACKAGE_ROOT, "src/styles/theme.css"), "utf8");
  return new Set(
    [...css.matchAll(/--spacing-([\w.]+)\s*:/g)].map((match) => match[1] ?? "")
  );
};

const sourceFiles = (): string[] => {
  const files: string[] = [];
  for (const directory of ["src/components", "src/domain", "src/lib"]) {
    for (const name of readdirSync(join(PACKAGE_ROOT, directory))) {
      /*
       * Implementation only. A test may spell an off-scale class on purpose —
       * `className="bg-red-500"` is how the override tests prove `cn()` works
       * — and none of it reaches a page.
       */
      if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) {
        continue;
      }
      files.push(join(directory, name));
    }
  }
  return files;
};

describe("spacing scale", () => {
  it("declares the steps the tokens define", () => {
    const declared = declaredSpacingSteps();
    expect(declared.has("4")).toBe(true);
    expect(declared.has("1.5")).toBe(false);
    expect(declared.size).toBeGreaterThan(5);
  });

  it("finds source files to check", () => {
    expect(sourceFiles().length).toBeGreaterThan(20);
  });

  /*
   * The guard itself. It names the file and the step, because "a spacing step
   * is off the scale" without either is a message nobody can act on.
   */
  it("uses only spacing steps the theme declares", () => {
    const declared = declaredSpacingSteps();
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const source = readFileSync(join(PACKAGE_ROOT, file), "utf8");
      for (const step of spacingStepsIn(source)) {
        if (!declared.has(step)) {
          offenders.push(`${file}: ${step}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

/*
 * A guard with false positives gets deleted, which is worse than not having
 * one, so the extractor is tested on both sides.
 */
describe("spacingStepsIn", () => {
  it("finds the steps a class list asks for", () => {
    expect(spacingStepsIn('const a = "p-4 gap-2 size-8";')).toEqual([
      "4",
      "2",
      "8",
    ]);
  });

  it("finds the ones that are off the scale", () => {
    expect(spacingStepsIn('const a = "py-1.5 size-3.5 w-9 p-7";')).toEqual([
      "1.5",
      "3.5",
      "9",
      "7",
    ]);
  });

  it("looks through a variant prefix", () => {
    expect(spacingStepsIn('const a = "sm:gap-7 lg:px-9";')).toEqual(["7", "9"]);
  });

  it("looks through a negative margin", () => {
    expect(spacingStepsIn('const a = "-mt-7";')).toEqual(["7"]);
  });

  it("ignores numerics that are not on the spacing scale", () => {
    expect(
      spacingStepsIn(
        'const a = "z-50 opacity-50 grid-cols-3 border-2 rounded-3xl text-3xl duration-300 ring-2 col-span-2 order-1";'
      )
    ).toEqual([]);
  });

  it("ignores arbitrary values, which never touch the scale", () => {
    expect(
      spacingStepsIn('const a = "w-[3px] p-[10px] gap-[2.5rem]";')
    ).toEqual([]);
  });

  /*
   * `max-w-sm` is ignored here because it is not `prefix-<number>`. It is not
   * harmless, though: while `@smog/styles` emitted its `sm`/`md`/`lg` spacing
   * aliases as CSS variables, Tailwind resolved `max-w-sm` from the spacing
   * namespace rather than `--container-*` and a `Dialog` rendered 50 pixels
   * wide. That hazard is now impossible at the source and pinned by
   * `packages/styles/src/css.test.ts`, which is the right place for it: a
   * class-name scanner cannot tell which namespace a name resolves from.
   */
  it("ignores fractions and keywords, which are their own scales", () => {
    expect(
      spacingStepsIn(
        'const a = "top-1/2 w-1/3 w-full h-fit max-w-sm inset-auto size-full";'
      )
    ).toEqual([]);
  });

  it("reads no class out of a comment that merely mentions one", () => {
    expect(
      spacingStepsIn("/* never write py-1.5 here */\n// or size-3.5")
    ).toEqual([]);
  });

  it("reads classes out of a real component's className", () => {
    expect(
      spacingStepsIn('<div className={cn("mt-2 flex gap-1", className)} />')
    ).toEqual(["2", "1"]);
  });
});
