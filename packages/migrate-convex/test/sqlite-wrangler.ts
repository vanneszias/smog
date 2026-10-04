/**
 * The shared wrangler fake (`createFakeWrangler`) over a real SQLite
 * database with every D1 migration, for `apply`'s Bun tests: `d1 execute
 * --command` runs the query and returns its rows, `--file` runs the
 * file's statements one per line, as `wrangler d1 execute --file` does,
 * and a failing statement makes the command fail. Foreign keys are on, as
 * on D1.
 */
import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { createFakeWrangler, type FakeWrangler } from "../src/cli/wrangler";

const MIGRATIONS_DIR = new URL("../../db/migrations", import.meta.url).pathname;

/** A database with the migrations up to `last` (all by default), recorded in `d1_migrations` as wrangler does. */
export function migratedDatabase(last = Number.POSITIVE_INFINITY): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(
    "CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)"
  );
  for (const name of readdirSync(MIGRATIONS_DIR)
    .filter((entry) => entry.endsWith(".sql"))
    .sort()) {
    if (Number(name.slice(0, 4)) > last) {
      break;
    }
    db.exec(readFileSync(`${MIGRATIONS_DIR}/${name}`, "utf8"));
    db.query("INSERT INTO d1_migrations (name) VALUES (?)").run(name);
  }
  return db;
}

export interface SqliteWrangler extends FakeWrangler {
  readonly db: Database;
  /** Every `--file` the fake ran, in order. */
  readonly files: string[];
}

export function sqliteWrangler(
  db: Database,
  options: { kv?: Readonly<Record<string, string>> } = {}
): SqliteWrangler {
  const files: string[] = [];
  const fake = createFakeWrangler({
    d1: ({ command, file }) => {
      if (command !== undefined) {
        return [db.query(command).all() as Record<string, unknown>[]];
      }
      if (file !== undefined) {
        files.push(file);
        const statements = readFileSync(file, "utf8")
          .split("\n")
          .filter((line) => line.length > 0);
        db.transaction(() => {
          for (const statement of statements) {
            db.run(statement);
          }
        })();
        return statements.map(() => []);
      }
      return [[]];
    },
    kv: options.kv,
  });
  return { ...fake, db, files };
}
