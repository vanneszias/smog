import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findFlaky, summaryMarkdown, warningLines } from "./e2e-flaky-report";

const REPORT = {
  suites: [
    {
      suites: [
        {
          specs: [
            {
              file: "auth.spec.ts",
              tests: [
                {
                  projectName: "public",
                  results: [{ status: "failed" }, { status: "passed" }],
                  status: "flaky",
                },
              ],
              title: "signs in",
            },
            {
              file: "auth.spec.ts",
              tests: [
                {
                  projectName: "public",
                  results: [{ status: "passed" }],
                  status: "expected",
                },
              ],
              title: "signs out",
            },
          ],
          title: "a group",
        },
      ],
      title: "auth.spec.ts",
    },
  ],
};

describe("findFlaky", () => {
  test("lists only the tests that passed on a retry", () => {
    expect(findFlaky(REPORT)).toEqual([
      {
        file: "auth.spec.ts",
        project: "public",
        retries: 1,
        title: "a group > signs in",
      },
    ]);
  });

  test("finds nothing in an empty or odd report", () => {
    expect(findFlaky({})).toEqual([]);
    expect(findFlaky(null)).toEqual([]);
  });
});

describe("the outputs", () => {
  test("one warning annotation per flaky test", () => {
    const [line] = warningLines(findFlaky(REPORT));
    expect(line).toStartWith("::warning file=apps/site/e2e/auth.spec.ts");
    expect(line).toContain("a group > signs in passed only on a retry");
  });

  test("the summary names the test, or says there are none", () => {
    expect(summaryMarkdown(findFlaky(REPORT))).toContain("1 flaky test");
    expect(summaryMarkdown([])).toContain("no flaky tests");
  });
});

describe("the command", () => {
  test("tolerates a truncated report (warns, exits 0)", () => {
    const dir = mkdtempSync(join(tmpdir(), "flaky-"));
    try {
      const path = join(dir, "results.json");
      writeFileSync(path, '{"suites": [{"specs": [');
      const run = Bun.spawnSync(["bun", "scripts/e2e-flaky-report.ts", path], {
        cwd: join(import.meta.dir, ".."),
      });
      expect(run.exitCode).toBe(0);
      expect(run.stdout.toString()).toContain("Failed to read");
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});
