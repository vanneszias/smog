import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-d1-sqlite";

/**
 * `webhook-deliveries` — the unique-index lock the Mollie webhook claims a
 * payment with.
 *
 * One table and one **unique** index, plus the `payload_locked_documents_rels`
 * column Payload adds for every collection. The DDL is read back out of
 * `sqlite_master` after `pushDevSchema` derived it from the collection config,
 * rather than hand-written, so a deployed database and a locally pushed one
 * are the same shape.
 *
 * `webhook_deliveries_payment_id_idx` being UNIQUE is the whole point of the
 * table — see `collections/WebhookDeliveries.ts` for why nothing else on this
 * adapter can serialise two concurrent webhook deliveries, and
 * `migrations.test.ts` for the assertion that this chain really produces a
 * unique index rather than an ordinary one.
 *
 * The `down` follows `20260919_230345_add_search`: SQLite cannot drop a column
 * that a foreign key references, so `payload_locked_documents_rels` is rebuilt
 * the twelve-step way with its rows copied across.
 */
export async function up({
  db,
  payload: _payload,
  req: _req,
}: MigrateUpArgs): Promise<void> {
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
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`webhook_deliveries_id\` integer REFERENCES webhook_deliveries(id);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_webhook_deliveries_id_idx\` ON \`payload_locked_documents_rels\` (\`webhook_deliveries_id\`);`
  );
}

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
  	FOREIGN KEY (\`search_id\`) REFERENCES \`search\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "media_id", "categories_id", "gestures_id", "lists_id", "sponsorships_id", "admin_logs_id", "user_consents_id", "search_id") SELECT "id", "order", "parent_id", "path", "users_id", "media_id", "categories_id", "gestures_id", "lists_id", "sponsorships_id", "admin_logs_id", "user_consents_id", "search_id" FROM \`payload_locked_documents_rels\`;`
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
    sql`CREATE INDEX \`payload_locked_documents_rels_search_id_idx\` ON \`payload_locked_documents_rels\` (\`search_id\`);`
  );
  await db.run(sql`DROP TABLE \`webhook_deliveries\`;`);
}
