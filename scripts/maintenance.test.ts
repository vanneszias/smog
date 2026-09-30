import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  buildMaintenanceCommand,
  buildMaintenanceValue,
  parseMaintenanceArgs,
} from "./maintenance";

const NOW = Date.parse("2026-10-01T08:00:00Z");
const NOW_S = NOW / 1000;
const SCRIPT = join(import.meta.dir, "maintenance.ts");

describe("parseMaintenanceArgs", () => {
  test("reads the env, the action and the options", () => {
    expect(
      parseMaintenanceArgs(
        [
          "--env",
          "staging",
          "on",
          "--message",
          "Nieuwe video's",
          "--until",
          "2026-10-01T10:00:00Z",
        ],
        NOW
      )
    ).toEqual({
      action: "on",
      dryRun: false,
      env: "staging",
      message: "Nieuwe video's",
      until: "2026-10-01T10:00:00.000Z",
      yes: false,
    });
    expect(
      parseMaintenanceArgs(["off", "--env=dev", "--dry-run"], NOW)
    ).toEqual({ action: "off", dryRun: true, env: "dev", yes: false });
  });

  test("refuses production without --yes", () => {
    expect(() =>
      parseMaintenanceArgs(["--env", "production", "on"], NOW)
    ).toThrow("--yes");
    expect(
      parseMaintenanceArgs(["--env", "production", "on", "--yes"], NOW).yes
    ).toBe(true);
  });

  test("refuses bad input", () => {
    const cases = [
      ["on"],
      ["--env", "prod", "on"],
      ["--env", "dev"],
      ["--env", "dev", "maybe"],
      ["--env", "dev", "on", "off"],
      ["--env", "dev", "on", "--until", "tomorrow"],
      ["--env", "dev", "on", "--until", "2026-10-01T07:00:00Z"],
      ["--env", "dev", "on", "--message", ""],
      ["--env", "dev", "on", "--message"],
      ["--env", "dev", "off", "--message", "x"],
      ["--env", "dev", "on", "--nope"],
    ];
    for (const argv of cases) {
      expect(() => parseMaintenanceArgs(argv, NOW)).toThrow("[maintenance]");
    }
  });
});

describe("buildMaintenanceValue", () => {
  test("starts a new bypass version on every write", () => {
    expect(
      JSON.parse(
        buildMaintenanceValue(
          { action: "on", message: "m", until: "2026-10-01T10:00:00.000Z" },
          NOW
        )
      )
    ).toEqual({
      bypassVersion: NOW_S,
      enabled: true,
      message: "m",
      until: "2026-10-01T10:00:00.000Z",
    });
    expect(JSON.parse(buildMaintenanceValue({ action: "off" }, NOW))).toEqual({
      bypassVersion: NOW_S,
      enabled: false,
    });
  });
});

describe("buildMaintenanceCommand", () => {
  test("writes the local KV in dev and the remote one elsewhere", () => {
    const value = buildMaintenanceValue({ action: "off" }, NOW);
    expect(buildMaintenanceCommand("dev", value)).toEqual([
      "wrangler",
      "kv",
      "key",
      "put",
      "maintenance",
      value,
      "--binding",
      "KV",
      "--env",
      "dev",
      "--local",
    ]);
    expect(buildMaintenanceCommand("production", value).slice(-3)).toEqual([
      "--env",
      "production",
      "--remote",
    ]);
  });
});

describe("the CLI", () => {
  test("prints the wrangler command with --dry-run", () => {
    const proc = Bun.spawnSync(
      ["bun", SCRIPT, "--env", "staging", "on", "--message", "x", "--dry-run"],
      { stderr: "pipe", stdout: "pipe" }
    );
    const out = proc.stdout.toString();
    expect(proc.exitCode).toBe(0);
    expect(out).toContain('(cd apps/site && bunx "wrangler" "kv" "key" "put"');
    expect(out).toContain('"--binding" "KV" "--env" "staging" "--remote")');
    expect(out).toContain('\\"enabled\\":true');
  });

  test("refuses production without --yes, before running anything", () => {
    const proc = Bun.spawnSync(
      ["bun", SCRIPT, "--env", "production", "on", "--dry-run"],
      { stderr: "pipe", stdout: "pipe" }
    );
    expect(proc.exitCode).toBe(1);
    expect(proc.stderr.toString()).toContain("--yes");
    expect(proc.stdout.toString()).toBe("");
  });
});
