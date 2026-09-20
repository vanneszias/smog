import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Why this file exists.
 *
 * `theme.css` declares individual `--spacing-<step>` variables and no
 * `--spacing` base, because the scale is a fixed list of steps rather than a
 * multiplier. Tailwind v4 builds `p-4` from `--spacing-4`, but for a step it
 * has no variable for it still emits the utility — as
 * `calc(var(--spacing) * 1.5)`. `--spacing` is undefined, so the declaration
 * is invalid and the padding silently disappears.
 *
 * Nothing catches that: the class is spelled correctly, `cn()` keeps it, every
 * component test passes, and the only symptom is a control that is the wrong
 * size on a page nobody has opened yet. `py-1.5`, `size-3.5`, `w-9` and `p-7`
 * are all this bug.
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

/**
 * The utility prefixes whose **numeric** value is a step on the spacing scale.
 *
 * Deliberately not every such utility in Tailwind — only the ones this package
 * uses, plus their immediate neighbours. A guard that fires on something
 * legitimate gets deleted, and a deleted guard catches nothing, so this errs
 * towards missing a case rather than inventing one. Longest first, because the
 * alternation is matched in order and `min-w` must beat `w`... which it does
 * anyway here, since the prefix is anchored to the start of the class.
 */
const SPACING_PREFIXES = [
  "p",
  "px",
  "py",
  "pt",
  "pr",
  "pb",
  "pl",
  "ps",
  "pe",
  "m",
  "mx",
  "my",
  "mt",
  "mr",
  "mb",
  "ml",
  "ms",
  "me",
  "gap",
  "gap-x",
  "gap-y",
  "space-x",
  "space-y",
  "w",
  "h",
  "size",
  "min-w",
  "min-h",
  "max-w",
  "max-h",
  "inset",
  "inset-x",
  "inset-y",
  "top",
  "right",
  "bottom",
  "left",
  "start",
  "end",
  "translate-x",
  "translate-y",
  "basis",
  "indent",
  "scroll-m",
  "scroll-mt",
  "scroll-mb",
  "scroll-ml",
  "scroll-mr",
  "scroll-p",
  "scroll-pt",
  "scroll-pb",
  "scroll-pl",
  "scroll-pr",
];

const SPACING_UTILITY = new RegExp(
  `^(?:${[...SPACING_PREFIXES]
    .sort((a, b) => b.length - a.length)
    .join("|")})-(\\d+(?:\\.\\d+)?)$`
);

/** Block and line comments, so prose about a class is not read as a class. */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** Only what is inside a string literal can reach an element's class list. */
const stringLiterals = (source: string): string[] =>
  [...source.matchAll(/"([^"\n]*)"|`([^`]*)`|'([^'\n]*)'/g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? ""
  );

/**
 * Every numeric spacing step a source file asks for.
 *
 * Skips anything that is not a plain number: `w-full`, `max-w-sm` (the
 * container scale), `top-1/2` (a fraction) and `p-[10px]` (an arbitrary value)
 * do not go through `--spacing-*` at all. Variant prefixes are stripped, so
 * `sm:gap-4` and `hover:px-3` are checked like the bare class, and a leading
 * `-` for a negative margin is stripped too.
 */
const spacingStepsIn = (source: string): string[] => {
  const steps: string[] = [];
  for (const literal of stringLiterals(withoutComments(source))) {
    for (const rawToken of literal.split(/\s+/)) {
      const token = rawToken.split(":").at(-1) ?? "";
      /*
       * The numeric-only value pattern is what keeps `w-[3px]`, `top-1/2` and
       * `max-w-sm` out: none of them is `prefix-<number>`. An explicit skip
       * for brackets and slashes used to sit here and a mutation showed it
       * never fired, so it is gone rather than left as a line no test can
       * pin. `SP5` — loosening the pattern to `[\w.]+` — is the mutation that
       * expresses this intent, and it fails `ignores fractions and keywords`.
       */
      const match = SPACING_UTILITY.exec(
        token.startsWith("-") ? token.slice(1) : token
      );
      if (match?.[1] !== undefined) {
        steps.push(match[1]);
      }
    }
  }
  return steps;
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
