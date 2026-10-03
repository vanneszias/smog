import { describe, expect, test } from "bun:test";
import {
  buildCountCommand,
  buildCountSql,
  parseRetentionArgs,
  type Runner,
  runRetentionDryRun,
} from "./retention";

const WRITES = /\b(DELETE|UPDATE|INSERT|DROP|REPLACE|ALTER)\b/i;

const ROW = {
  audit_log: 2,
  expired_session_max: 1_790_000_000_000,
  expired_session_min: 1_780_000_000_000,
  logos_released: 1,
  now_ms: 1_791_000_000_000,
  session: 5,
  sponsorship_token: 3,
  verification: 4,
};

/** A runner that records the call and answers like `wrangler --json`. */
function fakeRunner(row: Record<string, unknown> = ROW, exitCode = 0) {
  const calls: { argv: readonly string[]; cwd: string }[] = [];
  const runner: Runner = (argv, cwd) => {
    calls.push({ argv, cwd });
    return {
      exitCode,
      stdout: JSON.stringify([{ results: [row], success: true }]),
    };
  };
  return { calls, runner };
}

describe("parseRetentionArgs", () => {
  test("takes the env and requires --dry-run", () => {
    expect(parseRetentionArgs(["--env", "staging", "--dry-run"])).toEqual({
      env: "staging",
    });
    expect(parseRetentionArgs(["--dry-run", "--env=dev"])).toEqual({
      env: "dev",
    });
    expect(() => parseRetentionArgs(["--env", "staging"])).toThrow(
      "Only --dry-run"
    );
    expect(() => parseRetentionArgs(["--env", "prod", "--dry-run"])).toThrow(
      "Pass --env"
    );
    expect(() => parseRetentionArgs(["--dry-run", "--yes"])).toThrow(
      "Unknown argument"
    );
  });
});

describe("the count statement", () => {
  test("is one read-only SELECT", () => {
    const sql = buildCountSql();
    expect(sql.startsWith("SELECT ")).toBe(true);
    expect(sql).not.toMatch(WRITES);
    expect(sql.match(/;/g)).toHaveLength(1);
  });

  test("uses the purge's windows in milliseconds", () => {
    const sql = buildCountSql();
    expect(sql).toContain(
      "created_at < CAST(unixepoch('subsec') * 1000 AS INTEGER) - 94608000000"
    );
    expect(sql).toContain("- 2505600000");
    expect(sql).toContain("- 2592000000");
    expect(sql).toContain("pi.includes_logo = 1");
  });

  test("reads the remote D1 outside dev, the local one in dev, as JSON", () => {
    expect(buildCountCommand("staging").slice(0, 8)).toEqual([
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--env",
      "staging",
      "--remote",
      "--json",
    ]);
    expect(buildCountCommand("dev")).toContain("--local");
  });
});

describe("runRetentionDryRun", () => {
  test("runs wrangler once from apps/site and prints the counts", () => {
    const { calls, runner } = fakeRunner();

    const lines = runRetentionDryRun({ env: "staging" }, runner);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.argv[0]).toBe("bunx");
    expect(calls[0]?.cwd.endsWith("apps/site")).toBe(true);
    expect(lines).toContain("  expired sessions: 5");
    expect(lines).toContain("  audit_log older than 3 × 365 days: 2");
    expect(lines).toContain("  sponsorships whose logo would be released: 1");
    expect(lines.join("\n")).not.toContain("WARNING");
  });

  test("warns when the session times are not milliseconds", () => {
    const { runner } = fakeRunner({
      ...ROW,
      expired_session_max: 1_790_000_000,
    });

    const lines = runRetentionDryRun({ env: "production" }, runner);

    expect(lines.at(-1)).toContain("WARNING");
  });

  test("fails when wrangler fails", () => {
    const { runner } = fakeRunner(ROW, 1);

    expect(() => runRetentionDryRun({ env: "staging" }, runner)).toThrow(
      "wrangler exited with 1"
    );
  });
});
