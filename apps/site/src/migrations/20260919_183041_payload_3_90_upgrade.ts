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
  await db.run(
    sql`ALTER TABLE \`users\` ADD \`reset_password_requested_at\` text;`
  );
  await db.run(sql`ALTER TABLE \`media\` ADD \`_objectkey\` text;`);
}

export async function down({
  db,
  payload: _payload,
  req: _req,
}: MigrateDownArgs): Promise<void> {
  await db.run(
    sql`ALTER TABLE \`users\` DROP COLUMN \`reset_password_requested_at\`;`
  );
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`_objectkey\`;`);
}
