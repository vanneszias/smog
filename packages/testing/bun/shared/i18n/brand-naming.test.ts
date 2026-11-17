import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { LOCALES, resources } from "../../../../i18n/src/index";

/**
 * One naming system (DESIGN.md, "Voice and words"): SMOG is the method,
 * SMOG & Co is the product and the organisation, always with spaces and a
 * lower-case "o". The legal texts (`packages/i18n/src/legal`, the
 * `legal_text` migrations) keep their wording until the owner confirms the
 * legal entity's spelling, so they are not scanned.
 */

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

/** A space or the no-break spaces the catalogues use around the ampersand. */
const SP = "[ \\u00A0\\u202F]";
/** "SMOG" that is not the start of "SMOG & Co". */
const BARE_SMOG = `SMOG(?!${SP}*&)`;

/** Spellings of the name that are never right, in copy, code or documents. */
const WRONG_SPELLINGS: [RegExp, string][] = [
  [/SMOG&/i, "SMOG&Co without spaces"],
  [new RegExp(`SMOG${SP}*&${SP}*CO\\b`), "SMOG & CO in capitals"],
  [new RegExp(`SMOG${SP}*&${SP}*co\\b`), "SMOG & co in lower case"],
  [/\bSmog\b/, "Smog instead of SMOG"],
  [new RegExp(`SMOG${SP}+(?:and|en|et)${SP}+Co\\b`, "i"), "and instead of &"],
];

/** "SMOG" used for the app or the organisation, which is SMOG & Co. */
const PRODUCT_AS_SMOG: [RegExp, string][] = [
  [/\bSMOG-app\b|\bSMOG app\b/i, "the app is the SMOG & Co app"],
  [new RegExp(`\\bapplication ${BARE_SMOG}`, "i"), "l'application SMOG & Co"],
  [/\bSMOG-(?:project|gebruiker)/i, "SMOG & Co, not a SMOG project or user"],
  [
    new RegExp(`\\b(?:a SMOG user|utilisateur de ${BARE_SMOG})`, "i"),
    "SMOG & Co, not a SMOG user",
  ],
  [
    new RegExp(
      `\\b(?:steun|steunen|support|supporting|soutenir|soutenez|soutien à)${SP}+${BARE_SMOG}`,
      "i"
    ),
    "people support SMOG & Co",
  ],
  [
    new RegExp(`\\b(?:bekijk op|view on|voir sur)${SP}+${BARE_SMOG}`, "i"),
    "the site is SMOG & Co",
  ],
  [
    new RegExp(
      `\\b(?:contact op met|contact|contactez|vraag|ask|demandez[^.]*à)${SP}+${BARE_SMOG}`,
      "i"
    ),
    "people contact SMOG & Co",
  ],
  [
    new RegExp(
      `\\b${BARE_SMOG}${SP}+(?:is verhuisd|has moved|a déménagé|is in onderhoud|is under maintenance|est en maintenance|verbeteren|improve)`,
      "i"
    ),
    "SMOG & Co moves, pauses and improves",
  ],
  [
    new RegExp(`\\b(?:verbeteren|improve|améliorer)${SP}+${BARE_SMOG}`, "i"),
    "SMOG & Co is what gets better",
  ],
];

/** Gestures are "gestes" in French and "gestures" in English, never signs. */
const SIGNS: Record<string, RegExp> = {
  en: /\b(?:the|these|those|your|our|a|SMOG) signs?\b(?![\s-]in)/i,
  fr: /\bsignes?\b/i,
};

describe("brand naming in the catalogues", () => {
  for (const locale of LOCALES) {
    const entries = flatten(resources[locale].translation as unknown as Tree);

    test(`${locale}: SMOG & Co is spelled one way`, () => {
      const offenders = entries.flatMap(([key, value]) =>
        WRONG_SPELLINGS.filter(([pattern]) => pattern.test(value)).map(
          ([, why]) => `${key}: ${why}: ${value}`
        )
      );
      expect(offenders).toEqual([]);
    });

    test(`${locale}: SMOG names the method, SMOG & Co the product and the organisation`, () => {
      const offenders = entries.flatMap(([key, value]) =>
        PRODUCT_AS_SMOG.filter(([pattern]) => pattern.test(value)).map(
          ([, why]) => `${key}: ${why}: ${value}`
        )
      );
      expect(offenders).toEqual([]);
    });

    const signs = SIGNS[locale];
    if (signs) {
      test(`${locale}: gestures are never called signs`, () => {
        const offenders = entries
          .filter(([, value]) => signs.test(value))
          .map(([key, value]) => `${key}: ${value}`);
        expect(offenders).toEqual([]);
      });
    }
  }
});

const ROOT = new URL("../../../../..", import.meta.url).pathname;
const TEXT_FILE = /\.(?:[cm]?[jt]sx?|mdx?|jsonc?|html|css|ya?ml|txt|svg|xml)$/;
const SKIPPED_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  "generated",
  "build",
  "Pods",
  ".wrangler",
  ".expo",
]);
/** Wording the owner has not signed off yet, and the tests' own fixtures. */
const SKIPPED_PATHS = [
  "packages/i18n/src/legal",
  "packages/db/migrations",
  "packages/testing",
];

function scan(path: string, found: string[]): void {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    const rel = relative(ROOT, full);
    if (SKIPPED_PATHS.some((skipped) => rel.startsWith(skipped))) {
      continue;
    }
    if (entry.isDirectory()) {
      if (!(SKIPPED_DIRS.has(entry.name) || entry.name.startsWith("."))) {
        scan(full, found);
      }
    } else if (TEXT_FILE.test(entry.name)) {
      for (const [index, line] of readFileSync(full, "utf8")
        .split("\n")
        .entries()) {
        for (const [pattern, why] of WRONG_SPELLINGS) {
          if (pattern.test(line)) {
            found.push(`${rel}:${index + 1}: ${why}`);
          }
        }
      }
    }
  }
}

test("apps, packages and the root documents spell SMOG & Co one way", () => {
  const found: string[] = [];
  scan(join(ROOT, "apps"), found);
  scan(join(ROOT, "packages"), found);
  for (const file of ["README.md", "DESIGN.md", "AGENTS.md"]) {
    for (const [index, line] of readFileSync(join(ROOT, file), "utf8")
      .split("\n")
      .entries()) {
      for (const [pattern, why] of WRONG_SPELLINGS) {
        if (pattern.test(line)) {
          found.push(`${file}:${index + 1}: ${why}`);
        }
      }
    }
  }
  expect(found).toEqual([]);
});
