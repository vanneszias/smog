/**
 * Shared Vitest settings for the Workers-pool configs
 * (`@cloudflare/vitest-plugin`): timeouts and reporters that make a stuck
 * run loud (docs/DECISIONS.md, "CI test hang"). Config files only; never
 * imported by runtime code.
 *
 * Vitest bounds a test (`testTimeout`) and a hook (`hookTimeout`) inside
 * workerd, and the shutdown (`teardownTimeout`). It does not bound loading
 * a test file (its imports go to the main process over an RPC without a
 * timeout), a workerd that stops answering, nor a pool worker that never
 * reports its file done. `StallReporter` covers those: when no test has
 * finished for 2.5 minutes it prints which files are loading or running,
 * and which tests, and for how long; when every file has ended but the run
 * has not a minute later, it prints the result and exits. The wall-clock
 * limit around the command (`scripts/test-deadline.ts`) is the last resort.
 */

/** Structural slices of Vitest's reported tasks (`vitest/node`). */
interface ReportedModule {
  moduleId: string;
  /** `passed`, `failed`, `skipped`, … once the module ended. */
  state?: () => string;
}
interface ReportedTest {
  fullName: string;
  id: string;
  module: ReportedModule;
}

// Above the site warm-up (the first transform of the server entry takes up
// to 2 minutes on a loaded machine), so a report means something.
const STALL_MS = 150_000;
// Every file has reported its end; a healthy pool ends the run in seconds.
const FINISH_GRACE_MS = 60_000;
const CHECK_MS = 15_000;

function seconds(ms: number): string {
  return `${Math.round(ms / 1000)}s`;
}

export interface StallReporterOptions {
  /** Ends the process (a stub in the tests). */
  exit?: (code: number) => void;
  log?: (line: string) => void;
  logStarts?: boolean;
  now?: () => number;
}

export class StallReporter {
  private readonly modules = new Map<string, number>();
  private readonly tests = new Map<
    string,
    { moduleId: string; name: string; since: number }
  >();
  private expected = 0;
  private readonly ended: ReportedModule[] = [];
  private allEndedAt: number | undefined;
  private runEnded = false;
  private lastProgress: number;
  private lastWarning = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly logStarts: boolean;
  private readonly root = process.cwd();
  private readonly now: () => number;
  private readonly log: (line: string) => void;
  private readonly exit: (code: number) => void;

  constructor(options: StallReporterOptions = {}) {
    this.logStarts = options.logStarts ?? false;
    this.now = options.now ?? Date.now;
    this.log = options.log ?? ((line) => console.error(line));
    this.exit = options.exit ?? ((code) => process.exit(code));
    this.lastProgress = this.now();
  }

  private relative(moduleId: string): string {
    return moduleId.startsWith(`${this.root}/`)
      ? moduleId.slice(this.root.length + 1)
      : moduleId;
  }

  private progress(): void {
    this.lastProgress = this.now();
    this.lastWarning = 0;
  }

  /**
   * Every test file reported its end, but the run did not: a pool worker
   * never sent `testfileFinished`. Seen with `@cloudflare/vitest-plugin`
   * 1.3.6 (the first worker's `workerd` idle with its socket open, Vitest
   * waiting forever before its summary). The results are all in, so print
   * them and end the process. Returns whether the run is in that state.
   */
  private finishStuckRun(now: number): boolean {
    if (this.allEndedAt === undefined || this.runEnded) {
      return false;
    }
    if (now - this.allEndedAt < FINISH_GRACE_MS) {
      return true;
    }
    const failed = this.ended.filter(
      (module) => module.state?.() === "failed"
    ).length;
    const passed = this.ended.length - failed;
    const code = failed > 0 ? 1 : 0;
    const message = `All ${this.ended.length} test files finished (${passed} passed, ${failed} failed), but Vitest did not end the run within ${seconds(now - this.allEndedAt)}: a pool worker never reported its file done. Exiting with code ${code}.`;
    this.log(`[vitest-stall] ${message}`);
    if (process.env.GITHUB_ACTIONS === "true") {
      this.log(`::warning title=Vitest pool did not finish::${message}`);
    }
    this.runEnded = true;
    clearInterval(this.timer);
    this.exit(code);
    return true;
  }

  /** Runs every 15 s during the run (public for the tests). */
  check(): void {
    const now = this.now();
    if (this.finishStuckRun(now)) {
      return;
    }
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
    this.log(lines.join("\n"));
  }

  onTestRunStart(specifications: readonly unknown[] = []): void {
    this.expected = specifications.length;
    this.progress();
    this.timer = setInterval(() => this.check(), CHECK_MS);
    this.timer.unref?.();
  }

  onTestModuleQueued(module: ReportedModule): void {
    this.modules.set(module.moduleId, this.now());
    if (this.logStarts) {
      console.log(`[vitest] start ${this.relative(module.moduleId)}`);
    }
  }

  onTestCaseReady(test: ReportedTest): void {
    this.tests.set(test.id, {
      moduleId: test.module.moduleId,
      name: test.fullName,
      since: this.now(),
    });
  }

  onTestCaseResult(test: ReportedTest): void {
    this.tests.delete(test.id);
    this.progress();
  }

  onTestModuleEnd(module: ReportedModule): void {
    this.modules.delete(module.moduleId);
    this.ended.push(module);
    if (this.expected > 0 && this.ended.length >= this.expected) {
      this.allEndedAt = this.now();
    }
    this.progress();
  }

  onTestRunEnd(): void {
    this.runEnded = true;
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
