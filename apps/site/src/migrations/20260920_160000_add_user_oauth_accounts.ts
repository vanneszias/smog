import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-d1-sqlite";

/**
 * `users.oauthAccounts` — the identities at external providers that may sign
 * in to an account.
 *
 * The DDL is the DDL Payload's own `pushDevSchema` derives from the array
 * field, read back out of `sqlite_master` rather than hand-written, so a
 * deployed database and a locally pushed one are the same shape. Note the
 * `text` primary key: Payload gives array rows a generated string id, not an
 * integer.
 *
 * `ON DELETE cascade` on the parent is Payload's own choice for an array
 * field's table and is right here: a link has no meaning without the user it
 * links, and unlike `lists` there is nothing to preserve.
 */
export async function up({
  db,
  payload: _payload,
  req: _req,
}: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`users_oauth_accounts\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`provider\` text NOT NULL,
  	\`subject\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`users_oauth_accounts_order_idx\` ON \`users_oauth_accounts\` (\`_order\`);`
  );
  await db.run(
    sql`CREATE INDEX \`users_oauth_accounts_parent_id_idx\` ON \`users_oauth_accounts\` (\`_parent_id\`);`
  );
  await db.run(
    sql`CREATE INDEX \`users_oauth_accounts_provider_idx\` ON \`users_oauth_accounts\` (\`provider\`);`
  );
  await db.run(
    sql`CREATE INDEX \`users_oauth_accounts_subject_idx\` ON \`users_oauth_accounts\` (\`subject\`);`
  );
}

export async function down({
  db,
  payload: _payload,
  req: _req,
}: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`users_oauth_accounts\`;`);
}
