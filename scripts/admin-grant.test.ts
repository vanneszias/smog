import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildGrantSql, buildGrantStatements } from "@smog/config/admin-grant";
import { buildGrantCommand, dryRunLines, parseGrantArgs } from "./admin-grant";

const MIGRATIONS = join(import.meta.dir, "..", "packages", "db", "migrations");
const ID = "0f5e7c1a-2b3d-4e5f-8a9b-0c1d2e3f4a5b";
const OTHER_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

/** An in-memory SQLite with every D1 migration (the trigger included). */
function migrated(): Database {
  const db = new Database(":memory:");
  for (const file of readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }
  return db;
}

interface UserRow {
  ban_reason: string | null;
  banned: number;
  email: string;
  email_verified: number;
  id: string;
  locale: string | null;
  name: string;
  role: string;
  welcomed_at: number | null;
}

function insertUser(
  db: Database,
  { email, id, role }: { email: string; id: string; role: string }
): void {
  db.run(
    "INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned, ban_reason) VALUES (?, 'Old', ?, 0, 1, 1, ?, 1, 'spam')",
    [id, email, role]
  );
}

function users(db: Database): UserRow[] {
  return db
    .query(
      "SELECT id, name, email, email_verified, role, banned, ban_reason, locale, welcomed_at FROM user ORDER BY email"
    )
    .all() as UserRow[];
}

/** Runs the statements as `wrangler d1 execute --command` does: in order. */
function run(db: Database, statements: readonly string[]): unknown[][] {
  return statements.map((statement) => db.query(statement).all());
}

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

describe("buildGrantSql with create (ruling 18)", () => {
  test("inserts a verified, credential-less admin when no account has the email, then grants", () => {
    const statements = buildGrantStatements(" First@Example.TEST ", {
      create: true,
      id: ID,
    });
    const [insert, grant, ...rest] = statements;
    expect(rest).toEqual([]);
    expect(
      buildGrantSql(" First@Example.TEST ", { create: true, id: ID })
    ).toBe(`${insert} ${grant}`);
    expect(insert).toStartWith("INSERT INTO user (");
    expect(insert).toContain("ON CONFLICT (email) DO NOTHING");
    expect(grant).toBe(buildGrantSql("first@example.test"));

    const db = migrated();
    const [created, granted] = run(db, statements);
    expect(created).toEqual([{ created_id: ID }]);
    expect(granted).toEqual([
      { banned: 0, email: "first@example.test", id: ID, role: "admin" },
    ]);
    const [row, ...others] = users(db);
    expect(others).toEqual([]);
    expect(row).toMatchObject({
      ban_reason: null,
      banned: 0,
      email: "first@example.test",
      email_verified: 1,
      id: ID,
      locale: null,
      name: "",
      role: "admin",
    });
    expect(row?.welcomed_at).toBeGreaterThan(0);
    // No credential: it signs in with an email code.
    expect(db.query("SELECT count(*) AS n FROM account").get()).toEqual({
      n: 0,
    });
  });

  test("falls back to the grant for an existing account (no insert, unbanned)", () => {
    const db = migrated();
    insertUser(db, { email: "anna@example.test", id: OTHER_ID, role: "user" });
    const [created, granted] = run(
      db,
      buildGrantStatements("Anna@Example.test", { create: true, id: ID })
    );
    expect(created).toEqual([]);
    expect(granted).toEqual([
      { banned: 0, email: "anna@example.test", id: OTHER_ID, role: "admin" },
    ]);
    expect(users(db)).toMatchObject([
      {
        ban_reason: null,
        email: "anna@example.test",
        email_verified: 0,
        id: OTHER_ID,
        name: "Old",
        welcomed_at: null,
      },
    ]);
  });

  test("never demotes: other admins stay admins, an admin stays one", () => {
    const db = migrated();
    insertUser(db, { email: "boss@example.test", id: OTHER_ID, role: "admin" });
    run(db, buildGrantStatements("new@example.test", { create: true, id: ID }));
    run(db, buildGrantStatements("boss@example.test", { create: true }));
    run(db, buildGrantStatements("boss@example.test"));
    expect(users(db).map(({ email, role }) => ({ email, role }))).toEqual([
      { email: "boss@example.test", role: "admin" },
      { email: "new@example.test", role: "admin" },
    ]);
    // Running it again changes nothing.
    const [created] = run(
      db,
      buildGrantStatements("new@example.test", { create: true })
    );
    expect(created).toEqual([]);
    expect(users(db)).toHaveLength(2);
  });

  test("never sets any role but admin", () => {
    for (const sql of [
      buildGrantSql("a@example.test"),
      buildGrantSql("a@example.test", { create: true, id: ID }),
    ]) {
      expect(sql).not.toContain("'user'");
      expect(sql).toContain("role = 'admin'");
    }
  });

  test("uses a fresh UUID per call and refuses a malformed id", () => {
    const first = buildGrantSql("a@example.test", { create: true });
    const second = buildGrantSql("a@example.test", { create: true });
    expect(first).not.toBe(second);
    expect(() =>
      buildGrantSql("a@example.test", { create: true, id: "x'); DROP" })
    ).toThrow("[adminGrant] Not a UUID");
    expect(() =>
      buildGrantSql("not an email", { create: true, id: ID })
    ).toThrow("[adminGrant] Not an email address");
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

  test("puts both statements in one --command with --create", () => {
    const command = buildGrantCommand("production", "a@example.test", {
      create: true,
      id: ID,
    });
    expect(command.at(-2)).toBe("--command");
    expect(command.at(-1)).toBe(
      buildGrantSql("a@example.test", { create: true, id: ID })
    );
    expect(command).toContain("--remote");
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
      create: false,
      dryRun: false,
      email: "a@smog.test",
      env: "staging",
    });
    expect(
      parseGrantArgs(["a@smog.test", "--dry-run", "--env=production"])
    ).toEqual({
      create: false,
      dryRun: true,
      email: "a@smog.test",
      env: "production",
    });
    expect(
      parseGrantArgs(["--create", "--env", "production", "a@smog.test"])
    ).toEqual({
      create: true,
      dryRun: false,
      email: "a@smog.test",
      env: "production",
    });
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
    expect(() =>
      parseGrantArgs(["--env", "dev", "--craete", "a@smog.test"])
    ).toThrow("Unknown option");
  });
});

describe("dryRunLines", () => {
  test("prints the command and says the ban is lifted too", () => {
    const lines = dryRunLines({
      create: false,
      dryRun: true,
      email: "a@smog.test",
      env: "staging",
    });
    expect(lines[0]).toStartWith('(cd apps/site && bunx "wrangler"');
    expect(lines[1]).toBe(
      "[adminGrant] This also lifts any ban on the account (banned, ban_reason and ban_expires are cleared)."
    );
    expect(lines).toHaveLength(2);
  });

  test("--create prints both statements and what --create does", () => {
    const args = {
      create: true,
      dryRun: true,
      email: "first@example.test",
      env: "production",
    } as const;
    const command = buildGrantCommand(args.env, args.email, {
      create: true,
      id: ID,
    });
    const lines = dryRunLines(args, command);
    expect(lines[0]).toBe(
      `(cd apps/site && bunx ${command.map((arg) => JSON.stringify(arg)).join(" ")})`
    );
    expect(lines[0]).toContain("INSERT INTO user");
    expect(lines[0]).toContain("--remote");
    expect(lines[2]).toStartWith("[adminGrant] --create:");
  });

  test("the script's --dry-run prints and runs nothing", () => {
    const proc = Bun.spawnSync(
      [
        process.execPath,
        join(import.meta.dir, "admin-grant.ts"),
        "--env",
        "production",
        "--create",
        "--dry-run",
        "first@example.test",
      ],
      // No PATH: had it tried to spawn `bunx wrangler`, it would fail.
      { env: { ...process.env, PATH: "/nonexistent" } }
    );
    const out = proc.stdout.toString();
    expect(proc.exitCode).toBe(0);
    expect(out).toContain("INSERT INTO user");
    expect(out).toContain("UPDATE user SET role = 'admin'");
    expect(out).toContain("[adminGrant] --create:");
  });
});
