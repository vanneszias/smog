import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";

/**
 * Every utility the kit writes must exist in the SMOG theme. The theme
 * removes Tailwind's default scales (DECISIONS), so an off-token class such
 * as `h-24` or `max-w-sm` silently produces no CSS; this catches it.
 */

const SRC = import.meta.dir;
const THEME = readFileSync(
  new URL(import.meta.resolve("@smog/styles/theme.css")),
  "utf8"
);
const KIT = readFileSync(`${SRC}/styles.css`, "utf8").replace(
  /^@source.*$/gm,
  ""
);

/** Utilities the kit uses whose roots take a theme value. */
const UTILITY =
  /^-?(p[xytrbl]?|m[xytrbl]?|gap(-[xy])?|size|[wh]|min-[wh]|max-[wh]|inset(-[xy])?|top|right|bottom|left|translate-[xy]|text|bg|border(-[xytrbl])?|rounded(-[a-z]+)?|shadow|ring(-offset)?|font|z|opacity|duration|ease|animate|divide(-[xy])?|grid-cols|col-span)-/;

/** Scanned words that are not classes (a config key, prose in a comment). */
const NOT_CLASSES = new Set(["font-weight", "right-aligned"]);

function baseUtility(candidate: string): string {
  // Strip variants (`md:`, `data-[state=open]:`, `*:`); brackets never hold `:` here.
  let depth = 0;
  let cut = 0;
  for (let i = 0; i < candidate.length; i += 1) {
    const char = candidate[i];
    if (char === "[" || char === "(") {
      depth += 1;
    } else if (char === "]" || char === ")") {
      depth -= 1;
    } else if (char === ":" && depth === 0) {
      cut = i + 1;
    }
  }
  return candidate.slice(cut);
}

function escapeClass(candidate: string): string {
  return candidate.replace(/[^A-Za-z0-9_-]/g, (char) => `\\${char}`);
}

describe("kit classes", () => {
  test("every theme utility used in src/ builds to CSS", async () => {
    const scanner = new Scanner({
      sources: [
        { base: SRC, negated: false, pattern: "**/*.{ts,tsx}" },
        { base: SRC, negated: true, pattern: "classes.test.ts" },
      ],
    });
    const candidates = scanner
      .scan()
      .filter((c) => UTILITY.test(baseUtility(c)) && !NOT_CLASSES.has(c))
      // Test fixtures deliberately use classes the theme lacks.
      .filter((c) => !c.startsWith("bg-red"));
    expect(candidates.length).toBeGreaterThan(100);

    const compiler = await compile(
      [
        '@import "tailwindcss/theme.css" layer(theme);',
        '@import "tailwindcss/utilities.css" layer(utilities);',
        THEME,
        KIT,
      ].join("\n"),
      { base: SRC, onDependency: () => undefined }
    );
    const css = compiler.build(candidates);
    const missing = candidates.filter(
      (c) => !css.includes(`.${escapeClass(c)}`)
    );
    expect(missing).toEqual([]);
  });
});
