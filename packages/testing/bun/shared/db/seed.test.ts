import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  buildSeedSql,
  SEED_ADMIN_EMAIL,
  SEED_FILE,
} from "../../../../db/scripts/seed";

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

  it("leaves out the dev admin and its password for the PR previews", () => {
    const sql = buildSeedSql({ withAdmin: false });
    expect(sql).not.toContain(SEED_ADMIN_EMAIL);
    expect(sql).not.toContain("credential");
    expect(sql).not.toContain("user_role");
    expect(buildSeedSql()).toStartWith(sql);
  });
});
