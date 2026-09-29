import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import { Scanner } from "@tailwindcss/oxide";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import tailwindConfig from "../tailwind.config.cjs";

/**
 * Every utility the kit and the mobile app write must exist in the SMOG
 * preset. The preset replaces Tailwind's default scales (DECISIONS), so an
 * off-token class such as `h-24` or `p-7` silently produces no style on
 * native. Same approach as `packages/ui-web/src/classes.test.ts`: Tailwind's
 * own scanner finds the candidates, the real compiler (Tailwind 3 with the
 * generated preset, as NativeWind) must build a rule for each.
 */

// biome-ignore lint/correctness/noGlobalDirnameFilename: Jest runs this as CommonJS; `import.meta` does not exist there
const KIT_SRC = __dirname;
const MOBILE = join(KIT_SRC, "../../../apps/mobile");
const SOURCES = [
  { base: KIT_SRC, pattern: "**/*.{ts,tsx}" },
  { base: join(MOBILE, "app"), pattern: "**/*.{ts,tsx}" },
  { base: join(MOBILE, "src"), pattern: "**/*.{ts,tsx}" },
];

/** Utilities whose roots take a theme value (the web test's list, native roots). */
const UTILITY =
  /^-?(p[xytrbl]?|m[xytrbl]?|gap(-[xy])?|size|[wh]|min-[wh]|max-[wh]|inset(-[xy])?|top|right|bottom|left|translate-[xy]|text|bg|border(-[xytrbl])?|rounded(-[a-z]+)?|shadow|font|z|opacity|duration|ease|animate)-/;

/**
 * Scanned words that are not classes: a tailwind-merge config key
 * (`lib/cn.ts`) and web's class named in a comment (`menu.tsx`).
 */
const NOT_CLASSES = new Set(["font-weight", "h-px"]);

const HEX_COLOUR = /["'`][^"'`]*#[0-9A-Fa-f]{3,8}\b/;
const ARBITRARY = /\b[a-z-]+-\[[^\]]+\]/;

function baseUtility(candidate: string): string {
  const cut = candidate.lastIndexOf(":");
  return cut < 0 ? candidate : candidate.slice(cut + 1);
}

function escapeClass(candidate: string): string {
  return candidate.replace(/[^A-Za-z0-9_-]/g, (char) => `\\${char}`);
}

async function missingFrom(candidates: string[]): Promise<string[]> {
  const { css } = await postcss([
    tailwindcss({
      ...tailwindConfig,
      content: [{ extension: "html", raw: candidates.join(" ") }],
    }),
  ]).process("@tailwind utilities;", { from: undefined });
  return candidates.filter((c) => !css.includes(`.${escapeClass(c)}`));
}

function scan(): string[] {
  const scanner = new Scanner({
    sources: [
      ...SOURCES.map((source) => ({ ...source, negated: false })),
      { base: KIT_SRC, negated: true, pattern: "classes.test.ts" },
    ],
  });
  return scanner
    .scan()
    .filter((c) => UTILITY.test(baseUtility(c)) && !NOT_CLASSES.has(c));
}

describe("kit and app classes", () => {
  it("builds every theme utility used in the kit and the mobile app", async () => {
    const candidates = scan();
    expect(candidates.length).toBeGreaterThan(100);
    expect(await missingFrom(candidates)).toEqual([]);
  });

  it("catches an off-token class", async () => {
    expect(await missingFrom(["h-24", "p-7", "min-h-touch"])).toEqual([
      "h-24",
      "p-7",
    ]);
  });

  it("finds no hex colours or arbitrary values in the sources", () => {
    const scanner = new Scanner({
      sources: SOURCES.map((source) => ({ ...source, negated: false })),
    });
    const files = scanner.files.filter(
      (file) => !file.endsWith("classes.test.ts")
    );
    expect(files.length).toBeGreaterThan(40);
    const offenders = files.filter((file) => {
      const text = readFileSync(file, "utf8");
      return HEX_COLOUR.test(text) || ARBITRARY.test(text);
    });
    expect(offenders).toEqual([]);
    // The patterns themselves catch what they are for.
    expect(HEX_COLOUR.test('color="#00805F"')).toBe(true);
    expect(ARBITRARY.test('className="min-h-[13px]"')).toBe(true);
  });
});
