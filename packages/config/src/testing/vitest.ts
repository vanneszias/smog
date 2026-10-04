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
 * and which tests, and for how long; when a file ended and for 3 minutes
 * neither a next file nor the end of the run followed, it prints the result
 * and exits (0, 1, or 75 to have the command run again). The wall-clock
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
// After a file ends, a healthy pool starts the next one (a worker start is
// bounded at 90 s, then the setup files) or ends the run well within this.
const FINISH_GRACE_MS = 180_000;
const CHECK_MS = 15_000;
/** `scripts/test-deadline.ts` runs a command that exits with it once more. */
const EXIT_RETRY = 75;

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
  private lastModuleEndAt: number | undefined;
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
   * A file reported its end, then nothing: no file open, no next file
   * started, no end of the run. A pool worker never sent
   * `testfileFinished`, so Vitest waits for it forever (seen with
   * `@cloudflare/vitest-plugin` 1.3.6: that worker's `workerd` idle with its
   * socket open). In parallel runs it shows once every file has ended; with
   * one worker (2 CPUs) the files after it never start. Ends the process:
   * 0 when every file finished and passed, 1 when one failed, 75 when files
   * never ran (the deadline wrapper runs the command once more). Returns
   * whether it is waiting out the grace period or exited.
   */
  private finishStuckRun(now: number): boolean {
    if (
      this.lastModuleEndAt === undefined ||
      this.runEnded ||
      this.modules.size > 0
    ) {
      return false;
    }
    if (now - this.lastModuleEndAt < FINISH_GRACE_MS) {
      return this.ended.length >= this.expected;
    }
    const failed = this.ended.filter(
      (module) => module.state?.() === "failed"
    ).length;
    const passed = this.ended.length - failed;
    const missing = Math.max(this.expected - this.ended.length, 0);
    // 75 (EX_TEMPFAIL): nothing failed but files never ran; the deadline
    // wrapper runs the command once more.
    let code = 0;
    if (failed > 0) {
      code = 1;
    } else if (missing > 0) {
      code = EXIT_RETRY;
    }
    const message = `${this.ended.length} of ${this.expected} test files finished (${passed} passed, ${failed} failed)${missing > 0 ? `, ${missing} never ran` : ""}; Vitest has done nothing for ${seconds(now - this.lastModuleEndAt)}: a pool worker never reported its file done. Exiting with code ${code}.`;
    this.log(`[vitest-stall] ${message}`);
    if (process.env.GITHUB_ACTIONS === "true") {
      const level = code === 1 ? "error" : "warning";
      this.log(`::${level} title=Vitest pool did not finish::${message}`);
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
    this.lastModuleEndAt = this.now();
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
