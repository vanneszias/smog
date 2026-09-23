import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-d1-sqlite";

/**
 * Makes the database agree with the referential-integrity rules for lists:
 * `lists.owner_id` cascades, `lists_items.gesture_id` cascades.
 *
 * Payload emits every `required` relationship as `NOT NULL` with
 * `ON DELETE set null`, which SQLite cannot honour — it refuses the parent
 * delete with a raw `Failed query: delete from "users" ...` rather than
 * cleaning up or refusing legibly. That one defect affects four references;
 * `user_consents.user` was closed by making it nullable (so `set null` became
 * legal) and `sponsorships.gesture` by a hook that refuses. The two `lists`
 * references are the remaining pair, and for both of them the intended
 * behaviour is removal, so `cascade` is the constraint that says it.
 *
 * **This does not replace the hooks, and the hooks do not replace this.**
 * `hooks/cascadeListsOnUserDelete` and `hooks/dropDeletedGestureFromLists`
 * run first on every delete that goes through the Local API, which is every
 * delete the application or the admin panel performs, and they are what the
 * integration tests exercise. They keep the removal inside Payload's
 * lifecycle: `dropDeletedGestureFromLists` in particular rewrites the
 * surviving `lists_items` rows through `payload.update`, so `_order` stays
 * contiguous, where a database-level cascade would leave a gap (harmless for
 * `ORDER BY`, but Payload's idea of the row set and the table's would have
 * diverged without anything noticing). These constraints are the backstop
 * for the paths that never reach a hook — a `wrangler d1 execute`, a future
 * `payload.db` call, a bulk operation someone adds later — where today the
 * outcome is a raw SQL failure.
 *
 * **Hand-written, and with no `.json` snapshot beside it, deliberately.**
 * `payload migrate:create` derives its DDL from the collection configs, and
 * this migration changes no field on any collection. Nor could it: a single
 * `relationship` field's foreign key is emitted with a literal
 * `onDelete: 'set null'` in `@payloadcms/drizzle`'s
 * `dist/schema/traverseFields.js` (3.89.0, the `targetTable[fieldName]`
 * assignment), with no config path to anything else. So the generator has
 * nothing to diff and nothing it could produce. The snapshots are what the
 * next `migrate:create` diffs
 * against; leaving the last one (`20260919_230345_add_search.json`)
 * standing means a future schema change diffs config-against-config as
 * before and does not try to revert these two constraints. The same reasoning
 * `20260920_103500_share_token_defaults` records for its own missing
 * snapshot.
 *
 * The cost of that choice, stated plainly because it is a real hazard: the
 * migrated schema and the one `pushDevSchema` derives from the configs now
 * differ in these two constraints, and a later migration that rebuilds
 * either table from generated DDL will silently put `set null` back.
 * `migrations.test.ts` deletes a user and a gesture against the replayed
 * chain, so that regression fails a named test rather than a deploy.
 *
 * **Two rebuilds, `lists_items` first.** SQLite cannot alter a foreign key
 * in place, so each table takes the twelve-step rebuild. `lists_items`
 * carries a `_parent_id` foreign key into `lists`, so it is rebuilt while
 * `lists` still exists under its own name; doing it the other way round
 * leaves the rename resolving a reference to a table that has just been
 * dropped. Every column is named explicitly in both `INSERT ... SELECT`s: a
 * rebuild that recreated either table empty would satisfy every structural
 * assertion and destroy every list in the database, which is why
 * `migrations.test.ts` replays this chain with rows already in place.
 */
export async function up({
  db,
  payload: _payload,
  req: _req,
}: MigrateUpArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`);
  await db.run(sql`CREATE TABLE \`__new_lists_items\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`gesture_id\` integer NOT NULL,
  	\`added_by_id\` integer,
  	FOREIGN KEY (\`gesture_id\`) REFERENCES \`gestures\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`added_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`lists\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`INSERT INTO \`__new_lists_items\`("_order", "_parent_id", "id", "gesture_id", "added_by_id") SELECT "_order", "_parent_id", "id", "gesture_id", "added_by_id" FROM \`lists_items\`;`
  );
  await db.run(sql`DROP TABLE \`lists_items\`;`);
  await db.run(
    sql`ALTER TABLE \`__new_lists_items\` RENAME TO \`lists_items\`;`
  );
  await db.run(sql`CREATE TABLE \`__new_lists\` (
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
  	FOREIGN KEY (\`owner_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`INSERT INTO \`__new_lists\`("id", "name", "description", "owner_id", "visibility", "view_share_token", "edit_share_token", "allow_shared_editing", "is_default_favorites", "updated_at", "created_at") SELECT "id", "name", "description", "owner_id", "visibility", "view_share_token", "edit_share_token", "allow_shared_editing", "is_default_favorites", "updated_at", "created_at" FROM \`lists\`;`
  );
  await db.run(sql`DROP TABLE \`lists\`;`);
  await db.run(sql`ALTER TABLE \`__new_lists\` RENAME TO \`lists\`;`);
  await db.run(sql`PRAGMA foreign_keys=ON;`);
  // Dropping a table drops its indexes with it, including the two UNIQUE
  // ones that are the whole of the share tokens' collision guarantee.
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
}

/**
 * Puts both constraints back to `ON DELETE set null`, which is what
 * `20260919_200842_add_lists` created and what the collection configs still
 * describe.
 *
 * This restores the defect — a user who owns a list, or a gesture some list
 * holds, becomes undeletable through any path the hooks do not cover. That
 * is the correct `down`: it returns the schema to the state the previous
 * migration left it in, and rolling back past this migration is by
 * definition rolling back past the fix. It does not touch a single row.
 */
export async function down({
  db,
  payload: _payload,
  req: _req,
}: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`);
  await db.run(sql`CREATE TABLE \`__new_lists_items\` (
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
    sql`INSERT INTO \`__new_lists_items\`("_order", "_parent_id", "id", "gesture_id", "added_by_id") SELECT "_order", "_parent_id", "id", "gesture_id", "added_by_id" FROM \`lists_items\`;`
  );
  await db.run(sql`DROP TABLE \`lists_items\`;`);
  await db.run(
    sql`ALTER TABLE \`__new_lists_items\` RENAME TO \`lists_items\`;`
  );
  await db.run(sql`CREATE TABLE \`__new_lists\` (
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
    sql`INSERT INTO \`__new_lists\`("id", "name", "description", "owner_id", "visibility", "view_share_token", "edit_share_token", "allow_shared_editing", "is_default_favorites", "updated_at", "created_at") SELECT "id", "name", "description", "owner_id", "visibility", "view_share_token", "edit_share_token", "allow_shared_editing", "is_default_favorites", "updated_at", "created_at" FROM \`lists\`;`
  );
  await db.run(sql`DROP TABLE \`lists\`;`);
  await db.run(sql`ALTER TABLE \`__new_lists\` RENAME TO \`lists\`;`);
  await db.run(sql`PRAGMA foreign_keys=ON;`);
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
}
