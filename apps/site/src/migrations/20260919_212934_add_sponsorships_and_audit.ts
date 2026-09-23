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
  await db.run(sql`CREATE TABLE \`sponsorships\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`gesture_id\` integer NOT NULL,
  	\`sponsor_name\` text NOT NULL,
  	\`sponsor_email\` text NOT NULL,
  	\`contact_full_name\` text NOT NULL,
  	\`contact_company\` text,
  	\`overlay_text\` text NOT NULL,
  	\`overlay_image_id\` integer,
  	\`has_logo\` integer DEFAULT false,
  	\`original_video_playback_id\` text NOT NULL,
  	\`preview_video_playback_id\` text,
  	\`sponsored_video_playback_id\` text,
  	\`status\` text DEFAULT 'pending_payment' NOT NULL,
  	\`start_date\` text NOT NULL,
  	\`end_date\` text NOT NULL,
  	\`duration_years\` numeric DEFAULT 1 NOT NULL,
  	\`mollie_payment_id\` text,
  	\`payment_amount\` numeric NOT NULL,
  	\`rejection_reason\` text,
  	\`reviewed_by_id\` integer,
  	\`reviewed_at\` text,
  	\`re_edit_token\` text,
  	\`re_edit_token_expires_at\` text,
  	\`invoice_requested\` integer DEFAULT false,
  	\`invoice_name\` text,
  	\`invoice_vat_number\` text,
  	\`invoice_email\` text,
  	\`renewal_reminder_sent_at\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`gesture_id\`) REFERENCES \`gestures\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`overlay_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`reviewed_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`CREATE INDEX \`sponsorships_gesture_idx\` ON \`sponsorships\` (\`gesture_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`sponsorships_overlay_image_idx\` ON \`sponsorships\` (\`overlay_image_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`sponsorships_status_idx\` ON \`sponsorships\` (\`status\`);`
  );
  await db.run(
    sql`CREATE INDEX \`sponsorships_end_date_idx\` ON \`sponsorships\` (\`end_date\`);`
  );
  await db.run(
    sql`CREATE INDEX \`sponsorships_mollie_payment_id_idx\` ON \`sponsorships\` (\`mollie_payment_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`sponsorships_reviewed_by_idx\` ON \`sponsorships\` (\`reviewed_by_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`sponsorships_re_edit_token_idx\` ON \`sponsorships\` (\`re_edit_token\`);`
  );
  await db.run(
    sql`CREATE INDEX \`sponsorships_updated_at_idx\` ON \`sponsorships\` (\`updated_at\`);`
  );
  await db.run(
    sql`CREATE INDEX \`sponsorships_created_at_idx\` ON \`sponsorships\` (\`created_at\`);`
  );
  await db.run(sql`CREATE TABLE \`admin_logs\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`user_id\` integer,
  	\`action\` text NOT NULL,
  	\`target_type\` text NOT NULL,
  	\`target_id\` text NOT NULL,
  	\`metadata\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`CREATE INDEX \`admin_logs_user_idx\` ON \`admin_logs\` (\`user_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`admin_logs_action_idx\` ON \`admin_logs\` (\`action\`);`
  );
  await db.run(
    sql`CREATE INDEX \`admin_logs_updated_at_idx\` ON \`admin_logs\` (\`updated_at\`);`
  );
  await db.run(
    sql`CREATE INDEX \`admin_logs_created_at_idx\` ON \`admin_logs\` (\`created_at\`);`
  );
  await db.run(sql`CREATE TABLE \`user_consents\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`user_id\` integer NOT NULL,
  	\`analytics_consent\` integer DEFAULT false NOT NULL,
  	\`marketing_consent\` integer,
  	\`consent_version\` text NOT NULL,
  	\`ip_address\` text,
  	\`user_agent\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `);
  await db.run(
    sql`CREATE INDEX \`user_consents_user_idx\` ON \`user_consents\` (\`user_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`user_consents_updated_at_idx\` ON \`user_consents\` (\`updated_at\`);`
  );
  await db.run(
    sql`CREATE INDEX \`user_consents_created_at_idx\` ON \`user_consents\` (\`created_at\`);`
  );
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`sponsorships_id\` integer REFERENCES sponsorships(id);`
  );
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`admin_logs_id\` integer REFERENCES admin_logs(id);`
  );
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`user_consents_id\` integer REFERENCES user_consents(id);`
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
}

export async function down({
  db,
  payload: _payload,
  req: _req,
}: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`sponsorships\`;`);
  await db.run(sql`DROP TABLE \`admin_logs\`;`);
  await db.run(sql`DROP TABLE \`user_consents\`;`);
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
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`categories_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`gestures_id\`) REFERENCES \`gestures\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`lists_id\`) REFERENCES \`lists\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "media_id", "categories_id", "gestures_id", "lists_id") SELECT "id", "order", "parent_id", "path", "users_id", "media_id", "categories_id", "gestures_id", "lists_id" FROM \`payload_locked_documents_rels\`;`
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
}
