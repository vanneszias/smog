import { describe, expect, test } from "bun:test";
import { StallReporter } from "./vitest";

const ROOT = process.cwd();
const GRACE_MS = 180_000;

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
  const run = (...modules: ReturnType<typeof moduleOf>[]) => {
    for (const module of modules) {
      reporter.onTestModuleQueued(module);
      reporter.onTestModuleEnd(module);
    }
  };
  return {
    advance: (ms: number) => {
      now += ms;
      reporter.check();
    },
    exits,
    lines,
    reporter,
    run,
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
    const text = lines.join("\n");
    expect(text).toContain("No test finished for 151s");
    expect(text).toContain("test/a.test.ts (running, 151s)");
    expect(text).toContain("> test 1 (151s)");
  });

  test("ends a run whose files all finished but whose pool never did (exit 0)", () => {
    const { advance, exits, lines, reporter, run } = harness();
    reporter.onTestRunStart([{}, {}]);
    run(moduleOf("a.test.ts"), moduleOf("b.test.ts"));
    advance(GRACE_MS - 1000);
    expect(exits).toEqual([]);
    advance(2000);
    expect(exits).toEqual([0]);
    expect(lines.join("\n")).toContain(
      "2 of 2 test files finished (2 passed, 0 failed)"
    );
  });

  test("exits 75 (retry) when files never ran and none failed", () => {
    const { advance, exits, lines, reporter, run } = harness();
    reporter.onTestRunStart([{}, {}, {}]);
    run(moduleOf("a.test.ts"));
    advance(GRACE_MS + 1000);
    expect(exits).toEqual([75]);
    expect(lines.join("\n")).toContain(
      "1 of 3 test files finished (1 passed, 0 failed)"
    );
    expect(lines.join("\n")).toContain("2 never ran");
  });

  test("exits 1 when a finished file failed", () => {
    const { advance, exits, reporter, run } = harness();
    reporter.onTestRunStart([{}]);
    run(moduleOf("a.test.ts", "failed"));
    advance(GRACE_MS + 1000);
    expect(exits).toEqual([1]);
  });

  test("waits while a file is open, and for a slow next worker", () => {
    const { advance, exits, reporter, run } = harness();
    const b = moduleOf("b.test.ts");
    reporter.onTestRunStart([{}, {}]);
    run(moduleOf("a.test.ts"));
    advance(GRACE_MS - 1000);
    reporter.onTestModuleQueued(b);
    advance(600_000);
    expect(exits).toEqual([]);
  });

  test("leaves a run that ends normally alone", () => {
    const { advance, exits, reporter, run } = harness();
    reporter.onTestRunStart([{}]);
    run(moduleOf("a.test.ts"));
    reporter.onTestRunEnd();
    advance(600_000);
    expect(exits).toEqual([]);
  });
});
