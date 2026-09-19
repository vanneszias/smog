import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-d1-sqlite";

export async function up({
  db,
  payload: _payload,
  req: _req,
}: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`lists_items\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`gesture_id\` integer NOT NULL,
  	\`added_by_id\` integer,
  	FOREIGN KEY (\`gesture_id\`) REFERENCES \`gestures\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`added_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`lists\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`lists_items_order_idx\` ON \`lists_items\` (\`_order\`);`
  );
  await db.run(
    sql`CREATE INDEX \`lists_items_parent_id_idx\` ON \`lists_items\` (\`_parent_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`lists_items_gesture_idx\` ON \`lists_items\` (\`gesture_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`lists_items_added_by_idx\` ON \`lists_items\` (\`added_by_id\`);`
  );
  await db.run(sql`CREATE TABLE \`lists\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`description\` text,
  	\`owner_id\` integer NOT NULL,
  	\`visibility\` text DEFAULT 'private' NOT NULL,
  	\`view_share_token\` text,
  	\`edit_share_token\` text,
  	\`allow_shared_editing\` integer DEFAULT false,
  	\`is_default_favorites\` integer DEFAULT false,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`owner_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`CREATE INDEX \`lists_owner_idx\` ON \`lists\` (\`owner_id\`);`
  );
  await db.run(
    sql`CREATE UNIQUE INDEX \`lists_view_share_token_idx\` ON \`lists\` (\`view_share_token\`);`
  );
  await db.run(
    sql`CREATE UNIQUE INDEX \`lists_edit_share_token_idx\` ON \`lists\` (\`edit_share_token\`);`
  );
  await db.run(
    sql`CREATE INDEX \`lists_updated_at_idx\` ON \`lists\` (\`updated_at\`);`
  );
  await db.run(
    sql`CREATE INDEX \`lists_created_at_idx\` ON \`lists\` (\`created_at\`);`
  );
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`lists_id\` integer REFERENCES lists(id);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_lists_id_idx\` ON \`payload_locked_documents_rels\` (\`lists_id\`);`
  );
}

export async function down({
  db,
  payload: _payload,
  req: _req,
}: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`lists_items\`;`);
  await db.run(sql`DROP TABLE \`lists\`;`);
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
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`categories_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`gestures_id\`) REFERENCES \`gestures\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "media_id", "categories_id", "gestures_id") SELECT "id", "order", "parent_id", "path", "users_id", "media_id", "categories_id", "gestures_id" FROM \`payload_locked_documents_rels\`;`
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
}
