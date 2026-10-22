import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Phase 10a task 9 retired the phase 1 to 9 colour names that duplicated a
 * shadcn role (`surface` = `card`, `surface-raised` = `popover`, `danger` =
 * `destructive`, `foreground-muted` = `muted-foreground`, `focus-ring` =
 * `ring`). A Tailwind class on a retired name builds no CSS and fails
 * silently, so this scans every source for the class and the role key.
 * (`surface-sunken`, `danger-strong` and `danger-subtle` are still roles.)
 */
const ROOT = join(import.meta.dir, "..", "..", "..");
const SOURCE = /\.(?:ts|tsx|css|cjs)$/;
const SKIPPED_DIRS = new Set([
  "node_modules",
  "dist",
  ".wrangler",
  ".turbo",
  ".expo",
  "generated",
]);
/** Files that name the retired words on purpose (the guards themselves). */
const SELF = new Set([
  "apps/mobile/src/a11y-source.test.ts",
  "apps/site/scripts/retired-tokens.test.ts",
  "packages/ui-native/src/classes.test.ts",
  "packages/ui-web/src/classes.test.ts",
]);

const RETIRED_CLASS =
  /(?<![\w-])(?:[a-z]+:)*(?:bg|text|border|ring|fill|stroke|divide|from|to|via|outline|shadow|decoration|caret|placeholder)-(?:surface-raised|surface|foreground-muted|danger|focus-ring)(?![\w-])/;
const RETIRED_VAR =
  /--color-(?:surface-raised|surface|foreground-muted|danger|focus-ring)(?![\w-])/;
const RETIRED_KEY =
  /(?:useColor\(\s*["'](?:surface|surfaceRaised|foregroundMuted|danger|focusRing)["']\s*\)|\b(?:color|colors|light|dark)\.(?:surface|surfaceRaised|foregroundMuted|danger|focusRing)\b)/;

function files(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (SKIPPED_DIRS.has(name)) {
      continue;
    }
    if (statSync(path).isDirectory()) {
      found.push(...files(path));
    } else if (SOURCE.test(name)) {
      found.push(path);
    }
  }
  return found;
}

function offenders(text: string): boolean {
  return (
    RETIRED_CLASS.test(text) || RETIRED_VAR.test(text) || RETIRED_KEY.test(text)
  );
}

describe("retired colour names", () => {
  test("no source uses one", () => {
    const roots = [
      "apps/site/src",
      "apps/mobile/app",
      "apps/mobile/src",
      ...readdirSync(join(ROOT, "packages/features")).map((name) =>
        join("packages/features", name, "src")
      ),
      ...readdirSync(join(ROOT, "packages")).flatMap((name) => {
        const src = join("packages", name, "src");
        return statSync(join(ROOT, "packages", name)).isDirectory() &&
          name !== "features"
          ? [src]
          : [];
      }),
    ];
    const found: string[] = [];
    for (const root of roots) {
      try {
        statSync(join(ROOT, root));
      } catch {
        continue;
      }
      for (const file of files(join(ROOT, root))) {
        const rel = relative(ROOT, file);
        if (!SELF.has(rel) && offenders(readFileSync(file, "utf8"))) {
          found.push(rel);
        }
      }
    }
    expect(found).toEqual([]);
  });

  test("the patterns catch what they are for", () => {
    expect(offenders('className="bg-surface"')).toBe(true);
    expect(offenders('className="md:hover:text-danger/80"')).toBe(true);
    expect(offenders('useColor("foregroundMuted")')).toBe(true);
    expect(offenders("var(--color-surface-raised)")).toBe(true);
    expect(offenders('className="bg-surface-sunken text-danger-strong"')).toBe(
      false
    );
    expect(offenders('variant="danger" tone="danger"')).toBe(false);
  });
});
