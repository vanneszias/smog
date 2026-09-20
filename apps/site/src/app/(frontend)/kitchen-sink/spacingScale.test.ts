import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spacingStepsIn } from "@smog/ui-web/styles/spacingScale";
import { describe, expect, it } from "vitest";

/*
 * The same guard `packages/ui-web` runs, pointed at this route's own sources.
 *
 * That package's copy scans `packages/ui-web` only, so every class written
 * here was unguarded. The hazard is identical and it does not announce
 * itself: Tailwind emits `p-7` as `calc(var(--spacing) * 7)` against its own
 * 0.25rem multiplier rather than against one of our `--spacing-*` tokens, so
 * the control is a size this design system never chose and the page looks
 * plausible enough that nobody measures it.
 *
 * The scanner is imported rather than copied — two copies drift, and a guard
 * that has drifted is worse than none. The declared steps are read out of the
 * generated `theme.css` for the same reason: adding a step to
 * `packages/styles/src/tokens.ts` makes it legal here the same day.
 *
 * What this does *not* cover is the t-shirt names — `max-w-lg` and friends —
 * because a class-name scanner cannot tell which namespace a name resolves
 * from. That hazard is guarded at the source instead, in
 * `packages/styles/src/css.test.ts`.
 */

const ROUTE = "src/app/(frontend)/kitchen-sink";

const THEME_CSS = "../../packages/ui-web/src/styles/theme.css";

/** Vitest runs with the app directory as its cwd. */
const APP_ROOT = process.cwd();

const declaredSpacingSteps = (): Set<string> => {
  const css = readFileSync(join(APP_ROOT, THEME_CSS), "utf8");

  return new Set(
    [...css.matchAll(/--spacing-([\w.]+)\s*:/g)].map((match) => match[1] ?? "")
  );
};

/** Every `.ts`/`.tsx` under the route, tests excluded, one level of nesting. */
const sourceFiles = (): string[] => {
  const files: string[] = [];

  for (const entry of readdirSync(join(APP_ROOT, ROUTE), {
    withFileTypes: true,
  })) {
    const names = entry.isDirectory()
      ? readdirSync(join(APP_ROOT, ROUTE, entry.name)).map((name) =>
          join(entry.name, name)
        )
      : [entry.name];

    for (const name of names) {
      if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) {
        continue;
      }

      if (name.endsWith(".ts") || name.endsWith(".tsx")) {
        files.push(join(ROUTE, name));
      }
    }
  }

  return files;
};

describe("kitchen-sink spacing scale", () => {
  it("reads the steps out of the generated theme", () => {
    const declared = declaredSpacingSteps();

    expect(declared.has("4")).toBe(true);
    expect(declared.has("1.5")).toBe(false);
    expect(declared.size).toBeGreaterThan(5);
  });

  /*
   * Without this the guard below would pass on an empty list — which is what
   * a renamed directory looks like, and it would look exactly like success.
   */
  it("finds the route's sources to check", () => {
    const files = sourceFiles();

    expect(files.length).toBeGreaterThan(5);
    expect(files).toContain(join(ROUTE, "page.tsx"));
    expect(files).toContain(join(ROUTE, "sections", "DomainSection.tsx"));
  });

  it("uses only spacing steps the theme declares", () => {
    const declared = declaredSpacingSteps();
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      for (const step of spacingStepsIn(
        readFileSync(join(APP_ROOT, file), "utf8")
      )) {
        if (!declared.has(step)) {
          offenders.push(`${file}: ${step}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
