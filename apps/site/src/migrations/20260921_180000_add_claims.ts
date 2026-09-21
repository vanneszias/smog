import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-d1-sqlite";

/**
 * `claims` — one table in place of `webhook_deliveries` and
 * `render_completions` (Stage 7 Task 2).
 *
 * The two tables were the same table twice: one row per opaque key, one unique
 * index, an insert that either wins or loses. There are four consumers now —
 * the Mollie webhook, the render callback, the job runner and
 * `cleanup-stale-payments` — so `collections/RenderCompletions.ts`'s deferred
 * merge happens here. The DDL is read back out of `sqlite_master` after
 * `pushDevSchema` derived it from the collection config, rather than
 * hand-written, so a deployed database and a locally pushed one are the same
 * shape.
 *
 * `claims_key_idx` being UNIQUE is the whole point of the table. It is the one
 * atomic operation this database offers — there are no transactions, and an
 * `update` with a `where` was measured resolving its filter with a separate
 * SELECT, so two concurrent writers both "won" it. Downgrade it to an ordinary
 * index and every consumer silently goes back to read-then-write: one payment
 * advanced twice, and **two Mux assets for one render**, one of which nothing
 * points at and everybody keeps paying for.
 *
 * ## The existing rows are carried across, and that is not tidiness
 *
 * A `webhook_deliveries` or `render_completions` row is a *receipt*: it says
 * the work was done. Creating an empty `claims` table and dropping the two old
 * ones would make every completed render replayable the moment AWS retried a
 * callback — at-least-once delivery, a second Mux asset, a monthly bill. So
 * every row is copied under its namespaced key before the old tables go.
 *
 * `expires_at` is left NULL on both, which is what makes them receipts rather
 * than leases: no comparison against NULL is ever true, so the sweep that
 * clears a dead job runner's lease can never reach them. See `lib/claims.ts`.
 *
 * ## `payload_locked_documents_rels` is rebuilt rather than altered
 *
 * Two columns have to go and one has to arrive, and SQLite cannot drop a
 * column a foreign key references — the same twelve-step rebuild
 * `20260921_140000_add_renders` and `20260921_160000_add_render_completions`
 * use, in the other direction. Rebuilding first is also what makes the two
 * `DROP TABLE`s below legal: nothing references them by then.
 *
 * The rows are copied without those two columns. They are admin edit locks on
 * rows that are about to stop existing, so there is nothing to preserve.
 */
export async function up({
  db,
  payload: _payload,
  req: _req,
}: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`claims\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`key\` text NOT NULL,
  	\`kind\` text NOT NULL,
  	\`expires_at\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `);
  await db.run(
    sql`CREATE UNIQUE INDEX \`claims_key_idx\` ON \`claims\` (\`key\`);`
  );
  await db.run(sql`CREATE INDEX \`claims_kind_idx\` ON \`claims\` (\`kind\`);`);
  await db.run(
    sql`CREATE INDEX \`claims_expires_at_idx\` ON \`claims\` (\`expires_at\`);`
  );
  await db.run(
    sql`CREATE INDEX \`claims_updated_at_idx\` ON \`claims\` (\`updated_at\`);`
  );
  await db.run(
    sql`CREATE INDEX \`claims_created_at_idx\` ON \`claims\` (\`created_at\`);`
  );

  // The receipts, under the keys `lib/claims.ts` now looks them up by. The
  // timestamps come across too: a claim's age is the only record of when the
  // work it covers was done.
  await db.run(
    sql`INSERT INTO \`claims\` ("key", "kind", "expires_at", "updated_at", "created_at") SELECT 'mollie-delivery:' || "payment_id", 'mollie-delivery', NULL, "updated_at", "created_at" FROM \`webhook_deliveries\`;`
  );
  await db.run(
    sql`INSERT INTO \`claims\` ("key", "kind", "expires_at", "updated_at", "created_at") SELECT 'render-completion:' || "job_id", 'render-completion', NULL, "updated_at", "created_at" FROM \`render_completions\`;`
  );

  await db.run(sql`PRAGMA foreign_keys=OFF;`);
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	\`media_id\` integer,
  	\`categories_id\` integer,
  	\`gestures_id\` integer,
  	\`lists_id\` integer,
  	\`sponsorships_id\` integer,
  	\`admin_logs_id\` integer,
  	\`user_consents_id\` integer,
  	\`renders_id\` integer,
  	\`claims_id\` integer,
  	\`search_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`categories_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`gestures_id\`) REFERENCES \`gestures\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lists_id\`) REFERENCES \`lists\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`sponsorships_id\`) REFERENCES \`sponsorships\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`admin_logs_id\`) REFERENCES \`admin_logs\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`user_consents_id\`) REFERENCES \`user_consents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`renders_id\`) REFERENCES \`renders\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`claims_id\`) REFERENCES \`claims\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`search_id\`) REFERENCES \`search\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "media_id", "categories_id", "gestures_id", "lists_id", "sponsorships_id", "admin_logs_id", "user_consents_id", "renders_id", "search_id") SELECT "id", "order", "parent_id", "path", "users_id", "media_id", "categories_id", "gestures_id", "lists_id", "sponsorships_id", "admin_logs_id", "user_consents_id", "renders_id", "search_id" FROM \`payload_locked_documents_rels\`;`
  );
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`);
  await db.run(
    sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`
  );
  await db.run(sql`PRAGMA foreign_keys=ON;`);
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_categories_id_idx\` ON \`payload_locked_documents_rels\` (\`categories_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_gestures_id_idx\` ON \`payload_locked_documents_rels\` (\`gestures_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_lists_id_idx\` ON \`payload_locked_documents_rels\` (\`lists_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_sponsorships_id_idx\` ON \`payload_locked_documents_rels\` (\`sponsorships_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_admin_logs_id_idx\` ON \`payload_locked_documents_rels\` (\`admin_logs_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_user_consents_id_idx\` ON \`payload_locked_documents_rels\` (\`user_consents_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_renders_id_idx\` ON \`payload_locked_documents_rels\` (\`renders_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_claims_id_idx\` ON \`payload_locked_documents_rels\` (\`claims_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_search_id_idx\` ON \`payload_locked_documents_rels\` (\`search_id\`);`
  );

  await db.run(sql`DROP TABLE \`webhook_deliveries\`;`);
  await db.run(sql`DROP TABLE \`render_completions\`;`);
}

/**
 * Back to two tables.
 *
 * The receipts go back the way they came, with the `kind:` prefix stripped by
 * `substr` rather than by a pattern — `key` is `${kind}:${key}` and both kinds
 * have a fixed length, so the offset is exact. A `job-run` lease has nothing to
 * go back to and is dropped with the table, which is correct: it is a lease on
 * work in progress, not a record that any work was done.
 */
export async function down({
  db,
  payload: _payload,
  req: _req,
}: MigrateDownArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`webhook_deliveries\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`payment_id\` text NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `);
  await db.run(
    sql`CREATE UNIQUE INDEX \`webhook_deliveries_payment_id_idx\` ON \`webhook_deliveries\` (\`payment_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`webhook_deliveries_updated_at_idx\` ON \`webhook_deliveries\` (\`updated_at\`);`
  );
  await db.run(
    sql`CREATE INDEX \`webhook_deliveries_created_at_idx\` ON \`webhook_deliveries\` (\`created_at\`);`
  );
  await db.run(sql`CREATE TABLE \`render_completions\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`job_id\` text NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `);
  await db.run(
    sql`CREATE UNIQUE INDEX \`render_completions_job_id_idx\` ON \`render_completions\` (\`job_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`render_completions_updated_at_idx\` ON \`render_completions\` (\`updated_at\`);`
  );
  await db.run(
    sql`CREATE INDEX \`render_completions_created_at_idx\` ON \`render_completions\` (\`created_at\`);`
  );
  await db.run(
    sql`INSERT INTO \`webhook_deliveries\` ("payment_id", "updated_at", "created_at") SELECT substr("key", 17), "updated_at", "created_at" FROM \`claims\` WHERE "kind" = 'mollie-delivery';`
  );
  await db.run(
    sql`INSERT INTO \`render_completions\` ("job_id", "updated_at", "created_at") SELECT substr("key", 19), "updated_at", "created_at" FROM \`claims\` WHERE "kind" = 'render-completion';`
  );

  await db.run(sql`PRAGMA foreign_keys=OFF;`);
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	\`media_id\` integer,
  	\`categories_id\` integer,
  	\`gestures_id\` integer,
  	\`lists_id\` integer,
  	\`sponsorships_id\` integer,
  	\`admin_logs_id\` integer,
  	\`user_consents_id\` integer,
  	\`webhook_deliveries_id\` integer,
  	\`renders_id\` integer,
  	\`render_completions_id\` integer,
  	\`search_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`categories_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`gestures_id\`) REFERENCES \`gestures\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lists_id\`) REFERENCES \`lists\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`sponsorships_id\`) REFERENCES \`sponsorships\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`admin_logs_id\`) REFERENCES \`admin_logs\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`user_consents_id\`) REFERENCES \`user_consents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`webhook_deliveries_id\`) REFERENCES \`webhook_deliveries\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`renders_id\`) REFERENCES \`renders\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`render_completions_id\`) REFERENCES \`render_completions\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`search_id\`) REFERENCES \`search\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "media_id", "categories_id", "gestures_id", "lists_id", "sponsorships_id", "admin_logs_id", "user_consents_id", "renders_id", "search_id") SELECT "id", "order", "parent_id", "path", "users_id", "media_id", "categories_id", "gestures_id", "lists_id", "sponsorships_id", "admin_logs_id", "user_consents_id", "renders_id", "search_id" FROM \`payload_locked_documents_rels\`;`
  );
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`);
  await db.run(
    sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`
  );
  await db.run(sql`PRAGMA foreign_keys=ON;`);
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_categories_id_idx\` ON \`payload_locked_documents_rels\` (\`categories_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_gestures_id_idx\` ON \`payload_locked_documents_rels\` (\`gestures_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_lists_id_idx\` ON \`payload_locked_documents_rels\` (\`lists_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_sponsorships_id_idx\` ON \`payload_locked_documents_rels\` (\`sponsorships_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_admin_logs_id_idx\` ON \`payload_locked_documents_rels\` (\`admin_logs_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_user_consents_id_idx\` ON \`payload_locked_documents_rels\` (\`user_consents_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_webhook_deliveries_id_idx\` ON \`payload_locked_documents_rels\` (\`webhook_deliveries_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_renders_id_idx\` ON \`payload_locked_documents_rels\` (\`renders_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_render_completions_id_idx\` ON \`payload_locked_documents_rels\` (\`render_completions_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_search_id_idx\` ON \`payload_locked_documents_rels\` (\`search_id\`);`
  );

  await db.run(sql`DROP TABLE \`claims\`;`);
}
