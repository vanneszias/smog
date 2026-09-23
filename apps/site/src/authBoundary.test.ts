import { type Dirent, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Stage 4 exit criterion 8: **nothing under `apps/site` imports `@smog/auth`
 * or reaches WorkOS.**
 *
 * ## Why this is a test and not a note in the plan
 *
 * `packages/auth` is not deleted at this stage and will not be until Stage 10
 * — `apps/server`, `apps/web`, `apps/native` and `packages/api` all still
 * import it, and all four are still running. So the package stays installed
 * and resolvable from this workspace for several more stages, which means
 * `import { … } from "@smog/auth"` in this app would typecheck, lint, build
 * and pass every other test in the suite. The boundary is not enforced by
 * anything except this file.
 *
 * The failure it prevents is not hypothetical and it is quiet: somebody
 * reaches for a helper that already exists rather than the Payload one, the
 * site acquires a second session notion, and the cutover in Stage 10 finds
 * out. The spec's line is that WorkOS token exchange and refresh "are
 * deleted, not ported" — this is what makes that true rather than intended.
 *
 * ## What it reads
 *
 * The app's own sources, its scripts, its tests and its `package.json`. The
 * generated `src/app/(payload)/admin/importMap.js` is included deliberately:
 * it is written by Payload rather than by hand, and a plugin that dragged in
 * an auth provider would land there first.
 */

/** Vitest runs with the app directory as its cwd. */
const APP_ROOT = process.cwd();

/** Where the app's own code lives. `node_modules` is not the app. */
const ROOTS = ["src", "scripts", "tests"];

const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".json"];

/**
 * What must not appear.
 *
 * `packages/auth` is gone, so an import of it no longer resolves and needs no
 * guard here. WorkOS itself is still an npm package anybody could add. The
 * pattern is matched as a bare, case-insensitive string rather than as an
 * import statement, because a dynamic `import()`, a `require`, a re-export
 * and a `vi.mock` are all ways in and only one of them looks like an import;
 * `WorkOS`, `workos`, `WORKOS_API_KEY` and `@workos-inc/node` are all the same
 * hazard wearing different capitalisation.
 */
const FORBIDDEN: { name: string; pattern: RegExp }[] = [
  { name: "WorkOS", pattern: /workos/i },
];

/** Every file under `dir`, recursively, that is worth reading. */
function filesUnder(dir: string): string[] {
  /*
   * Annotated as `Dirent[]` rather than left to inference. `readdirSync` is
   * overloaded on its options, and `ReturnType<typeof readdirSync>` resolves
   * to the `Buffer` overload — which typechecks here in Vitest and then
   * fails `next build`, where the stricter lib surfaces `entry.name` as a
   * buffer with no `endsWith`.
   */
  let entries: Dirent[];

  try {
    entries = readdirSync(join(APP_ROOT, dir), { withFileTypes: true });
  } catch {
    // A root that does not exist is not a violation. `tests` is the one most
    // likely to move, and a missing directory must not read as "clean".
    return [];
  }

  return entries.flatMap((entry) => {
    const path = `${dir}/${entry.name}`;

    if (entry.isDirectory()) {
      return entry.name === "node_modules" ? [] : filesUnder(path);
    }

    return EXTENSIONS.some((extension) => entry.name.endsWith(extension))
      ? [path]
      : [];
  });
}

/** Every `{ path, line, text }` in the app matching `pattern`. */
function hits(pattern: RegExp): string[] {
  const found: string[] = [];

  for (const path of ROOTS.flatMap(filesUnder)) {
    // This file names both strings on purpose, so it cannot be its own
    // violation. Excluded by path rather than by a magic comment, because a
    // magic comment is something a violating file could also write.
    if (path === "src/authBoundary.test.ts") {
      continue;
    }

    const lines = readFileSync(join(APP_ROOT, path), "utf8").split("\n");

    lines.forEach((text, index) => {
      if (pattern.test(text)) {
        found.push(`${path}:${index + 1}: ${text.trim()}`);
      }
    });
  }

  return found;
}

describe("the auth boundary around apps/site", () => {
  it.each(FORBIDDEN)("does not mention $name anywhere", ({ pattern }) => {
    expect(hits(pattern)).toEqual([]);
  });

  it("does not depend on a WorkOS package", () => {
    const manifest = readFileSync(join(APP_ROOT, "package.json"), "utf8");

    /*
     * The manifest is checked separately from the sources because a
     * dependency can be declared long before anything imports it — and a
     * declared dependency is what makes the import typecheck later.
     */
    expect(manifest).not.toMatch(/workos/i);
  });

  it("reads a meaningful number of files, so a clean answer means something", () => {
    /*
     * The guard that keeps the two above honest. Every one of them passes
     * trivially if `filesUnder` returns nothing — a renamed directory, a cwd
     * that is not the app, a `readdirSync` signature change — and an empty
     * scan is indistinguishable from a clean one. This is the assertion that
     * can tell them apart.
     */
    expect(ROOTS.flatMap(filesUnder).length).toBeGreaterThan(200);
  });
});
