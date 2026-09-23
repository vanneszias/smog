/**
 * The shared half of the spacing-scale guard.
 *
 * Extracted from `spacingScale.test.ts` so that `apps/site` can run the same
 * scan over the kitchen-sink route's own sources. Two copies of a scanner
 * drift; one copy with two callers does not.
 *
 * Pure: it takes source text and returns the steps that text asks for. The
 * file reading, and the list of declared steps, belong to each caller.
 */

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
export const spacingStepsIn = (source: string): string[] => {
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
