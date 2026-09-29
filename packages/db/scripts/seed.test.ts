import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { buildSeedSql, SEED_FILE } from "./seed";

describe("buildSeedSql", () => {
  it("is deterministic", () => {
    expect(buildSeedSql()).toBe(buildSeedSql());
  });

  it("matches the committed seed/dev.sql (run `bun -F @smog/db seed:build`)", () => {
    expect(readFileSync(SEED_FILE, "utf8")).toBe(buildSeedSql());
  });

  it("has one statement per line", () => {
    for (const line of buildSeedSql().trimEnd().split("\n")) {
      expect(line.startsWith("--") || line.endsWith(";")).toBe(true);
    }
  });
});
