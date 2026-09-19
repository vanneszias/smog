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
  await db.run(sql`DROP INDEX \`sponsorships_mollie_payment_id_idx\`;`);
  await db.run(sql`DROP INDEX \`sponsorships_re_edit_token_idx\`;`);
  await db.run(
    sql`CREATE UNIQUE INDEX \`sponsorships_mollie_payment_id_idx\` ON \`sponsorships\` (\`mollie_payment_id\`);`
  );
  await db.run(
    sql`CREATE UNIQUE INDEX \`sponsorships_re_edit_token_idx\` ON \`sponsorships\` (\`re_edit_token\`);`
  );
}

export async function down({
  db,
  payload: _payload,
  req: _req,
}: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`sponsorships_mollie_payment_id_idx\`;`);
  await db.run(sql`DROP INDEX \`sponsorships_re_edit_token_idx\`;`);
  await db.run(
    sql`CREATE INDEX \`sponsorships_mollie_payment_id_idx\` ON \`sponsorships\` (\`mollie_payment_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`sponsorships_re_edit_token_idx\` ON \`sponsorships\` (\`re_edit_token\`);`
  );
}
