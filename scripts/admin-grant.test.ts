import { describe, expect, test } from "bun:test";
import {
  buildGrantCommand,
  buildGrantSql,
  dryRunLines,
  parseGrantArgs,
} from "./admin-grant";

describe("buildGrantSql", () => {
  test("grants the role and lifts any ban, by the lower-cased email", () => {
    expect(buildGrantSql("Anna@Smog.test")).toBe(
      "UPDATE user SET role = 'admin', banned = 0, ban_reason = NULL, ban_expires = NULL, updated_at = CAST(unixepoch('subsec') * 1000 AS INTEGER) WHERE email = 'anna@smog.test' RETURNING id, email, role, banned;"
    );
  });

  test("escapes single quotes", () => {
    expect(buildGrantSql("o'brien@smog.test")).toContain(
      "WHERE email = 'o''brien@smog.test'"
    );
    expect(buildGrantSql("x'or'1'='1@x.be")).toContain(
      "WHERE email = 'x''or''1''=''1@x.be' RETURNING"
    );
  });

  test("refuses something that is not an email address", () => {
    for (const email of [
      "",
      "nobody",
      "a@b",
      "a b@c.be",
      "a@c.be\n;",
      "@c.be",
    ]) {
      expect(() => buildGrantSql(email)).toThrow("[adminGrant]");
    }
  });
});

describe("buildGrantCommand", () => {
  test("runs against the local D1 in dev", () => {
    expect(buildGrantCommand("dev", "a@smog.test")).toEqual([
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--env",
      "dev",
      "--local",
      "--command",
      buildGrantSql("a@smog.test"),
    ]);
  });

  test("runs against the remote D1 in staging and production", () => {
    expect(buildGrantCommand("staging", "a@smog.test")).toContain("--remote");
    expect(buildGrantCommand("production", "a@smog.test")).toContain(
      "--remote"
    );
  });
});

describe("parseGrantArgs", () => {
  test("reads --env, --dry-run and the email in any order", () => {
    expect(parseGrantArgs(["--env", "staging", "a@smog.test"])).toEqual({
      dryRun: false,
      email: "a@smog.test",
      env: "staging",
    });
    expect(
      parseGrantArgs(["a@smog.test", "--dry-run", "--env=production"])
    ).toEqual({ dryRun: true, email: "a@smog.test", env: "production" });
  });

  test("refuses a missing or unknown env and a missing email", () => {
    expect(() => parseGrantArgs(["a@smog.test"])).toThrow("--env");
    expect(() => parseGrantArgs(["--env", "prod", "a@smog.test"])).toThrow(
      "--env"
    );
    expect(() => parseGrantArgs(["--env", "dev"])).toThrow("email");
    expect(() =>
      parseGrantArgs(["--env", "dev", "a@smog.test", "b@smog.test"])
    ).toThrow("one email");
  });
});

describe("dryRunLines", () => {
  test("prints the command and says the ban is lifted too", () => {
    const lines = dryRunLines({
      dryRun: true,
      email: "a@smog.test",
      env: "staging",
    });
    expect(lines[0]).toStartWith('(cd apps/site && bunx "wrangler"');
    expect(lines[1]).toBe(
      "[adminGrant] This also lifts any ban on the account (banned, ban_reason and ban_expires are cleared)."
    );
  });
});
