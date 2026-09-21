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

/** The migration that folded `webhook_deliveries` and `render_completions` into one table. */
const MERGE_MIGRATION = "20260921_180000_add_claims";

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

  it("ends with the re-edit token uniquely indexed and the payment id not", async () => {
    const { database } = await chain();
    // `reEditToken` is a bearer credential, so a duplicate means one sponsor
    // reaching another's record — that index stays unique, and the collection
    // config asserting the *intent* is not the same claim as the migration
    // chain producing it.
    //
    // `molliePaymentId` is the opposite, and Stage 1 had it backwards. The
    // webhook resolves a payment through `metadata.sponsorshipIds`, not
    // through this column; one checkout covering three gestures writes three
    // rows carrying one payment id, which a unique index refuses. Stage 5
    // Task 7 drops it — see
    // `20260921_120000_sponsorship_payment_id_not_unique`.
    const indexes = indexesOn(database, "sponsorships");

    const byName = new Map(indexes.map((i) => [i.name, i.unique]));
    expect(byName.get("sponsorships_re_edit_token_idx")).toBe(1);
    expect(byName.get("sponsorships_mollie_payment_id_idx")).toBe(0);
  });

  it("gives claims a UNIQUE index on the key", async () => {
    // Not a data-quality nicety, and the one assertion in this file that three
    // separate consumers rest on. `endpoints/mollie.ts`, `endpoints/render.ts`
    // and `endpoints/jobs.ts` all claim work by inserting a row here, and the
    // unique index is the only atomic operation this database offers — there
    // are no transactions, and an `update` with a `where` was measured
    // resolving its filter with a separate SELECT, so two concurrent writers
    // both "won" it. Downgrade this index to an ordinary one and every one of
    // them silently goes back to read-then-write: one payment advanced twice,
    // two Mux assets for one render, and two job runs at once.
    //
    // `pushDevSchema` derives the local schema from the collection config and
    // never opens a migration file, so only this asserts that a *deployed*
    // database gets the constraint.
    const { database } = await chain();
    const byName = new Map(
      indexesOn(database, "claims").map((i) => [i.name, i.unique])
    );

    expect(byName.get("claims_key_idx")).toBe(1);
    // And the two columns a sweep filters on are indexed but emphatically not
    // unique: many claims share a kind, and many share an expiry.
    expect(byName.get("claims_kind_idx")).toBe(0);
    expect(byName.get("claims_expires_at_idx")).toBe(0);
  });

  it("refuses a second claims row for one key", async () => {
    // The index asserted as behaviour rather than as metadata: a unique
    // index that SQLite reports but does not apply would satisfy the
    // assertion above, and the whole guard rests on this INSERT failing.
    const { database } = await chain();

    database.exec(
      `INSERT INTO claims (id, key, kind) VALUES (7300, 'mollie-delivery:tr_migration_probe', 'mollie-delivery');`
    );

    expect(() =>
      database.exec(
        `INSERT INTO claims (id, key, kind) VALUES (7301, 'mollie-delivery:tr_migration_probe', 'mollie-delivery');`
      )
    ).toThrow(/UNIQUE/i);
  });

  it("lets two kinds hold the same underlying identifier", async () => {
    // The reason the stored key is `${kind}:${key}` and not the caller's
    // string. A Mollie payment id and a Remotion job id are both opaque
    // strings chosen elsewhere; if they collided in this table one consumer
    // would find the other's claim taken and skip work only it could do.
    const { database } = await chain();

    expect(() => {
      database.exec(
        `INSERT INTO claims (id, key, kind) VALUES (7310, 'mollie-delivery:same-string', 'mollie-delivery');`
      );
      database.exec(
        `INSERT INTO claims (id, key, kind) VALUES (7311, 'render-completion:same-string', 'render-completion');`
      );
      database.exec(
        `INSERT INTO claims (id, key, kind) VALUES (7312, 'job-run:same-string', 'job-run');`
      );
    }).not.toThrow();
  });

  it("lets a claim be kept for ever or expire", async () => {
    // One table holds a receipt (`expires_at` NULL, kept for ever, which is
    // what stops a replayed Lambda callback making a second Mux asset) and a
    // lease (`expires_at` set, so a job runner that dies does not stop the
    // queue for good). A NOT NULL column here would make the first impossible.
    const { database } = await chain();

    database.exec(
      `INSERT INTO claims (id, key, kind) VALUES (7320, 'render-completion:receipt', 'render-completion');`
    );
    database.exec(
      `INSERT INTO claims (id, key, kind, expires_at) VALUES (7321, 'job-run:lease', 'job-run', '2026-01-01T00:00:00.000Z');`
    );

    expect(
      database
        .prepare(
          "SELECT key, expires_at FROM claims WHERE id IN (7320, 7321) ORDER BY id"
        )
        .all()
    ).toEqual([
      { key: "render-completion:receipt", expires_at: null },
      { key: "job-run:lease", expires_at: "2026-01-01T00:00:00.000Z" },
    ]);
  });

  it("gives the queue a job table and a log that dies with its job", async () => {
    /*
     * The one migration in this chain that no collection file describes.
     * `payload-jobs` exists because `src/jobs/index.ts` registers a task —
     * `config.jobs.enabled` is false until one does — so the only statement
     * of what a deployed database needs is the migration itself, and this is
     * the only thing that reads it.
     *
     * The log's cascade is the half worth asserting as behaviour: an attempt
     * record whose job has been deleted is a row nothing can reach, and
     * `deleteJobOnComplete` means jobs are deleted routinely.
     */
    const { database } = await chain();

    database.exec(
      `INSERT INTO payload_jobs (id, queue, task_slug) VALUES (7400, 'default', 'send-email');`
    );
    database.exec(
      `INSERT INTO payload_jobs_log (_order, _parent_id, id, executed_at, completed_at, task_slug, task_i_d, state) VALUES (1, 7400, 'log-7400', '2026-09-21T00:00:00.000Z', '2026-09-21T00:00:01.000Z', 'send-email', '1', 'failed');`
    );

    // A log row for a job that does not exist is refused, so the chain really
    // did emit the foreign key and not just a column named after one.
    expect(() =>
      database.exec(
        `INSERT INTO payload_jobs_log (_order, _parent_id, id, executed_at, completed_at, task_slug, task_i_d, state) VALUES (1, 9999, 'log-orphan', '2026-09-21T00:00:00.000Z', '2026-09-21T00:00:01.000Z', 'send-email', '1', 'failed');`
      )
    ).toThrow(/FOREIGN KEY/i);

    database.exec("DELETE FROM payload_jobs WHERE id = 7400;");

    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS n FROM payload_jobs_log WHERE _parent_id = 7400"
        )
        .get()
    ).toEqual({ n: 0 });
  });

  it("adds no locked-document column for the queue", async () => {
    /*
     * Every other collection this migration chain adds costs a twelve-step
     * rebuild of `payload_locked_documents_rels`, because Payload adds one
     * relationship column per collection. The jobs collection sets
     * `lockDocuments: false`, so it does not — and a migration that rebuilt
     * that table anyway would be a rebuild the pushed schema disagrees with,
     * which is exactly the drift `pushDevSchema` cannot catch.
     */
    const { database } = await chain();
    const columns = (
      database
        .prepare(
          "SELECT name FROM pragma_table_info('payload_locked_documents_rels')"
        )
        .all() as { name: string }[]
    ).map((column) => column.name);

    expect(columns).toContain("claims_id");
    expect(columns).not.toContain("payload_jobs_id");
  });

  it("gives renders a UNIQUE index on the job id", async () => {
    // The same claim mechanism as `claims` above, for the same reason and with
    // the same failure mode, on a different table. `endpoints/render.ts` takes
    // a render job by inserting this row, and a unique index is the only atomic
    // operation this database offers: there are no transactions, and an
    // `update` with a `where` was measured resolving its filter with a
    // separate SELECT, so two concurrent writers both "won" it. Downgrade
    // this index to an ordinary one and the claim silently goes back to
    // read-then-write — two Lambda callbacks for one job, two Mux assets, and
    // a monthly bill for the one nothing points at. `pushDevSchema` derives
    // the local schema from the collection config and never opens a migration
    // file, so only this asserts that a *deployed* database gets it.
    const { database } = await chain();
    const byName = new Map(
      indexesOn(database, "renders").map((i) => [i.name, i.unique])
    );

    expect(byName.get("renders_job_id_idx")).toBe(1);
    // And the lookups the callback and the expiry job make are indexed but
    // emphatically not unique: many renders share a state, and a sponsorship
    // that is rendered twice has two rows.
    expect(byName.get("renders_state_idx")).toBe(0);
    expect(byName.get("renders_sponsorship_idx")).toBe(0);
  });

  it("refuses a second renders row for one job id", async () => {
    // The index asserted as behaviour rather than as metadata, exactly as for
    // `claims` above: a unique index SQLite reports but does not apply would
    // satisfy the assertion above, and the whole guard rests on this INSERT
    // failing.
    const { database } = await chain();

    database.exec(
      `INSERT INTO renders (id, job_id, state) VALUES (7500, 'render-migration-probe', 'queued');`
    );

    expect(() =>
      database.exec(
        `INSERT INTO renders (id, job_id, state) VALUES (7501, 'render-migration-probe', 'queued');`
      )
    ).toThrow(/UNIQUE/i);
  });

  it("carries the two old claim tables' rows into claims", async () => {
    /*
     * The half of this migration that is not schema, and the half that can
     * lose money.
     *
     * A `webhook_deliveries` or `render_completions` row is a *receipt* — it
     * says the work was done. Creating an empty `claims` table and dropping
     * the two old ones would pass every assertion above and make every
     * completed render replayable the moment AWS retried a callback: at-least-
     * once delivery, a second Mux asset, a bill every month for a video
     * nobody can name.
     *
     * So this replays the chain up to the migration *before* the merge, puts a
     * row in each old table, and then runs the merge — which is the only way
     * to observe a data migration at all, since `chain()` above starts from an
     * empty database.
     */
    const database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys = ON;");
    const runner = migrationRunner(database);
    const merge = migrations.findIndex((m) => m.name === MERGE_MIGRATION);

    expect(merge).toBeGreaterThan(0);

    for (const migration of migrations.slice(0, merge)) {
      await migration.up(runner.args);
    }

    database.exec(
      `INSERT INTO webhook_deliveries (id, payment_id, created_at, updated_at) VALUES (1, 'tr_already_handled', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');`
    );
    database.exec(
      `INSERT INTO render_completions (id, job_id, created_at, updated_at) VALUES (1, 'render-already-uploaded', '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z');`
    );

    await migrations[merge]?.up(runner.args);

    expect(
      database
        .prepare(
          "SELECT key, kind, expires_at, created_at FROM claims ORDER BY key"
        )
        .all()
    ).toEqual([
      {
        key: "mollie-delivery:tr_already_handled",
        kind: "mollie-delivery",
        expires_at: null,
        created_at: "2026-09-01T00:00:00.000Z",
      },
      {
        key: "render-completion:render-already-uploaded",
        kind: "render-completion",
        expires_at: null,
        created_at: "2026-09-02T00:00:00.000Z",
      },
    ]);

    // And back again, so a rollback does not lose them either.
    await migrations[merge]?.down(runner.args);

    expect(
      database.prepare("SELECT payment_id FROM webhook_deliveries").all()
    ).toEqual([{ payment_id: "tr_already_handled" }]);
    expect(
      database.prepare("SELECT job_id FROM render_completions").all()
    ).toEqual([{ job_id: "render-already-uploaded" }]);
  });

  it("lets a sponsorship be deleted and leaves its render behind", async () => {
    // Payload writes `ON DELETE set null` for every relationship whether or
    // not the column can hold NULL, so a NOT NULL `sponsorship_id` would make
    // this delete fail — probed against a real D1, where it surfaced as a raw
    // `Failed query: delete from "sponsorships"`. Only an actual delete
    // distinguishes a rule SQLite honours from one it rejects, which is the
    // same ruling `user_consents` reached one collection earlier.
    //
    // Keeping the row is also the behaviour that matters: `mux_asset_id` is
    // what Mux charges for every month, and a render deleted with its
    // sponsorship is an asset nobody can name any more.
    const { database } = await chain();

    database.exec(
      `INSERT INTO gestures (id, playback_id) VALUES (7600, 'pb-render-migration');`
    );
    database.exec(
      `INSERT INTO sponsorships
         (id, gesture_id, sponsor_name, sponsor_email, contact_full_name, overlay_text,
          original_video_playback_id, status, start_date, end_date, duration_years, payment_amount)
       VALUES (7601, 7600, 'Acme', 'acme@example.test', 'Jan Janssens', 'Met dank aan Acme',
               'pb-render-migration', 'active', '2026-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z', 1, 5000);`
    );
    database.exec(
      `INSERT INTO renders (id, job_id, sponsorship_id, state, mux_asset_id)
       VALUES (7602, 'render-orphan-probe', 7601, 'ready', 'asset-migration-probe');`
    );

    database.exec("DELETE FROM sponsorships WHERE id = 7601;");

    expect(
      database
        .prepare(
          "SELECT sponsorship_id, mux_asset_id FROM renders WHERE id = 7602"
        )
        .all()
    ).toEqual([
      { mux_asset_id: "asset-migration-probe", sponsorship_id: null },
    ]);
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

  it("lets one payment id sit on every sponsorship it paid for", async () => {
    const { database } = await chain();
    // The index asserted as behaviour rather than as metadata, in the
    // direction that matters here: `pragma_index_list` reporting `unique: 0`
    // and SQLite letting the second row in are different claims, and it is
    // the second that makes a bulk checkout possible at all.
    //
    // This is the exact shape `endpoints/sponsorships.ts` writes — one row
    // per selected gesture, all naming one Mollie payment — and the exact
    // shape `apps/server/src/webhooks/mollie.ts` has always written.
    database.exec(
      `INSERT INTO gestures (id, playback_id)
       VALUES (9100, 'pb-bulk-a'), (9101, 'pb-bulk-b'), (9102, 'pb-bulk-c');`
    );

    const insert = (id: number, gesture: number) =>
      database.exec(
        `INSERT INTO sponsorships (
           id, gesture_id, sponsor_name, sponsor_email, contact_full_name,
           overlay_text, original_video_playback_id, start_date, end_date,
           payment_amount, mollie_payment_id
         ) VALUES (
           ${id}, ${gesture}, 'Sponsor', 'bulk@example.test', 'Contact',
           'Overlay', 'pb-original', '2026-01-01', '2027-01-01',
           5000, 'tr_one_payment_three_gestures'
         );`
      );

    expect(() => {
      insert(9110, 9100);
      insert(9111, 9101);
      insert(9112, 9102);
    }).not.toThrow();

    expect(
      database
        .prepare(
          "SELECT count(*) as rows FROM sponsorships WHERE mollie_payment_id = 'tr_one_payment_three_gestures'"
        )
        .all()
    ).toEqual([{ rows: 3 }]);
  });
});
