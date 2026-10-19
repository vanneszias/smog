import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECTS, planRuns } from "./e2e";

const ROOT = join(import.meta.dir, "..");
const E2E_DIR = join(ROOT, "apps", "site", "e2e");
const CONFIG = readFileSync(
  join(ROOT, "apps", "site", "playwright.config.ts"),
  "utf8"
);
const PROJECT_NAME = /^\s{6}name: "([^"]+)",$/gm;
const SPEC = /\.spec\.ts$/;
const DEPENDENCIES = /^\s+dependencies:/m;

describe("planRuns", () => {
  test("runs every project in order, each as its own command", () => {
    expect(planRuns([])).toEqual([
      ["--project", "public"],
      ["--project", "a11y", "--pass-with-no-tests"],
      ["--project", "admin"],
      ["--project", "admin-a11y"],
      ["--project", "serial"],
    ]);
  });

  test("passes the other arguments to each project", () => {
    expect(planRuns(["--grep", "sponsor"])[0]).toEqual([
      "--project",
      "public",
      "--grep",
      "sponsor",
    ]);
  });

  test("runs only the project it is given", () => {
    expect(planRuns(["--project", "admin"])).toEqual([["--project", "admin"]]);
    expect(planRuns(["--project=serial", "--workers=1"])).toEqual([
      ["--project=serial", "--workers=1"],
    ]);
  });

  test("lets only the accessibility project be empty", () => {
    expect(planRuns(["--project", "a11y"])).toEqual([
      ["--project", "a11y", "--pass-with-no-tests"],
    ]);
    expect(planRuns(["--project", "public"])[0]).not.toContain(
      "--pass-with-no-tests"
    );
  });
});

describe("the Playwright projects", () => {
  test("the config and the runner name the same projects in the same order", () => {
    const names = [...CONFIG.matchAll(PROJECT_NAME)].map((m) => m[1]);
    expect(names).toEqual([...PROJECTS]);
  });

  test("no project depends on another (a shard runs one alone)", () => {
    expect(CONFIG).not.toMatch(DEPENDENCIES);
  });
});

describe("the e2e specs", () => {
  test("never sleep: waitForTimeout is banned (wait on a condition)", () => {
    const offenders: string[] = [];
    for (const name of readdirSync(E2E_DIR, { recursive: true }) as string[]) {
      if (!(name.endsWith(".ts") || name.endsWith(".tsx"))) {
        continue;
      }
      const source = readFileSync(join(E2E_DIR, name), "utf8");
      if (source.includes("waitForTimeout(")) {
        offenders.push(name);
      }
    }
    expect(offenders).toEqual([]);
    expect(readdirSync(E2E_DIR).filter((name) => SPEC.test(name))).not.toEqual(
      []
    );
  });
});
