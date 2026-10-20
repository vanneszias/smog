import { appendFileSync, existsSync, readFileSync } from "node:fs";

/**
 * `bun scripts/e2e-flaky-report.ts [report.json]` (phase 9 ruling 2).
 *
 * Reads Playwright's JSON report (`playwright-report/results.json`, written
 * by the CI reporter) and lists every test that failed and then passed on
 * its retry ("flaky"). A flaky pass does not fail the job, but it is a bug:
 * it goes to the job summary (`GITHUB_STEP_SUMMARY`) and to a `::warning::`
 * annotation per test. A missing report prints a notice and exits 0 (the
 * run itself already failed or never started).
 */

export interface FlakyTest {
  file: string;
  project: string;
  retries: number;
  title: string;
}

interface JsonTest {
  projectName?: unknown;
  results?: unknown;
  status?: unknown;
}

interface JsonSpec {
  file?: unknown;
  tests?: unknown;
  title?: unknown;
}

interface JsonSuite {
  specs?: unknown;
  suites?: unknown;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function walk(suite: JsonSuite, titles: string[], found: FlakyTest[]): void {
  for (const raw of asArray(suite.specs)) {
    const spec = raw as JsonSpec;
    for (const rawTest of asArray(spec.tests)) {
      const test = rawTest as JsonTest;
      if (test.status === "flaky") {
        found.push({
          file: asString(spec.file),
          project: asString(test.projectName),
          retries: Math.max(0, asArray(test.results).length - 1),
          title: [...titles, asString(spec.title)].filter(Boolean).join(" > "),
        });
      }
    }
  }
  for (const raw of asArray(suite.suites)) {
    const child = raw as JsonSuite & { title?: unknown };
    const title = asString(child.title);
    // A file-level suite repeats the file name; the spec carries it already.
    const isFile = title.endsWith(".ts");
    walk(child, isFile || !title ? titles : [...titles, title], found);
  }
}

/** The flaky tests of a parsed Playwright JSON report. */
export function findFlaky(report: unknown): FlakyTest[] {
  const found: FlakyTest[] = [];
  walk((report ?? {}) as JsonSuite, [], found);
  return found;
}

function escapeAnnotation(text: string): string {
  return text
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

/** One `::warning::` line per flaky test. */
export function warningLines(flaky: readonly FlakyTest[]): string[] {
  return flaky.map(
    (test) =>
      `::warning file=apps/site/e2e/${escapeAnnotation(test.file)},title=Flaky e2e test::${escapeAnnotation(
        `[${test.project}] ${test.title} passed only on a retry`
      )}`
  );
}

/** The job summary (Markdown). */
export function summaryMarkdown(flaky: readonly FlakyTest[]): string {
  if (flaky.length === 0) {
    return "### Playwright e2e: no flaky tests\n";
  }
  const rows = flaky.map(
    (test) =>
      `| ${test.project} | \`${test.file}\` | ${test.title.replaceAll("|", "\\|")} | ${test.retries} |`
  );
  return [
    `### Playwright e2e: ${flaky.length} flaky test${flaky.length === 1 ? "" : "s"}`,
    "",
    "Each passed only on a retry. That is a bug to fix, not a pass to accept.",
    "",
    "| Project | File | Test | Retries |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

if (import.meta.main) {
  const path = process.argv[2] ?? "playwright-report/results.json";
  if (existsSync(path)) {
    let flaky: FlakyTest[] = [];
    try {
      flaky = findFlaky(JSON.parse(readFileSync(path, "utf8")));
    } catch (error) {
      // A deadline kill can leave a truncated report: the run already failed.
      console.log(
        `[e2e-flaky-report] Failed to read ${path} (${String(error)}); nothing to report.`
      );
    }
    for (const line of warningLines(flaky)) {
      console.log(line);
    }
    const summary = summaryMarkdown(flaky);
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
    }
  } else {
    console.log(`[e2e-flaky-report] No report at ${path}; nothing to check.`);
  }
}
