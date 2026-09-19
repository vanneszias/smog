import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-d1-sqlite";

/**
 * Makes `user_consents.user_id` nullable.
 *
 * SQLite cannot alter a column's nullability in place, so Drizzle emits the
 * standard twelve-step table rebuild: create `__new_user_consents` with the
 * relaxed column, copy every row across with `INSERT ... SELECT`, drop the
 * original and rename. Existing rows are carried over, not discarded — the
 * `SELECT` names all nine columns explicitly.
 *
 * The `FOREIGN KEY ... ON DELETE set null` was already there and is
 * unchanged. It was simply unsatisfiable while the column was `NOT NULL`:
 * deleting a user who had ever consented failed with a raw
 * `Failed query: delete from "users" ...`. This is the half of the fix that
 * makes it executable.
 */
export async function up({
  db,
  payload: _payload,
  req: _req,
}: MigrateUpArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`);
  await db.run(sql`CREATE TABLE \`__new_user_consents\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`user_id\` integer,
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
    sql`INSERT INTO \`__new_user_consents\`("id", "user_id", "analytics_consent", "marketing_consent", "consent_version", "ip_address", "user_agent", "updated_at", "created_at") SELECT "id", "user_id", "analytics_consent", "marketing_consent", "consent_version", "ip_address", "user_agent", "updated_at", "created_at" FROM \`user_consents\`;`
  );
  await db.run(sql`DROP TABLE \`user_consents\`;`);
  await db.run(
    sql`ALTER TABLE \`__new_user_consents\` RENAME TO \`user_consents\`;`
  );
  await db.run(sql`PRAGMA foreign_keys=ON;`);
  await db.run(
    sql`CREATE INDEX \`user_consents_user_idx\` ON \`user_consents\` (\`user_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`user_consents_updated_at_idx\` ON \`user_consents\` (\`updated_at\`);`
  );
  await db.run(
    sql`CREATE INDEX \`user_consents_created_at_idx\` ON \`user_consents\` (\`created_at\`);`
  );
}

export async function down({
  db,
  payload: _payload,
  req: _req,
}: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`);
  await db.run(sql`CREATE TABLE \`__new_user_consents\` (
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
    sql`INSERT INTO \`__new_user_consents\`("id", "user_id", "analytics_consent", "marketing_consent", "consent_version", "ip_address", "user_agent", "updated_at", "created_at") SELECT "id", "user_id", "analytics_consent", "marketing_consent", "consent_version", "ip_address", "user_agent", "updated_at", "created_at" FROM \`user_consents\`;`
  );
  await db.run(sql`DROP TABLE \`user_consents\`;`);
  await db.run(
    sql`ALTER TABLE \`__new_user_consents\` RENAME TO \`user_consents\`;`
  );
  await db.run(sql`PRAGMA foreign_keys=ON;`);
  await db.run(
    sql`CREATE INDEX \`user_consents_user_idx\` ON \`user_consents\` (\`user_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`user_consents_updated_at_idx\` ON \`user_consents\` (\`updated_at\`);`
  );
  await db.run(
    sql`CREATE INDEX \`user_consents_created_at_idx\` ON \`user_consents\` (\`created_at\`);`
  );
}
