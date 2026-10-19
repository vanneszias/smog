import { describe, expect, test } from "bun:test";
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
