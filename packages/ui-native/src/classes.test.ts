import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import { Scanner } from "@tailwindcss/oxide";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import tailwindConfig from "../tailwind.config.cjs";

/**
 * Every utility the kit and the mobile app write must exist in the SMOG
 * preset. Tailwind's default scales stay (phase 10a ruling 2) but its raw
 * palette and the weights without a Figtree file do not, so a class such as
 * `bg-red-500` or `font-light` silently produces no style on native. Same approach as `packages/ui-web/src/classes.test.ts`: Tailwind's
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
    expect(
      await missingFrom(["bg-red-500", "font-light", "min-h-touch", "p-7"])
    ).toEqual(["bg-red-500", "font-light"]);
  });

  it("keeps Tailwind's default scales, as registry code writes them", async () => {
    expect(
      await missingFrom(["h-24", "size-9", "text-sm", "rounded-2xl", "gap-1.5"])
    ).toEqual([]);
  });

  it("accepts the shadcn colour vocabulary", async () => {
    expect(
      await missingFrom([
        "bg-card",
        "text-card-foreground",
        "bg-popover",
        "bg-secondary",
        "bg-muted",
        "text-muted-foreground",
        "bg-accent",
        "bg-destructive",
        "border-input",
        "border-ring",
        "bg-sidebar",
        "text-sidebar-foreground",
        "bg-chart-1",
        "bg-highlight",
        "bg-primary/40",
        "bg-surface-sunken",
        "text-primary-strong",
      ])
    ).toEqual([]);
  });

  it("no longer knows the retired alias names", async () => {
    expect(
      await missingFrom([
        "bg-surface",
        "bg-surface-raised",
        "text-foreground-muted",
        "bg-danger",
        "border-focus-ring",
      ])
    ).toHaveLength(5);
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
