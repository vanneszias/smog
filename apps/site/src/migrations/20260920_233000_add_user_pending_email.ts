import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-d1-sqlite";

/**
 * `users.pendingEmail` and its confirmation token.
 *
 * An address change is parked on the row until whoever reads the mail at the
 * new address confirms it — see `endpoints/account.ts` for why the address
 * cannot simply move. Three columns and one index, which is the DDL Payload's
 * own `pushDevSchema` derives from the fields, read back out of `sqlite_master`
 * rather than hand-written so that a deployed database and a locally pushed
 * one are the same shape.
 *
 * All three are nullable with no default: an account that has never asked to
 * change its address carries three NULLs, and `ALTER TABLE ... ADD` of a
 * nullable column is the one form SQLite applies without rewriting the table.
 *
 * `pending_email_token` is indexed because it is looked up by equality on
 * every confirmation, and it holds a SHA-256 digest rather than the token —
 * so this index cannot be read as a list of working links.
 */
export async function up({
  db,
  payload: _payload,
  req: _req,
}: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`users\` ADD \`pending_email\` text;`);
  await db.run(sql`ALTER TABLE \`users\` ADD \`pending_email_token\` text;`);
  await db.run(
    sql`ALTER TABLE \`users\` ADD \`pending_email_expires_at\` text;`
  );
  await db.run(
    sql`CREATE INDEX \`users_pending_email_token_idx\` ON \`users\` (\`pending_email_token\`);`
  );
}

export async function down({
  db,
  payload: _payload,
  req: _req,
}: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`users_pending_email_token_idx\`;`);
  await db.run(
    sql`ALTER TABLE \`users\` DROP COLUMN \`pending_email_expires_at\`;`
  );
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`pending_email_token\`;`);
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`pending_email\`;`);
}
