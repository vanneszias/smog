import { describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { commandFor, invocationFor, parseRunnerArgs } from "../../../runner";
import {
  discoverSuites,
  REPO_ROOT,
  selectSuites,
  TEST_ROOT,
} from "../../../suites";

const SKIPPED =
  /(^|\/)(node_modules|dist|build|\.wrangler|\.expo|\.output|\.tanstack|\.turbo|ios|android)\//;
const TEST_FILE = /\.(test|spec)\.[jt]sx?$/;
const IMPORT = /(?:from\s*|import\s*\(?\s*|require\s*\(\s*)["']([^"']+)["']/g;
const TESTING_IMPORT = /^@smog\/testing(?:\/|$)/;

describe("test suite selection", () => {
  test("missing selector values never fall back to running every suite", () => {
    expect(() => parseRunnerArgs(["--feature"])).toThrow();
    expect(() => parseRunnerArgs(["--package"])).toThrow();
    expect(() => parseRunnerArgs(["--runtime"])).toThrow();
  });

  test("a feature browser run leaves deadlines to its seven individual shards", () => {
    const [suite] = selectSuites({
      e2e: true,
      feature: "lessons",
      runtime: "e2e",
    });
    if (!suite) {
      throw new Error("Missing browser suite");
    }
    const featureCommand = invocationFor(suite, { feature: "lessons" });
    expect(featureCommand[1]).toBe(join(TEST_ROOT, "e2e.ts"));
    expect(featureCommand).not.toContain(join(TEST_ROOT, "deadline.ts"));
    expect(invocationFor(suite)[1]).toBe(join(TEST_ROOT, "deadline.ts"));
  });
  test("a feature includes its package, web, native and browser coverage", () => {
    const suites = selectSuites({ e2e: true, feature: "lessons" });
    expect(new Set(suites.map((suite) => suite.runtime))).toEqual(
      new Set(["bun", "workers", "native", "e2e"])
    );
    expect(suites.every((suite) => suite.tests.length > 0)).toBe(true);
  });

  test("browser tests are opt-in and unknown selections fail instead of succeeding empty", () => {
    expect(selectSuites().some((suite) => suite.runtime === "e2e")).toBe(false);
    expect(() => selectSuites({ feature: "lesons" })).toThrow(
      "No test suites match"
    );
    expect(() => selectSuites({ runtime: "unknown" })).toThrow(
      "No test suites match"
    );
  });

  test("package forwards preserve ownership and never run another package's files", () => {
    const selected = selectSuites({ owner: "@smog/gestures" });
    expect(selected.map((suite) => suite.runtime).sort()).toEqual([
      "bun",
      "workers",
    ]);
    expect(
      selected
        .flatMap((suite) => suite.tests)
        .some((file) => file.includes("/site/"))
    ).toBe(false);
  });

  test("every test belongs to one nonempty suite with the right runner", () => {
    const suites = discoverSuites();
    expect(suites.every((suite) => suite.tests.length > 0)).toBe(true);
    const tests = suites.flatMap((suite) => suite.tests);
    expect(new Set(tests).size).toBe(tests.length);
    const inventory = [
      ...new Bun.Glob("**/*.{test,spec}.{ts,tsx}").scanSync({
        cwd: TEST_ROOT,
        onlyFiles: true,
      }),
    ].filter((file) => !SKIPPED.test(file));
    expect(tests.toSorted()).toEqual(inventory.toSorted());
    for (const suite of suites) {
      expect(
        suite.tests.every((file) => file.startsWith(`${suite.runtime}/`))
      ).toBe(true);
      expect(commandFor(suite).join(" ")).not.toContain("--passWithNoTests");
    }
  });

  test("an unregistered test fails discovery instead of disappearing", () => {
    const root = mkdtempSync(join(tmpdir(), "smog-test-discovery-"));
    try {
      for (const runtime of ["bun", "workers", "native", "e2e"]) {
        mkdirSync(join(root, runtime));
      }
      mkdirSync(join(root, "bun/unowned"));
      writeFileSync(join(root, "bun/unowned/new.test.ts"), "export {};");
      expect(() => discoverSuites(root)).toThrow(
        "Test must belong to exactly one suite"
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test("DOM setup is confined to DOM suites and runner arguments remain literal", () => {
    const [dom] = selectSuites({ owner: "ui-web" });
    const [pure] = selectSuites({ owner: "utils" });
    if (!(dom && pure)) {
      throw new Error("Missing core suites");
    }
    expect(commandFor(dom)).toContain("--preload");
    expect(commandFor(pure)).not.toContain("--preload");
    expect(
      commandFor(pure, ["--test-name-pattern", "a b; echo nope"]).slice(-2)
    ).toEqual(["--test-name-pattern", "a b; echo nope"]);
  });

  test("production trees contain no tests and no imports of testing support", () => {
    for (const file of new Bun.Glob(
      "{apps,packages,scripts}/**/*.{ts,tsx,js,cjs}"
    ).scanSync({ cwd: REPO_ROOT, onlyFiles: true })) {
      if (file.startsWith("packages/testing/") || SKIPPED.test(file)) {
        continue;
      }
      expect(file).not.toMatch(TEST_FILE);
      const source = readFileSync(join(REPO_ROOT, file), "utf8");
      for (const match of source.matchAll(IMPORT)) {
        const specifier = match[1] ?? "";
        if (specifier.startsWith(".")) {
          expect(
            resolve(REPO_ROOT, file, "..", specifier).startsWith(TEST_ROOT),
            file
          ).toBe(false);
        }
        expect(specifier, file).not.toMatch(TESTING_IMPORT);
      }
    }
  });
});
