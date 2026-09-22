import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Nothing in this app may import a package Stage 10 deletes.
 *
 * `apps/mobile` exists to replace `apps/native`, and the whole point of it
 * being a new app rather than an edit of the old one is that it never
 * acquires a dependency on Convex, WorkOS or the oRPC client. An import
 * added "just for now" is how the cutover stage discovers it has a migration
 * to do rather than a deletion.
 *
 * Modelled on `apps/site/src/authBoundary.test.ts`, including its
 * file-count self-check: a glob that matches nothing passes every assertion
 * in this file.
 *
 * One correction from the plan's own draft of this file: `@smog/ui` here
 * means the legacy package literally named `@smog/ui` (`apps/web`'s kit,
 * bound for deletion alongside Convex and the oRPC client) — not this app's
 * required `@smog/ui-native`. A plain substring match on `@smog/ui` would
 * also match `from "@smog/ui-native"`, which is exactly the import the
 * kitchen-sink route in `app/index.tsx` must make, so `forbiddenPattern`
 * requires the specifier to end (a closing quote) or continue as a subpath
 * (`/`) right where `@smog/ui` does — never a hyphen straight into another
 * package's name.
 */
const FORBIDDEN = [
  "@smog/api",
  "@smog/auth",
  "@smog/convex",
  "@smog/hooks",
  "@smog/ui",
  "convex",
  "@workos-inc",
];

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

  it("lists none of them in package.json either", () => {
    const manifest = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf8")
    ) as { dependencies?: Record<string, string> };

    expect(
      FORBIDDEN.filter((pkg) => manifest.dependencies?.[pkg] !== undefined)
    ).toEqual([]);
  });
});
