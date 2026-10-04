import { describe, expect, test } from "bun:test";
import { main, USAGE } from "../src/cli/main";

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
  test("prints the usage for help (exit 0) and with no command (exit 2)", () => {
    for (const [argv, code] of [
      [["help"], 0],
      [["--help"], 0],
      [[], 2],
    ] as const) {
      const { lines, out } = capture();
      expect(main(argv, out)).toBe(code);
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

  test("refuses an unknown command with the usage (exit 2)", () => {
    const { lines, out } = capture();
    expect(main(["import"], out)).toBe(2);
    expect(lines.error[0]).toStartWith(
      "[migrate-convex] Unknown command: import"
    );
  });

  test("says which task builds a command that is not there yet (exit 1)", () => {
    const { lines, out } = capture();
    expect(main(["plan", "--export", "x.zip"], out)).toBe(1);
    expect(lines.error).toEqual([
      "[migrate-convex] `plan` is not built yet (phase 8 task 5).",
    ]);
  });

  test("runs as a script", () => {
    const result = Bun.spawnSync(["bun", "src/cli/main.ts", "help"], {
      cwd: new URL("..", import.meta.url).pathname,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("Usage: bun run migrate:convex");
  });
});
