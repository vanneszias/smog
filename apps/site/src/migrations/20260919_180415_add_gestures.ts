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
  await db.run(sql`CREATE TABLE \`gestures\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`playback_id\` text NOT NULL,
  	\`is_active\` integer DEFAULT true,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `);
  await db.run(
    sql`CREATE INDEX \`gestures_is_active_idx\` ON \`gestures\` (\`is_active\`);`
  );
  await db.run(
    sql`CREATE INDEX \`gestures_updated_at_idx\` ON \`gestures\` (\`updated_at\`);`
  );
  await db.run(
    sql`CREATE INDEX \`gestures_created_at_idx\` ON \`gestures\` (\`created_at\`);`
  );
  await db.run(sql`CREATE TABLE \`gestures_locales\` (
  	\`name\` text,
  	\`info\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`gestures\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`gestures_name_idx\` ON \`gestures_locales\` (\`name\`,\`_locale\`);`
  );
  await db.run(
    sql`CREATE UNIQUE INDEX \`gestures_locales_locale_parent_id_unique\` ON \`gestures_locales\` (\`_locale\`,\`_parent_id\`);`
  );
  await db.run(sql`CREATE TABLE \`gestures_texts\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`text\` text,
  	\`locale\` text,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`gestures\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`gestures_texts_order_parent\` ON \`gestures_texts\` (\`order\`,\`parent_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`gestures_texts_locale_parent\` ON \`gestures_texts\` (\`locale\`,\`parent_id\`);`
  );
  await db.run(sql`CREATE TABLE \`gestures_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`categories_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`gestures\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`categories_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`gestures_rels_order_idx\` ON \`gestures_rels\` (\`order\`);`
  );
  await db.run(
    sql`CREATE INDEX \`gestures_rels_parent_idx\` ON \`gestures_rels\` (\`parent_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`gestures_rels_path_idx\` ON \`gestures_rels\` (\`path\`);`
  );
  await db.run(
    sql`CREATE INDEX \`gestures_rels_categories_id_idx\` ON \`gestures_rels\` (\`categories_id\`);`
  );
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`gestures_id\` integer REFERENCES gestures(id);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_gestures_id_idx\` ON \`payload_locked_documents_rels\` (\`gestures_id\`);`
  );
}

export async function down({
  db,
  payload: _payload,
  req: _req,
}: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`gestures\`;`);
  await db.run(sql`DROP TABLE \`gestures_locales\`;`);
  await db.run(sql`DROP TABLE \`gestures_texts\`;`);
  await db.run(sql`DROP TABLE \`gestures_rels\`;`);
  await db.run(sql`PRAGMA foreign_keys=OFF;`);
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	\`media_id\` integer,
  	\`categories_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`categories_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "media_id", "categories_id") SELECT "id", "order", "parent_id", "path", "users_id", "media_id", "categories_id" FROM \`payload_locked_documents_rels\`;`
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
}
