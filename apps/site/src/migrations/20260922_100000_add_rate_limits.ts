import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-d1-sqlite";

/**
 * `rate_limits` — the counter the analytics relay cannot ship without.
 *
 * A counter needs a store every isolate shares, and `wrangler.jsonc`'s whole
 * binding inventory is `ASSETS`, `D1`, `R2` and `EMAIL` — no KV, no Durable
 * Object, no Rate Limiting binding. So the store is D1, and the counter is
 * `lib/rateLimit.ts`.
 *
 * `rate_limits_key_idx` being UNIQUE is the whole point of the table, for the
 * same reason `claims_key_idx` is (see `20260921_180000_add_claims` and
 * `lib/claims.ts`): there are no transactions on this adapter and a `where` on
 * an update is a SELECT, so the only way to count without losing increments is
 * `INSERT … ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count`,
 * which SQLite evaluates as one statement against this index. Downgrade it to
 * an ordinary index and the upsert stops conflicting: every request inserts a
 * new row with `count = 1`, every request is under the limit, and the endpoint
 * is unlimited while still looking rate-limited. Measured, at a limit of 10
 * with 20 parallel calls: 10 allowed through the unique index, 20 without one.
 *
 * `window_start` is indexed because `jobs/` prunes on it. These rows are
 * derived from client addresses — personal data whose useful life is one
 * window — so the retention sweep is part of the feature, not housekeeping.
 *
 * The DDL is the generator's: `payload migrate:create` was run against the
 * collection config and the `rate_limits` statements lifted out of its output,
 * rather than hand-written. Everything else it emitted was a re-creation of
 * tables that migrations 20260920–20260921 already ship, because the last
 * committed drizzle snapshot in this repo predates them.
 */
export async function up({
  db,
  payload: _payload,
  req: _req,
}: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`rate_limits\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`key\` text NOT NULL,
  	\`count\` numeric NOT NULL,
  	\`window_start\` numeric NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `);
  await db.run(
    sql`CREATE UNIQUE INDEX \`rate_limits_key_idx\` ON \`rate_limits\` (\`key\`);`
  );
  await db.run(
    sql`CREATE INDEX \`rate_limits_window_start_idx\` ON \`rate_limits\` (\`window_start\`);`
  );
  await db.run(
    sql`CREATE INDEX \`rate_limits_updated_at_idx\` ON \`rate_limits\` (\`updated_at\`);`
  );
  await db.run(
    sql`CREATE INDEX \`rate_limits_created_at_idx\` ON \`rate_limits\` (\`created_at\`);`
  );

  // Registering a collection adds its column to the admin edit-lock join
  // table. `ALTER TABLE … ADD` is enough in this direction; taking it away
  // again is not — see `down`.
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`rate_limits_id\` integer REFERENCES rate_limits(id);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_rate_limits_id_idx\` ON \`payload_locked_documents_rels\` (\`rate_limits_id\`);`
  );
}

/**
 * Back to no counter.
 *
 * `payload_locked_documents_rels` is rebuilt rather than altered: SQLite
 * cannot drop a column a foreign key references, which is the same twelve-step
 * rebuild `20260921_180000_add_claims` performs in the other direction. The
 * rows are copied without that column — they are admin edit locks on rows that
 * are about to stop existing, so there is nothing to preserve — and rebuilding
 * first is also what makes the `DROP TABLE` below legal.
 */
export async function down({
  db,
  payload: _payload,
  req: _req,
}: MigrateDownArgs): Promise<void> {
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
    sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "media_id", "categories_id", "gestures_id", "lists_id", "sponsorships_id", "admin_logs_id", "user_consents_id", "renders_id", "claims_id", "search_id") SELECT "id", "order", "parent_id", "path", "users_id", "media_id", "categories_id", "gestures_id", "lists_id", "sponsorships_id", "admin_logs_id", "user_consents_id", "renders_id", "claims_id", "search_id" FROM \`payload_locked_documents_rels\`;`
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

  await db.run(sql`DROP TABLE \`rate_limits\`;`);
}
