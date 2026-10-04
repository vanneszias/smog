/**
 * `Bun.*` is allowed only in the render server, the scripts and the tests
 * (phase 7 global constraints): the exported entries run in the browser,
 * in the Remotion bundle, and (`./contract`, `./testing`) in workerd.
 */
import { describe, expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const SCANNED = ["contract", "compositions", "metadata", "remotion", "testing"];
const SOURCE = /\.tsx?$/;
const TEST = /\.test\.tsx?$/;
const BUN_GLOBAL = /\bBun\./;

async function sources(): Promise<string[]> {
  const entries = await readdir(SRC, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((file) => {
      const relative = file.slice(SRC.length + 1);
      const top = relative.split("/")[0]?.replace(SOURCE, "") ?? "";
      return SCANNED.includes(top) && SOURCE.test(file) && !TEST.test(relative);
    });
}

describe("no Bun.* outside the server", () => {
  it("scans the exported entries", async () => {
    const files = await sources();
    expect(files.some((file) => file.endsWith("contract.ts"))).toBe(true);
    expect(files.some((file) => file.includes("/compositions/"))).toBe(true);
    const contents = await Promise.all(
      files.map((file) => readFile(file, "utf8"))
    );
    const offenders = files.filter((_, index) =>
      BUN_GLOBAL.test(contents[index] ?? "")
    );
    expect(offenders).toEqual([]);
  });
});
