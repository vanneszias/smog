import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type CommandContext, main, USAGE } from "../src/cli/main";
import { createFakeWrangler } from "../src/cli/wrangler";

/** No credentials, no network, no wrangler: a command that reached out would fail loudly. */
function offline(env: CommandContext["env"] = {}): CommandContext {
  const wrangler = createFakeWrangler();
  return {
    env,
    fetch: () => Promise.reject(new Error("no network in this test")),
    runWrangler: wrangler.run,
    timer: { now: () => 0, sleep: () => Promise.resolve() },
  };
}

function capture() {
  const lines: { error: string[]; log: string[] } = { error: [], log: [] };
  return {
    lines,
    out: {
      error: (text: string) => lines.error.push(text),
      log: (text: string) => lines.log.push(text),
    },
  };
}

describe("migrate:convex", () => {
  test("prints the usage for help (exit 0) and with no command (exit 2)", async () => {
    for (const [argv, code] of [
      [["help"], 0],
      [["--help"], 0],
      [[], 2],
    ] as const) {
      const { lines, out } = capture();
      // biome-ignore lint/performance/noAwaitInLoops: one case after another, each with its own output.
      expect(await main(argv, out)).toBe(code);
      expect(lines.log).toEqual([USAGE]);
    }
  });

  test("lists every command of ruling 6", () => {
    for (const command of [
      "plan --export",
      "apply --env",
      "mux scan",
      "mux renditions",
      "we-moved --out",
    ]) {
      expect(USAGE).toContain(command);
    }
  });

  test("refuses an unknown command with the usage (exit 2)", async () => {
    const { lines, out } = capture();
    expect(await main(["import"], out)).toBe(2);
    expect(lines.error[0]).toStartWith(
      "[migrate-convex] Unknown command: import"
    );
  });

  test("says which task builds a command that is not there yet (exit 1)", async () => {
    for (const [command, task] of [["apply", 10]] as const) {
      const { lines, out } = capture();
      // biome-ignore lint/performance/noAwaitInLoops: one case after another, each with its own output.
      expect(await main([command, "--env", "dev"], out)).toBe(1);
      expect(lines.error).toEqual([
        `[migrate-convex] \`${command}\` is not built yet (phase 8 task ${task}).`,
      ]);
    }
  });

  test("mux needs scan or renditions, and absolute paths (exit 2)", async () => {
    for (const argv of [
      ["mux"],
      ["mux", "list"],
      ["mux", "scan", "--export", "export.zip", "--out", "/tmp/out"],
      ["mux", "renditions", "--map", "mux-map.json"],
      ["mux", "renditions", "--map", "/tmp/m.json", "--get-rate", "0"],
      ["mux", "renditions", "--map", "/tmp/m.json", "--get-rate", "5"],
      [
        "mux",
        "scan",
        "--export",
        "/tmp/e",
        "--out",
        "/tmp/o",
        "--get-rate",
        "x",
      ],
    ]) {
      const { lines, out } = capture();
      // biome-ignore lint/performance/noAwaitInLoops: one case after another, each with its own output.
      expect(await main(argv, out, offline())).toBe(2);
      expect(lines.error[0]).toStartWith("[migrate-convex] ");
    }
  });

  test("mux renditions names the missing Mux token (exit 2)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "smog-cli-"));
    try {
      const map = join(dir, "mux-map.json");
      writeFileSync(
        map,
        JSON.stringify({ p: { assetId: "a", roles: ["gesture"] } })
      );
      const { lines, out } = capture();
      expect(
        await main(["mux", "renditions", "--map", map], out, offline())
      ).toBe(2);
      expect(lines.error).toEqual([
        "[migrate-convex] MUX_TOKEN_ID and MUX_TOKEN_SECRET must be set in the environment (an access token of the Mux environment that holds the gesture assets (production's)).",
      ]);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  test("we-moved refuses any env but production before reading anything (exit 2)", async () => {
    const context = offline();
    for (const env of ["staging", "dev"]) {
      const { lines, out } = capture();
      expect(
        // biome-ignore lint/performance/noAwaitInLoops: one case after another, each with its own output.
        await main(
          ["we-moved", "--out", "/tmp/out", "--env", env],
          out,
          context
        )
      ).toBe(2);
      expect(lines.error).toEqual([
        `[migrate-convex] we-moved runs on production only (phase 8 ruling 15), not ${env}.`,
      ]);
    }
    const { out } = capture();
    expect(await main(["we-moved", "--out", "/tmp/out"], out, context)).toBe(2);
  });

  test("says every path must be absolute", () => {
    expect(USAGE).toContain("Every path must be absolute");
  });

  test("runs as a script", () => {
    const result = Bun.spawnSync(["bun", "src/cli/main.ts", "help"], {
      cwd: new URL("..", import.meta.url).pathname,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("Usage: bun run migrate:convex");
  });
});
