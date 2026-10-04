import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * `bun <root>/scripts/test-deadline.ts [--minutes N] -- <command> [args…]`
 *
 * Runs one test command with a hard wall-clock limit (default 25 minutes,
 * or `SMOG_TEST_DEADLINE_MINUTES`). The command runs in its own process
 * group. When the limit passes, it prints which command hung (package
 * directory, command line, elapsed time), the process tree, and, for every
 * Node process in the tree, the JavaScript stack and the open libuv handles
 * (a Node diagnostic report, `--report-on-signal`). Then it kills the whole
 * group (SIGTERM, SIGKILL after 10 s) and exits 124. In GitHub Actions it
 * also prints an `::error` annotation.
 *
 * Every test command of the turbo `test` task goes through it, so a stuck
 * Vitest pool, workerd, esbuild service or `bun test` fails in minutes and
 * names itself instead of running into the 45-minute job timeout with its
 * output still buffered (docs/DECISIONS.md, "CI test hang").
 */

const DEFAULT_MINUTES = 25;
const KILL_GRACE_MS = 10_000;
const REPORT_WAIT_MS = 5000;
const EXIT_TIMED_OUT = 124;
const MAX_STACK_LINES = 40;
const MAX_HANDLES = 40;
const CLOCK_TICKS = 100;

export interface DeadlineArgs {
  command: string[];
  minutes: number;
}

export function parseDeadlineArgs(
  argv: readonly string[],
  env: Record<string, string | undefined> = {}
): DeadlineArgs {
  const separator = argv.indexOf("--");
  const options = separator === -1 ? [] : argv.slice(0, separator);
  const command = separator === -1 ? [...argv] : argv.slice(separator + 1);
  if (command.length === 0) {
    throw new Error(
      "Usage: bun scripts/test-deadline.ts [--minutes N] -- <command> [args…]"
    );
  }
  const at = options.indexOf("--minutes");
  const raw =
    at === -1
      ? (env.SMOG_TEST_DEADLINE_MINUTES ?? String(DEFAULT_MINUTES))
      : options[at + 1];
  const minutes = Number(raw);
  if (!(Number.isFinite(minutes) && minutes > 0)) {
    throw new Error(`[test-deadline] Invalid --minutes: ${String(raw)}`);
  }
  return { command, minutes };
}

interface ProcessRow {
  args: string;
  comm: string;
  /** CPU time used so far, in seconds (user + system, 100 ticks/s). */
  cpu: number;
  pid: number;
  ppid: number;
  /** R running, S sleeping, D disk wait, Z zombie, … */
  state: string;
}

/** Every process in the group `pgid` (the command's own group). */
function processGroup(pgid: number): ProcessRow[] {
  const rows: ProcessRow[] = [];
  for (const entry of readdirSync("/proc")) {
    const pid = Number(entry);
    if (!Number.isInteger(pid)) {
      continue;
    }
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      // `pid (comm) state ppid pgrp …`; comm may contain spaces.
      const close = stat.lastIndexOf(")");
      const comm = stat.slice(stat.indexOf("(") + 1, close);
      const fields = stat.slice(close + 2).split(" ");
      if (Number(fields[2]) !== pgid) {
        continue;
      }
      const args = readFileSync(`/proc/${pid}/cmdline`, "utf8")
        .split("\0")
        .join(" ")
        .trim();
      rows.push({
        args,
        comm,
        cpu: (Number(fields[11]) + Number(fields[12])) / CLOCK_TICKS,
        pid,
        ppid: Number(fields[1]),
        state: fields[0] ?? "?",
      });
    } catch {
      // The process exited while we read it.
    }
  }
  return rows;
}

function printTree(rows: ProcessRow[]): void {
  // A busy loop shows as state R with CPU time that grows between dumps;
  // a deadlock as S with CPU time that stands still.
  console.error(
    "[test-deadline] Processes still running (pid ppid state cpu-seconds command):"
  );
  for (const row of rows) {
    console.error(
      `  ${row.pid} ${row.ppid} ${row.state} ${row.cpu.toFixed(1)}s ${row.args.slice(0, 240)}`
    );
  }
}

interface NodeReport {
  header?: { commandLine?: string[]; processId?: number };
  javascriptStack?: { message?: string; stack?: string[] };
  libuv?: {
    type?: string;
    is_active?: boolean;
    is_referenced?: boolean;
    localEndpoint?: unknown;
    remoteEndpoint?: unknown;
  }[];
}

function printReport(path: string): void {
  try {
    const report = JSON.parse(readFileSync(path, "utf8")) as NodeReport;
    const command = (report.header?.commandLine ?? []).join(" ");
    console.error(
      `[test-deadline] Node report for pid ${report.header?.processId}: ${command.slice(0, 240)}`
    );
    const stack = report.javascriptStack?.stack ?? [];
    console.error(
      `  JavaScript stack (${report.javascriptStack?.message ?? "?"}):`
    );
    for (const line of stack.slice(0, MAX_STACK_LINES)) {
      console.error(`    ${line}`);
    }
    const handles = (report.libuv ?? []).filter(
      (handle) => handle.is_active && handle.is_referenced
    );
    console.error(`  Active, referenced libuv handles (${handles.length}):`);
    for (const handle of handles.slice(0, MAX_HANDLES)) {
      const remote = handle.remoteEndpoint
        ? ` remote=${JSON.stringify(handle.remoteEndpoint)}`
        : "";
      const local = handle.localEndpoint
        ? ` local=${JSON.stringify(handle.localEndpoint)}`
        : "";
      console.error(`    ${handle.type}${local}${remote}`);
    }
  } catch (error) {
    console.error(`[test-deadline] Failed to read the report ${path}:`, error);
  }
}

function signalGroup(pgid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pgid, signal);
  } catch {
    // The group is already gone.
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function diagnose(pgid: number, reportDir: string): Promise<void> {
  const rows = processGroup(pgid);
  printTree(rows);
  // Only Node has `--report-on-signal` (from NODE_OPTIONS); SIGUSR2 would
  // kill anything else.
  const nodes = rows.filter((row) => row.comm === "node");
  for (const row of nodes) {
    try {
      process.kill(row.pid, "SIGUSR2");
    } catch {
      // Exited meanwhile.
    }
  }
  if (nodes.length === 0) {
    return;
  }
  await wait(REPORT_WAIT_MS);
  for (const file of readdirSync(reportDir)) {
    printReport(join(reportDir, file));
  }
}

async function main(): Promise<void> {
  const { command, minutes } = parseDeadlineArgs(
    process.argv.slice(2),
    process.env
  );
  const [file, ...args] = command as [string, ...string[]];
  const label = `${command.join(" ")} (in ${process.cwd()})`;
  const reportDir = mkdtempSync(join(tmpdir(), "smog-test-deadline-"));
  const nodeOptions = [
    process.env.NODE_OPTIONS,
    "--report-on-signal",
    "--report-signal=SIGUSR2",
    "--report-compact",
    `--report-directory=${reportDir}`,
  ]
    .filter(Boolean)
    .join(" ");

  const started = Date.now();
  const child = spawn(file, args, {
    detached: true,
    env: { ...process.env, NODE_OPTIONS: nodeOptions },
    stdio: "inherit",
  });
  const pgid = child.pid;
  if (pgid === undefined) {
    throw new Error(`[test-deadline] Failed to start ${label}`);
  }

  // The child has its own group, so the terminal's Ctrl+C and the runner's
  // SIGTERM reach it only through us.
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => signalGroup(pgid, signal));
  }

  let timedOut = false;
  const timer = setTimeout(async () => {
    timedOut = true;
    const elapsed = Math.round((Date.now() - started) / 1000);
    const message = `Test command hung: still running after ${elapsed}s (limit ${minutes} min): ${label}`;
    console.error(`\n[test-deadline] ${message}`);
    if (process.env.GITHUB_ACTIONS === "true") {
      console.error(`::error title=Test command hung::${message}`);
    }
    try {
      await diagnose(pgid, reportDir);
    } catch (error) {
      console.error("[test-deadline] Failed to diagnose the hang:", error);
    }
    console.error(`[test-deadline] Killing process group ${pgid}.`);
    signalGroup(pgid, "SIGTERM");
    setTimeout(() => signalGroup(pgid, "SIGKILL"), KILL_GRACE_MS).unref();
  }, minutes * 60_000);

  const code = await new Promise<number>((resolve) => {
    child.on("error", (error) => {
      console.error(`[test-deadline] Failed to run ${label}:`, error);
      resolve(1);
    });
    child.on("exit", (exitCode, signal) => {
      resolve(exitCode ?? (signal ? 128 : 1));
    });
  });
  clearTimeout(timer);
  // Leave nothing behind (a workerd or esbuild the command orphaned).
  signalGroup(pgid, timedOut ? "SIGKILL" : "SIGTERM");
  rmSync(reportDir, { force: true, recursive: true });
  process.exit(timedOut ? EXIT_TIMED_OUT : code);
}

if (import.meta.main) {
  await main();
}
