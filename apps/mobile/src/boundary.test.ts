import { readdirSync } from "node:fs";
import { join } from "node:path";

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

describe("the route directory", () => {
  const routes = sources(join(ROOT, "app"));

  /* A walk that matches nothing passes every assertion in this file. */
  it("found files to check", () => {
    expect(routes.length).toBeGreaterThan(2);
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
    const inRoutes = routes.filter((file) => /\.(test|spec)\.tsx?$/.test(file));

    expect(inRoutes).toEqual([]);
  });
});
