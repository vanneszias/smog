/**
 * The suite is `jsdom` by default, which cannot load node builtins. Nothing
 * here touches a DOM — it asks a question about SQL — so this one file opts
 * into the node environment.
 *
 * @vitest-environment node
 */

import { DatabaseSync } from "node:sqlite";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-d1-sqlite";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { migrations } from "./index";

/**
 * @fileoverview Replays the migration chain against a real SQLite database.
 *
 * Nothing else in this suite executes a migration. The integration tests all
 * build their schema with Payload's `pushDevSchema`, which derives DDL from
 * the collection configs and never opens these files — so a migration can be
 * syntactically broken, reference an index that does not exist, or be missing
 * from `migrations/index.ts` entirely, and every one of the 200+ tests still
 * passes. The first time anyone finds out is `payload migrate` against a
 * deployed D1, which is the worst possible place to find out: a half-applied
 * chain on a database you cannot easily roll back.
 *
 * This is not hypothetical. A migration in this project once shipped with a
 * mangled `ALTER TABLE \;` produced by a bad extraction, and the only thing
 * that caught it was D1 rejecting it — after the deploy had started.
 *
 * `node:sqlite` rather than the miniflare D1 the other tests use: this asks
 * "is the SQL valid and does the chain compose", which is a question about
 * SQLite, not about Workers. It is also two orders of magnitude faster, so
 * this stays a unit test.
 */

const dialect = new SQLiteSyncDialect();

/**
 * The migrations call `db.run(sql`...`)`, where `sql` is Drizzle's template
 * tag and the argument is a query object, not a string. Rendering it through
 * Drizzle's own dialect — rather than scraping the source with a regex — is
 * the point: it exercises the same path the real adapter takes, so escaping
 * is whatever Drizzle actually produces and not whatever a pattern guessed.
 */
function migrationRunner(database: DatabaseSync) {
  const executed: string[] = [];

  const db = {
    run(query: unknown) {
      const { sql } = dialect.sqlToQuery(query as never);
      executed.push(sql);
      database.exec(sql);
      return Promise.resolve();
    },
  };

  // `up`/`down` are typed against Payload's full `DrizzleAdapter` and request
  // objects. The migrations in this project only ever reach for `db.run`, and
  // a migration that grew a dependency on `payload` or `req` would fail here
  // loudly rather than silently — which is the behaviour we want.
  const args = {
    db,
    payload: undefined,
    req: undefined,
  } as unknown as MigrateUpArgs & MigrateDownArgs;

  return { args, executed };
}

function indexesOn(database: DatabaseSync, table: string) {
  return database
    .prepare(`SELECT name, "unique" FROM pragma_index_list(?) ORDER BY name`)
    .all(table) as { name: string; unique: number }[];
}

/**
 * Deliberately NOT a `beforeAll`. A migration that throws during setup fails
 * the file without failing any test by name, and Vitest reports the rest as
 * skipped — which reads as "nothing to see here" in a CI summary, and is the
 * single most repeated way a green-looking run in this project has turned out
 * to be testing nothing. Replaying inside a memoised helper means a broken
 * migration fails a named assertion with the offending SQL attached.
 */
interface Chain {
  database: DatabaseSync;
  executed: string[];
  failure?: { sql: string; error: unknown };
}

let cached: Chain | undefined;

async function chain(): Promise<Chain> {
  if (cached) {
    return cached;
  }

  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON;");

  const runner = migrationRunner(database);
  let failure: Chain["failure"];

  for (const migration of migrations) {
    try {
      await migration.up(runner.args);
    } catch (error) {
      failure = {
        sql: `${migration.name}: ${runner.executed.at(-1) ?? "<no statement ran>"}`,
        error,
      };
      break;
    }
  }

  cached = { database, executed: runner.executed, failure };
  return cached;
}

describe("migration chain", () => {
  it("applies every registered migration in order against real SQLite", async () => {
    const { failure, executed } = await chain();

    expect(failure && `${failure.sql}\n  -> ${failure.error}`).toBeUndefined();

    // Guards the opposite failure: a runner that silently executed nothing
    // would otherwise let every assertion here pass while proving no SQL is
    // valid at all.
    expect(executed.length).toBeGreaterThan(100);
    expect(migrations.length).toBeGreaterThanOrEqual(10);
  });

  it("registers every migration file in migrations/index.ts", async () => {
    // A migration that exists on disk but was never added to the barrel is
    // invisible to `payload migrate` — it simply never runs, and the schema
    // silently drifts from the collection configs.
    const { readdir } = await import("node:fs/promises");
    const files = (await readdir(new URL(".", import.meta.url)))
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => f !== "index.ts" && !f.endsWith(".test.ts"))
      .map((f) => f.replace(/\.ts$/, ""))
      .sort();

    expect(migrations.map((m) => m.name).sort()).toEqual(files);
  });

  it("ends with the sponsorship bearer-token columns uniquely indexed", async () => {
    const { database } = await chain();
    // The payoff. `reEditToken` is a bearer credential and `molliePaymentId`
    // is what the payment webhook looks up by, so a duplicate in either means
    // one sponsor reaching another's record, or money applied to the wrong
    // row. The collection config asserts the *intent*; this asserts that the
    // migration chain actually produces it in the database.
    const indexes = indexesOn(database, "sponsorships");

    const byName = new Map(indexes.map((i) => [i.name, i.unique]));
    expect(byName.get("sponsorships_mollie_payment_id_idx")).toBe(1);
    expect(byName.get("sponsorships_re_edit_token_idx")).toBe(1);
  });

  it("carries every existing user_consents row through the table rebuild", async () => {
    // Making `user_consents.user_id` nullable forces SQLite's twelve-step
    // rebuild: new table, `INSERT ... SELECT`, drop, rename. The failure mode
    // that matters is a rebuild that recreates the table *empty*, which no
    // structural assertion notices — the schema is right and the evidence is
    // gone. So this replays a chain with a row already present.
    const database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys = ON;");
    const runner = migrationRunner(database);

    for (const migration of migrations) {
      await migration.up(runner.args);

      if (migration.name === "20260919_212934_add_sponsorships_and_audit") {
        database.exec(
          `INSERT INTO users (id, email) VALUES (7100, 'pre-existing@example.test');`
        );
        database.exec(
          `INSERT INTO user_consents (id, user_id, analytics_consent, consent_version)
           VALUES (7101, 7100, 1, 'v1-before-the-rebuild');`
        );
      }
    }

    const rows = database
      .prepare(
        "SELECT user_id, consent_version FROM user_consents WHERE id = 7101"
      )
      .all() as { user_id: number | null; consent_version: string }[];

    expect(rows).toEqual([
      { user_id: 7100, consent_version: "v1-before-the-rebuild" },
    ]);
  });

  it("lets a user be deleted and leaves the consent row behind with a null user", async () => {
    const { database } = await chain();
    // The payoff for the referential-integrity ruling, asserted against the
    // *migrated* schema rather than the one `pushDevSchema` derives from the
    // collection configs. Payload writes `ON DELETE set null` for every
    // relationship whether or not the column can hold NULL, so only an actual
    // delete distinguishes a rule SQLite honours from one it rejects.
    database.exec(
      `INSERT INTO users (id, email) VALUES (7200, 'consenting@example.test');`
    );
    database.exec(
      `INSERT INTO user_consents (id, user_id, analytics_consent, consent_version)
       VALUES (7201, 7200, 1, 'v1');`
    );

    database.exec("DELETE FROM users WHERE id = 7200;");

    const rows = database
      .prepare(
        "SELECT user_id, consent_version FROM user_consents WHERE id = 7201"
      )
      .all() as { user_id: number | null; consent_version: string }[];

    expect(rows).toEqual([{ user_id: null, consent_version: "v1" }]);
  });

  it("puts the search index's localized columns on search_locales, not search", async () => {
    const { database } = await chain();
    // The search plugin's `title` and `concepts` are localized, so they live
    // in `search_locales` keyed by `_locale`. If a migration ever flattens
    // them onto `search`, a save in one locale silently overwrites every
    // other locale's index entry — the exact failure `search.int.test.ts`
    // covers at the API level, asserted here against the migrated schema.
    const columns = (table: string) =>
      (
        database
          .prepare("SELECT name FROM pragma_table_info(?)")
          .all(table) as { name: string }[]
      ).map((row) => row.name);

    expect(columns("search_locales")).toEqual(
      expect.arrayContaining(["title", "concepts", "_locale", "_parent_id"])
    );
    expect(columns("search")).toEqual(
      expect.arrayContaining(["id", "priority", "is_active"])
    );
    expect(columns("search")).not.toContain("title");
  });

  it("actually rejects a duplicate token at the database level", async () => {
    const { database } = await chain();
    // Belt and braces on the above: `pragma_index_list` reporting `unique: 1`
    // and SQLite enforcing it are different claims, and only the second one
    // protects anybody.
    // Foreign keys are on, so the row needs a real parent gesture. Spelling
    // out every NOT NULL column is tedious but deliberate: it is the clearest
    // statement of what the migration chain actually demands of a sponsorship
    // row, and it fails loudly if a later migration adds another one.
    database.exec(
      `INSERT INTO gestures (id, playback_id) VALUES (9000, 'pb-migration-test');`
    );

    const insert = (id: number, token: string | null) =>
      database.exec(
        `INSERT INTO sponsorships (
           id, gesture_id, sponsor_name, sponsor_email, contact_full_name,
           overlay_text, original_video_playback_id, start_date, end_date,
           payment_amount, re_edit_token
         ) VALUES (
           ${id}, 9000, 'Sponsor', 's@example.test', 'Contact',
           'Overlay', 'pb-original', '2026-01-01', '2027-01-01',
           500, ${token === null ? "NULL" : `'${token}'`}
         );`
      );

    insert(9001, "tok-dup");
    expect(() => insert(9002, "tok-dup")).toThrow(/UNIQUE/i);

    // NULLs must still be free to repeat, or every sponsorship created before
    // the Mollie flow runs would collide with the previous one.
    insert(9003, null);
    insert(9004, null);
  });
});
