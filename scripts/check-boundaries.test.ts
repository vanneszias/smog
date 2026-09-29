import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { checkBoundaries, formatViolation } from "./check-boundaries";

const FIXTURES = join(import.meta.dir, "__fixtures__", "boundaries");

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
    ]);
  });

  test("passes on the real repository", () => {
    expect(checkBoundaries(join(import.meta.dir, ".."))).toEqual([]);
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
