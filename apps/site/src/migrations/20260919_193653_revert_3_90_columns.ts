import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-d1-sqlite";

/**
 * Reverts the two columns Payload 3.90.1 added, after dropping back to 3.89.0.
 *
 * 3.90.x hashes passwords with 600,000 PBKDF2 iterations; workerd caps them at
 * 100,000, so no password could be set on Workers at all. 3.89.0 is the only
 * release that both clears GHSA-jg8r-5jh2-v2xj (fixed after 3.88.0) and still
 * uses the 25,000-iteration scheme that workerd accepts.
 *
 * The add-then-drop pair is deliberate: 20260919_183041 was already applied to
 * staging, so it stays and this corrects after it rather than rewriting
 * applied history.
 */

export async function up({
  db,
  payload: _payload,
  req: _req,
}: MigrateUpArgs): Promise<void> {
  await db.run(
    sql`ALTER TABLE \`users\` DROP COLUMN \`reset_password_requested_at\`;`
  );
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`_objectkey\`;`);
}

export async function down({
  db,
  payload: _payload,
  req: _req,
}: MigrateDownArgs): Promise<void> {
  await db.run(
    sql`ALTER TABLE \`users\` ADD \`reset_password_requested_at\` text;`
  );
  await db.run(sql`ALTER TABLE \`media\` ADD \`_objectkey\` text;`);
}
