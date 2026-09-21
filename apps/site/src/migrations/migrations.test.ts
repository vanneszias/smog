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

  it("gives webhook-deliveries a UNIQUE index on the payment id", async () => {
    // Not a data-quality nicety. `endpoints/mollie.ts` claims a Mollie
    // delivery by inserting this row, and the unique index is the only
    // atomic operation this database offers — there are no transactions, and
    // an `update` with a `where` was measured resolving its filter with a
    // separate SELECT, so two concurrent deliveries both "won" it. Downgrade
    // this index to an ordinary one and the webhook silently goes back to
    // read-then-write: one payment, two transitions, two log rows, two
    // emails. `pushDevSchema` derives the local schema from the collection
    // config and never opens a migration file, so only this asserts that a
    // *deployed* database gets the constraint.
    const { database } = await chain();
    const byName = new Map(
      indexesOn(database, "webhook_deliveries").map((i) => [i.name, i.unique])
    );

    expect(byName.get("webhook_deliveries_payment_id_idx")).toBe(1);
  });

  it("refuses a second webhook-deliveries row for one payment", async () => {
    // The index asserted as behaviour rather than as metadata: a unique
    // index that SQLite reports but does not apply would satisfy the
    // assertion above, and the whole guard rests on this INSERT failing.
    const { database } = await chain();

    database.exec(
      `INSERT INTO webhook_deliveries (id, payment_id) VALUES (7300, 'tr_migration_probe');`
    );

    expect(() =>
      database.exec(
        `INSERT INTO webhook_deliveries (id, payment_id) VALUES (7301, 'tr_migration_probe');`
      )
    ).toThrow(/UNIQUE/i);
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

  it("gives users the pending-email columns the account page writes", async () => {
    /*
     * `pushDevSchema` derives the local schema from the collection configs
     * and never opens a migration file, so every integration test in this app
     * passes against columns no migration creates. The first place that
     * shows up otherwise is `payload migrate` against a deployed D1 — and
     * here it would show up as an address change that 500s for everybody.
     */
    const { database } = await chain();
    const columns = (
      database.prepare("SELECT name FROM pragma_table_info('users')").all() as {
        name: string;
      }[]
    ).map((column) => column.name);

    expect(columns).toEqual(
      expect.arrayContaining([
        "pending_email",
        "pending_email_expires_at",
        "pending_email_token",
      ])
    );

    // Indexed because every confirmation is an equality lookup on it.
    expect(indexesOn(database, "users").map((index) => index.name)).toContain(
      "users_pending_email_token_idx"
    );
  });

  it("gives every pre-existing list its own pair of share tokens", async () => {
    // Task 7 mints tokens in a `beforeChange` hook, which fixes every future
    // list and no existing one. The backfill is what reaches the rows Stage 1
    // and Stage 2 created, and the failure that matters is not "no token" —
    // it is *one* token shared by every legacy list, which is what a single
    // `UPDATE ... SET x = <one value>` would produce and which no structural
    // assertion would notice. So this replays a chain with two tokenless
    // lists already in it and compares them to each other.
    const database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys = ON;");
    const runner = migrationRunner(database);

    for (const migration of migrations) {
      if (migration.name === "20260920_103500_share_token_defaults") {
        database.exec(
          `INSERT INTO users (id, email) VALUES (7300, 'list-owner@example.test');`
        );
        database.exec(
          `INSERT INTO lists (id, name, owner_id, visibility)
           VALUES (7301, 'Oude lijst', 7300, 'shared'),
                  (7302, 'Nog een oude lijst', 7300, 'shared');`
        );
        // A row that already has a token, to prove the backfill leaves it be
        // rather than rotating live links on deploy.
        database.exec(
          `INSERT INTO lists (id, name, owner_id, visibility, view_share_token)
           VALUES (7303, 'Al gedeeld', 7300, 'shared', 'already-minted-token');`
        );
      }

      await migration.up(runner.args);
    }

    const rows = database
      .prepare(
        "SELECT id, view_share_token, edit_share_token FROM lists ORDER BY id"
      )
      .all() as {
      id: number;
      view_share_token: string | null;
      edit_share_token: string | null;
    }[];

    const byId = new Map(rows.map((row) => [row.id, row]));

    for (const id of [7301, 7302]) {
      expect(byId.get(id)?.view_share_token).toMatch(/^[0-9a-f]{32}$/);
      expect(byId.get(id)?.edit_share_token).toMatch(/^[0-9a-f]{32}$/);
    }

    // Distinct per row, and a view token is never also an edit token.
    const tokens = [7301, 7302].flatMap((id) => [
      byId.get(id)?.view_share_token,
      byId.get(id)?.edit_share_token,
    ]);
    expect(new Set(tokens).size).toBe(4);

    expect(byId.get(7303)?.view_share_token).toBe("already-minted-token");
  });

  it("carries every existing list and list item through the foreign-key rebuild", async () => {
    // `20260920_114500_list_fk_behaviour` rebuilds both `lists` and
    // `lists_items` to change two foreign keys, which SQLite cannot do in
    // place. The failure that matters is not a wrong constraint — it is a
    // rebuild that recreates either table empty, which every structural
    // assertion in this file would still pass while every list in the
    // database quietly disappeared. So this replays the chain with rows
    // already present, exactly as the `user_consents` rebuild above does.
    const database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys = ON;");
    const runner = migrationRunner(database);

    for (const migration of migrations) {
      if (migration.name === "20260920_114500_list_fk_behaviour") {
        database.exec(
          `INSERT INTO users (id, email) VALUES (7400, 'pre-rebuild@example.test');`
        );
        database.exec(
          `INSERT INTO gestures (id, playback_id) VALUES (7410, 'pb-a'), (7411, 'pb-b');`
        );
        database.exec(
          `INSERT INTO lists (id, name, owner_id, visibility)
           VALUES (7401, 'Lijst van voor de herbouw', 7400, 'shared');`
        );
        database.exec(
          `INSERT INTO lists_items (_order, _parent_id, id, gesture_id, added_by_id)
           VALUES (1, 7401, 'row-a', 7410, 7400),
                  (2, 7401, 'row-b', 7411, NULL);`
        );
      }

      await migration.up(runner.args);
    }

    expect(
      database.prepare("SELECT id, name, owner_id FROM lists").all()
    ).toEqual([
      { id: 7401, name: "Lijst van voor de herbouw", owner_id: 7400 },
    ]);
    expect(
      database
        .prepare(
          "SELECT id, gesture_id, added_by_id FROM lists_items ORDER BY _order"
        )
        .all()
    ).toEqual([
      { added_by_id: 7400, gesture_id: 7410, id: "row-a" },
      { added_by_id: null, gesture_id: 7411, id: "row-b" },
    ]);
  });

  it("deletes a user's lists with the user, against the migrated schema", async () => {
    const { database } = await chain();
    // The payoff for `lists.owner`. `cascadeListsOnUserDelete` is what runs
    // on every delete through the Local API and is what
    // `Lists.delete.int.test.ts` exercises, but that suite builds its schema
    // with `pushDevSchema` from the collection configs — which still say
    // `ON DELETE set null` on a `NOT NULL` column, because Payload has no
    // way to express anything else. So the *migrated* schema, the one
    // production actually runs, is only ever proven here, and only by
    // deleting.
    database.exec(
      `INSERT INTO users (id, email) VALUES (7500, 'owner@example.test');`
    );
    database.exec(
      `INSERT INTO gestures (id, playback_id) VALUES (7510, 'pb-cascade');`
    );
    database.exec(
      `INSERT INTO lists (id, name, owner_id, visibility)
       VALUES (7501, 'Wordt meegenomen', 7500, 'private');`
    );
    database.exec(
      `INSERT INTO lists_items (_order, _parent_id, id, gesture_id)
       VALUES (1, 7501, 'cascade-row', 7510);`
    );

    database.exec("DELETE FROM users WHERE id = 7500;");

    expect(
      database.prepare("SELECT id FROM lists WHERE id = 7501").all()
    ).toEqual([]);
    // And the array rows go with the list, via the `_parent_id` cascade that
    // has been there since `add_lists`. A list row deleted without its items
    // would leave orphans no query reaches.
    expect(
      database
        .prepare("SELECT id FROM lists_items WHERE _parent_id = 7501")
        .all()
    ).toEqual([]);
  });

  it("drops a deleted gesture's list rows and leaves the rest of the list", async () => {
    const { database } = await chain();
    // The payoff for `lists.items.gesture`, and the behaviour that is
    // deliberately *not* the same as `sponsorships.gesture` next door: a
    // sponsorship refuses the delete, a list membership evaporates and the
    // list survives. Before this migration the same statement failed with
    // `NOT NULL constraint failed: lists_items.gesture_id`.
    database.exec(
      `INSERT INTO users (id, email) VALUES (7600, 'holder@example.test');`
    );
    database.exec(
      `INSERT INTO gestures (id, playback_id)
       VALUES (7610, 'pb-keep'), (7611, 'pb-drop'), (7612, 'pb-keep-2');`
    );
    database.exec(
      `INSERT INTO lists (id, name, owner_id, visibility)
       VALUES (7601, 'Blijft bestaan', 7600, 'private');`
    );
    database.exec(
      `INSERT INTO lists_items (_order, _parent_id, id, gesture_id)
       VALUES (1, 7601, 'keep-1', 7610),
              (2, 7601, 'drop-me', 7611),
              (3, 7601, 'keep-2', 7612);`
    );

    database.exec("DELETE FROM gestures WHERE id = 7611;");

    expect(
      database.prepare("SELECT id FROM lists WHERE id = 7601").all()
    ).toEqual([{ id: 7601 }]);
    expect(
      database
        .prepare(
          "SELECT id FROM lists_items WHERE _parent_id = 7601 ORDER BY _order"
        )
        .all()
    ).toEqual([{ id: "keep-1" }, { id: "keep-2" }]);
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
