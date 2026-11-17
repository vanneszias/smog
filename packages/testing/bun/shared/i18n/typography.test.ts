import { describe, expect, test } from "bun:test";
import { LOCALES, resources } from "../../../../i18n/src/index";

/**
 * The typography contract of the copy (DESIGN.md, "Voice and words").
 *
 * NOT ENFORCED YET. The shipped catalogues still mix straight and curly
 * apostrophes, space French guillemets two ways and end a few placeholders
 * with "...". Sweeping them now would conflict with every parallel
 * workstream of the identity overhaul, so the sweep runs once after those
 * branches are merged. The integration step then:
 *   1. replaces every rule's offenders in nl.json, en.json and fr.json with
 *      targeted edits (never a JSON rewriter that re-encodes the escapes),
 *   2. sets `SWEEP_DONE` to true, so these tests run in `bun run test`,
 *   3. reviews the D1 `ui_string` overrides on staging and production, which
 *      bypass the shipped files.
 * Run them before that with `SMOG_TYPOGRAPHY=1 bun test <this file>` to see
 * what the sweep has to change.
 */
const SWEEP_DONE = false;
const RUN = SWEEP_DONE || process.env.SMOG_TYPOGRAPHY === "1";

interface Tree {
  [key: string]: string | Tree;
}

function flatten(tree: Tree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string"
      ? [[path, value] as [string, string]]
      : flatten(value, path);
  });
}

/** Placeholders and tags are code, not copy. */
const CODE = /\{\{[^}]*\}\}|<\/?[a-z][^>]*>|[a-z][a-z0-9+.-]*:\/\/\S+/gi;

/**
 * Where "SMOG & Co" stands alone and never wraps (a title bar, a name, a
 * payment description on a bank statement, a mail subject), plain spaces
 * are right; in running text the ampersand is held by U+00A0 on both sides.
 */
const NAME_ONLY = [
  /^common\.appName$/,
  /^a11y\.logo$/,
  /^email\.common\.logoAlt$/,
  /^email\.auth\.signature$/,
  /\.subject(?:Renewal)?$/,
  /^sponsorship\.mollie\./,
  /^maintenance\.documentTitle$/,
  /^account\.privacy\.shareTitle$/,
];

const RULES: [string, RegExp, (locale: string, key: string) => boolean][] = [
  ["a straight apostrophe between letters (use ’)", /\p{L}'\p{L}/u, () => true],
  ["three dots (use …)", /\.\.\./, () => true],
  ["a straight double quote (use “ ” or « »)", /"/, () => true],
  [
    "a French guillemet without a no-break space inside",
    /«(?![\u00A0\u202F])|(?<![\u00A0\u202F])»/,
    (locale) => locale === "fr",
  ],
  [
    "a number and its unit split by a plain space",
    /\d (?:MB|Mo|KB|kB|Ko|GB|px|s|sec|seconden|seconds|secondes|%)\b/,
    () => true,
  ],
  [
    "SMOG & Co in running text with a breakable space",
    /SMOG &|& Co\b/,
    (_locale, key) => !NAME_ONLY.some((pattern) => pattern.test(key)),
  ],
];

describe("copy typography (enabled after the post-merge sweep)", () => {
  for (const locale of LOCALES) {
    const entries = flatten(resources[locale].translation as unknown as Tree);
    for (const [name, pattern, applies] of RULES) {
      test.skipIf(!RUN)(`${locale}: no ${name}`, () => {
        const offenders = entries
          .filter(
            ([key, value]) =>
              applies(locale, key) && pattern.test(value.replace(CODE, "x"))
          )
          .map(([key, value]) => `${key}: ${value}`);
        expect(offenders).toEqual([]);
      });
    }
  }
});
