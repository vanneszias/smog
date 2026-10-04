import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseDeadlineArgs } from "./test-deadline";

const GONE = /^(gone|Z)$/;

function stateOf(pid: number): string {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[0] ?? "gone";
  } catch {
    return "gone";
  }
}

const SCRIPT = fileURLToPath(new URL("./test-deadline.ts", import.meta.url));

describe("parseDeadlineArgs", () => {
  test("reads --minutes and the command after --", () => {
    expect(
      parseDeadlineArgs(["--minutes", "12", "--", "vitest", "run"])
    ).toEqual({ command: ["vitest", "run"], minutes: 12 });
  });

  test("defaults to 25 minutes, or SMOG_TEST_DEADLINE_MINUTES", () => {
    expect(parseDeadlineArgs(["--", "bun", "test"]).minutes).toBe(25);
    expect(
      parseDeadlineArgs(["--", "bun", "test"], {
        SMOG_TEST_DEADLINE_MINUTES: "3",
      }).minutes
    ).toBe(3);
  });

  test("refuses a missing command and a bad limit", () => {
    expect(() => parseDeadlineArgs(["--minutes", "5", "--"])).toThrow("Usage");
    expect(() => parseDeadlineArgs(["--minutes", "0", "--", "x"])).toThrow(
      "Invalid --minutes"
    );
  });
});

describe("test-deadline", () => {
  test("passes the command's exit code through", async () => {
    const proc = Bun.spawn(["bun", SCRIPT, "--", "sh", "-c", "exit 3"], {
      stderr: "pipe",
    });
    expect(await proc.exited).toBe(3);
  });

  test("kills a hung command's whole group, names it and exits 124", async () => {
    const proc = Bun.spawn(
      [
        "bun",
        SCRIPT,
        "--minutes",
        "0.01",
        "--",
        "sh",
        "-c",
        "sleep 120 & echo $! ; wait",
      ],
      { stderr: "pipe", stdout: "pipe" }
    );
    const code = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    const sleeper = Number((await new Response(proc.stdout).text()).trim());
    expect(code).toBe(124);
    expect(stderr).toContain("Test command hung");
    expect(stderr).toContain("sh -c sleep 120");
    expect(stderr).toContain(`${sleeper} `);
    // The grandchild went down with the group (gone, or a zombie whose
    // new parent has not reaped it yet).
    await Bun.sleep(200);
    expect(stateOf(sleeper)).toMatch(GONE);
  });
});
