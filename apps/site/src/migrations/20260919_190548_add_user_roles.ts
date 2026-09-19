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
    sql`ALTER TABLE \`users\` ADD \`role\` text DEFAULT 'user' NOT NULL;`
  );
  await db.run(sql`CREATE INDEX \`users_role_idx\` ON \`users\` (\`role\`);`);
}

export async function down({
  db,
  payload: _payload,
  req: _req,
}: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`users_role_idx\`;`);
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`role\`;`);
}
