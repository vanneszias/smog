import { describe, expect, test } from "bun:test";
import { StallReporter } from "./vitest";

const ROOT = process.cwd();

function moduleOf(name: string, state = "passed") {
  return { moduleId: `${ROOT}/test/${name}`, state: () => state };
}

function testOf(id: string, module: ReturnType<typeof moduleOf>) {
  return { fullName: `test ${id}`, id, module };
}

function harness() {
  let now = 0;
  const exits: number[] = [];
  const lines: string[] = [];
  const reporter = new StallReporter({
    exit: (code) => exits.push(code),
    log: (line) => lines.push(line),
    now: () => now,
  });
  return {
    advance: (ms: number) => {
      now += ms;
      reporter.check();
    },
    exits,
    lines,
    reporter,
  };
}

describe("StallReporter", () => {
  test("names the open file and its running test after a stall", () => {
    const { advance, lines, reporter } = harness();
    const a = moduleOf("a.test.ts");
    reporter.onTestRunStart([{}, {}]);
    reporter.onTestModuleQueued(a);
    reporter.onTestCaseReady(testOf("1", a));
    advance(149_000);
    expect(lines).toEqual([]);
    advance(2000);
    expect(lines.join("\n")).toContain("No test finished for 151s");
    expect(lines.join("\n")).toContain("test/a.test.ts (running, 151s)");
    expect(lines.join("\n")).toContain("> test 1 (151s)");
  });

  test("ends a run whose files all finished but whose pool never did", () => {
    const { advance, exits, lines, reporter } = harness();
    const a = moduleOf("a.test.ts");
    const b = moduleOf("b.test.ts");
    reporter.onTestRunStart([{}, {}]);
    for (const module of [a, b]) {
      reporter.onTestModuleQueued(module);
      reporter.onTestModuleEnd(module);
    }
    advance(59_000);
    expect(exits).toEqual([]);
    advance(2000);
    expect(exits).toEqual([0]);
    expect(lines.join("\n")).toContain(
      "All 2 test files finished (2 passed, 0 failed)"
    );
  });

  test("exits 1 when a file failed, and never before every file ended", () => {
    const { advance, exits, reporter } = harness();
    const a = moduleOf("a.test.ts", "failed");
    reporter.onTestRunStart([{}, {}]);
    reporter.onTestModuleQueued(a);
    reporter.onTestModuleEnd(a);
    advance(600_000);
    expect(exits).toEqual([]);
    const b = moduleOf("b.test.ts");
    reporter.onTestModuleQueued(b);
    reporter.onTestModuleEnd(b);
    advance(61_000);
    expect(exits).toEqual([1]);
  });

  test("leaves a run that ends normally alone", () => {
    const { advance, exits, reporter } = harness();
    const a = moduleOf("a.test.ts");
    reporter.onTestRunStart([{}]);
    reporter.onTestModuleQueued(a);
    reporter.onTestModuleEnd(a);
    reporter.onTestRunEnd();
    advance(600_000);
    expect(exits).toEqual([]);
  });
});
