import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Nothing in this app may import the legacy stack's backend clients.
 *
 * `apps/mobile` talks to the Payload API in `apps/site` and nothing else. The
 * workspace packages that wrapped Convex, WorkOS and the oRPC client are gone,
 * so an import of one of those fails to resolve on its own; what can still
 * creep back in is the npm packages themselves, added "just for now".
 *
 * Modelled on `apps/site/src/authBoundary.test.ts`, including its
 * file-count self-check: a glob that matches nothing passes every assertion
 * in this file.
 *
 * `forbiddenPattern` requires the specifier to end (a closing quote) or
 * continue as a subpath (`/`) right where the forbidden name does, so
 * `convex` does not also match an unrelated package whose name merely starts
 * with it.
 */
const FORBIDDEN = ["convex", "@workos-inc", "@orpc"];

const ROOT = join(__dirname, "..");

function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) {
      continue;
    }

    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      sources(full, found);
    } else if (/\.tsx?$/.test(entry.name)) {
      found.push(full);
    }
  }

  return found;
}

function forbiddenPattern(pkg: string): RegExp {
  const escaped = pkg.replace("/", "\\/");

  return new RegExp(`from ["']${escaped}["'/]`);
}

describe("the mobile app's dependency boundary", () => {
  const files = [...sources(join(ROOT, "app")), ...sources(join(ROOT, "src"))];

  it("found files to check", () => {
    expect(files.length).toBeGreaterThan(2);
  });

  it.each(FORBIDDEN)("imports nothing from %s", (pkg) => {
    const pattern = forbiddenPattern(pkg);
    const offenders = files.filter((file) =>
      pattern.test(readFileSync(file, "utf8"))
    );

    expect(offenders).toEqual([]);
  });

  /**
   * Expo Router builds its route table with `require.context` over the whole
   * of `app/`, so **every** file there is bundled — including a test file,
   * which drags `@testing-library/react-native` in with it. That package
   * imports node's `console`, which Metro cannot resolve, and `expo export`
   * fails outright while `bun -F mobile test` stays perfectly green.
   *
   * That is exactly what happened: a screen test written at
   * `app/(auth)/sign-up.test.tsx` passed locally and turned `release-check`
   * red. Screen tests live in `src/screens/` and import the route module
   * from `app/`; nothing under `app/` is anything but a route.
   */
  it("keeps test files out of the route directory", () => {
    const inRoutes = sources(join(ROOT, "app")).filter((file) =>
      /\.(test|spec)\.tsx?$/.test(file)
    );

    expect(inRoutes).toEqual([]);
  });

  it("lists none of them in package.json either", () => {
    const manifest = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf8")
    ) as { dependencies?: Record<string, string> };

    const declared = Object.keys(manifest.dependencies ?? {});

    expect(
      FORBIDDEN.filter((pkg) =>
        declared.some((name) => name === pkg || name.startsWith(`${pkg}/`))
      )
    ).toEqual([]);
  });
});
