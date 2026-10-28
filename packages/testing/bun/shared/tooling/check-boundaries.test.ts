import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkBoundaries,
  formatViolation,
} from "../../../../../scripts/check-boundaries";

const FIXTURES = new URL(
  "../../../support/tooling/__fixtures__/boundaries",
  import.meta.url
).pathname;

describe("checkBoundaries", () => {
  test("passes on an allowed graph", () => {
    expect(checkBoundaries(join(FIXTURES, "ok"))).toEqual([]);
  });

  test("reports a forbidden workspace dependency", () => {
    expect(checkBoundaries(join(FIXTURES, "bad"))).toEqual([
      { from: "@smog/ui-web", to: "@smog/db" },
    ]);
  });

  test("reports forbidden imports, undeclared imports, unknown packages and runtime tooling deps", () => {
    const violations = checkBoundaries(join(FIXTURES, "bad-imports"));

    expect(violations).toEqual([
      {
        file: "packages/features/lists/src/server.ts",
        from: "@smog/lists",
        to: "@smog/gestures/server",
      },
      {
        file: "packages/features/lists/src/server.ts",
        from: "@smog/lists",
        reason: "undeclared",
        to: "@smog/utils",
      },
      { from: "@smog/mystery", reason: "unknown", to: "@smog/mystery" },
      { from: "@smog/ui-web", to: "@smog/config" },
    ]);
  });

  test("checks optionalDependencies and vi.mock / jest.mock specifiers", () => {
    expect(checkBoundaries(join(FIXTURES, "bad-mocks"))).toEqual([
      { from: "@smog/ui-web", to: "@smog/db" },
      {
        file: "packages/ui-web/src/button.mocks.tsx",
        from: "@smog/ui-web",
        to: "@smog/auth",
      },
      ...["@smog/email", "@smog/jobs", "@smog/payments", "@smog/video"].map(
        (to) => ({
          file: "packages/ui-web/src/button.mocks.tsx",
          from: "@smog/ui-web",
          to,
        })
      ),
    ]);
  });

  test("checks the root package: its scripts and top-level files", () => {
    expect(checkBoundaries(join(FIXTURES, "bad-scripts"))).toEqual([
      { from: "smog", to: "@smog/ui-web" },
      {
        file: "scripts/grant.ts",
        from: "smog",
        to: "@smog/admin/server",
      },
      {
        file: "scripts/grant.ts",
        from: "smog",
        reason: "undeclared",
        to: "@smog/gestures/schema",
      },
      { file: "vite.config.ts", from: "smog", to: "@smog/db" },
    ]);
  });

  test("passes on the real repository", () => {
    expect(
      checkBoundaries(new URL("../../../../..", import.meta.url).pathname)
    ).toEqual([]);
  });
});

describe("the PDF engine (phase 10c ruling 1)", () => {
  test("only @smog/lessons and the site depend on @smog/pdf", () => {
    const root = new URL("../../../../..", import.meta.url).pathname;
    const dependents: string[] = [];
    for (const pattern of ["apps/*", "packages/*", "packages/features/*"]) {
      for (const path of new Bun.Glob(`${pattern}/package.json`).scanSync({
        cwd: root,
      })) {
        const manifest = JSON.parse(readFileSync(join(root, path), "utf8")) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
          name: string;
        };
        const deps = { ...manifest.dependencies, ...manifest.devDependencies };
        if (deps["@smog/pdf"]) {
          dependents.push(manifest.name);
        }
      }
    }
    for (const name of dependents) {
      expect(["@smog/lessons", "@smog/site", "@smog/testing"]).toContain(name);
    }
  });
});

describe("formatViolation", () => {
  test("describes each kind", () => {
    expect(formatViolation({ from: "@smog/ui-web", to: "@smog/db" })).toBe(
      "@smog/ui-web may not depend on @smog/db"
    );
    expect(
      formatViolation({ file: "src/a.ts", from: "@smog/a", to: "@smog/b/x" })
    ).toBe("src/a.ts: @smog/a may not import @smog/b/x");
    expect(
      formatViolation({
        file: "src/a.ts",
        from: "@smog/a",
        reason: "undeclared",
        to: "@smog/b",
      })
    ).toBe("src/a.ts: @smog/a imports @smog/b without declaring it");
    expect(
      formatViolation({ from: "@smog/a", reason: "unknown", to: "@smog/a" })
    ).toBe("@smog/a is not listed in @smog/config/boundaries");
  });
});
