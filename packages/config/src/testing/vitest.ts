/**
 * Shared Vitest settings for the Workers-pool configs
 * (`@cloudflare/vitest-plugin`): timeouts and reporters that make a stuck
 * run loud (docs/DECISIONS.md, "CI test hang"). Config files only; never
 * imported by runtime code.
 *
 * Vitest bounds a test (`testTimeout`) and a hook (`hookTimeout`) inside
 * workerd, and the shutdown (`teardownTimeout`). It does not bound loading
 * a test file (its imports go to the main process over an RPC without a
 * timeout), nor a workerd that stops answering. `StallReporter` covers
 * those: when no test has finished for 2.5 minutes it prints which files are
 * loading or running, and which tests, and for how long. The wall-clock
 * limit around the command (`scripts/test-deadline.ts`) then kills it.
 */

/** Structural slices of Vitest's reported tasks (`vitest/node`). */
interface ReportedModule {
  moduleId: string;
}
interface ReportedTest {
  fullName: string;
  id: string;
  module: ReportedModule;
}

// Above the site warm-up (the first transform of the server entry takes up
// to 2 minutes on a loaded machine), so a report means something.
const STALL_MS = 150_000;
const CHECK_MS = 15_000;

function seconds(ms: number): string {
  return `${Math.round(ms / 1000)}s`;
}

export class StallReporter {
  private readonly modules = new Map<string, number>();
  private readonly tests = new Map<
    string,
    { moduleId: string; name: string; since: number }
  >();
  private lastProgress = Date.now();
  private lastWarning = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly logStarts: boolean;
  private readonly root = process.cwd();

  constructor(options: { logStarts?: boolean } = {}) {
    this.logStarts = options.logStarts ?? false;
  }

  private relative(moduleId: string): string {
    return moduleId.startsWith(`${this.root}/`)
      ? moduleId.slice(this.root.length + 1)
      : moduleId;
  }

  private progress(): void {
    this.lastProgress = Date.now();
    this.lastWarning = 0;
  }

  private check(): void {
    const now = Date.now();
    const quiet = now - this.lastProgress;
    if (quiet < STALL_MS || now - this.lastWarning < STALL_MS) {
      return;
    }
    this.lastWarning = now;
    const lines = [
      `[vitest-stall] No test finished for ${seconds(quiet)}. Still open:`,
    ];
    for (const [moduleId, since] of this.modules) {
      const running = [...this.tests.values()].filter(
        (test) => test.moduleId === moduleId
      );
      const state = running.length > 0 ? "running" : "loading or in hooks";
      lines.push(
        `  ${this.relative(moduleId)} (${state}, ${seconds(now - since)})`
      );
      for (const test of running) {
        lines.push(`    > ${test.name} (${seconds(now - test.since)})`);
      }
    }
    if (this.modules.size === 0) {
      lines.push("  no test file (a pool worker is starting or stopping)");
    }
    console.error(lines.join("\n"));
  }

  onTestRunStart(): void {
    this.progress();
    this.timer = setInterval(() => this.check(), CHECK_MS);
    this.timer.unref?.();
  }

  onTestModuleQueued(module: ReportedModule): void {
    this.modules.set(module.moduleId, Date.now());
    if (this.logStarts) {
      console.log(`[vitest] start ${this.relative(module.moduleId)}`);
    }
  }

  onTestCaseReady(test: ReportedTest): void {
    this.tests.set(test.id, {
      moduleId: test.module.moduleId,
      name: test.fullName,
      since: Date.now(),
    });
  }

  onTestCaseResult(test: ReportedTest): void {
    this.tests.delete(test.id);
    this.progress();
  }

  onTestModuleEnd(module: ReportedModule): void {
    this.modules.delete(module.moduleId);
    this.progress();
  }

  onTestRunEnd(): void {
    clearInterval(this.timer);
    if (this.logStarts) {
      console.log(
        "[vitest] all test files done; closing the pool (bounded by teardownTimeout)"
      );
    }
  }
}

const CI = Boolean(process.env.CI);

/**
 * Spread into `test` of a Workers-pool config; a config may still override
 * a timeout. Vitest's 5 s test default is passed by D1-heavy tests (scrypt,
 * 500-row seeds) when the whole turbo test run shares the cores; a hung test
 * still fails, after 30 s. A hook gets 60 s (migrations, first transforms),
 * and closing the pool 30 s before Vitest exits anyway. In CI the `verbose`
 * reporter prints every test as it ends and `StallReporter` prints each file
 * as it starts.
 */
export const WORKERS_POOL_TEST_OPTIONS = {
  hookTimeout: 60_000,
  reporters: [CI ? "verbose" : "default", new StallReporter({ logStarts: CI })],
  teardownTimeout: 30_000,
  testTimeout: 30_000,
};
