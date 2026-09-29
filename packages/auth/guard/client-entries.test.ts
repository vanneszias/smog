import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * The client entries must never reach the server config or anything that
 * references Workers types (the apps typecheck and bundle them without
 * those). `tsconfig.client.json` checks the same from the type side.
 */
const SRC = join(import.meta.dir, "..", "src");
const CLIENT_ENTRIES = ["web.ts", "expo.ts", "react.tsx"];
const FORBIDDEN_FILES = ["server.ts", "env.ts", "session.ts", "index.ts"];
const FORBIDDEN_PACKAGES = [
  "@smog/db",
  "@smog/email",
  "better-auth/adapters",
  "better-auth/plugins",
  "cloudflare:",
  "drizzle-orm",
];
const IMPORT = /(?:import|export)\s[^;]*?from\s+"([^"]+)"|import\("([^"]+)"\)/g;

function specifiers(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(IMPORT)].map((m) => m[1] ?? m[2] ?? "");
}

function resolveLocal(from: string, specifier: string): string {
  const base = join(dirname(from), specifier);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, base]) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // try the next extension
    }
  }
  throw new Error(`cannot resolve ${specifier} from ${from}`);
}

/** Every local file and package specifier reachable from `entry`. */
function graph(entry: string): { files: string[]; packages: string[] } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [join(SRC, entry)];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (files.has(file)) {
      continue;
    }
    files.add(file);
    for (const specifier of specifiers(file)) {
      if (specifier.startsWith(".")) {
        queue.push(resolveLocal(file, specifier));
      } else {
        packages.add(specifier);
      }
    }
  }
  return {
    files: [...files].map((f) => f.slice(SRC.length + 1)).sort(),
    packages: [...packages].sort(),
  };
}

describe("client entries", () => {
  test.each(CLIENT_ENTRIES)("%s imports no server module", (entry) => {
    const { files, packages } = graph(entry);

    expect(files).toContain(entry);
    for (const file of FORBIDDEN_FILES) {
      expect(files).not.toContain(file);
    }
    for (const specifier of packages) {
      for (const forbidden of FORBIDDEN_PACKAGES) {
        expect(specifier.startsWith(forbidden)).toBe(false);
      }
    }
  });

  test("the guard itself sees the server graph", () => {
    const { files, packages } = graph("server.ts");
    expect(files).toContain("fields.ts");
    expect(packages).toContain("@smog/db");
  });
});
