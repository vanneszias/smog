import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-d1-sqlite";

/**
 * `legacy_id` on `categories` and `gestures` — the Convex `_id` each row was
 * migrated from (Stage 9 Task 1).
 *
 * The importer built in Task 3 has to decide, on every run, whether it
 * already created a given Convex document — there are no transactions on
 * this adapter, an import can fail halfway, and a rerun must converge on the
 * same result without duplicating anything it already wrote. `legacyId`
 * being UNIQUE is what makes that possible: the importer's write is a plain
 * `create`, and a document already imported makes the insert fail on this
 * index rather than the importer needing its own existence check racing
 * against a second run. The alternatives considered and rejected in the
 * migration plan were keying on `name` (not unique — two gestures already
 * share one) and on `playbackId` (two gestures have none). See "Rulings
 * taken when writing this plan" in
 * `docs/superpowers/plans/2026-09-22-stage-9-data-migration.md`.
 *
 * Both columns are nullable with no default and not required: every row
 * created in the admin before or after cutover simply has no `legacyId`,
 * and only rows the importer writes ever get one.
 *
 * The DDL is the generator's: `payload migrate:create` was run against the
 * collection configs and the `legacy_id` column/index pair for `categories`
 * and `gestures` lifted out of its output, rather than hand-written.
 * Everything else it emitted was the same re-creation of tables that
 * migrations 20260920–20260922 already ship that
 * `20260922_100000_add_rate_limits` describes, because the last committed
 * drizzle snapshot in this repo predates them — discarded here for the same
 * reason.
 */
export async function up({
  db,
  payload: _payload,
  req: _req,
}: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`categories\` ADD \`legacy_id\` text;`);
  await db.run(
    sql`CREATE UNIQUE INDEX \`categories_legacy_id_idx\` ON \`categories\` (\`legacy_id\`);`
  );
  await db.run(sql`ALTER TABLE \`gestures\` ADD \`legacy_id\` text;`);
  await db.run(
    sql`CREATE UNIQUE INDEX \`gestures_legacy_id_idx\` ON \`gestures\` (\`legacy_id\`);`
  );
}

/** Back to no legacy ids. */
export async function down({
  db,
  payload: _payload,
  req: _req,
}: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`categories_legacy_id_idx\`;`);
  await db.run(sql`ALTER TABLE \`categories\` DROP COLUMN \`legacy_id\`;`);
  await db.run(sql`DROP INDEX \`gestures_legacy_id_idx\`;`);
  await db.run(sql`ALTER TABLE \`gestures\` DROP COLUMN \`legacy_id\`;`);
}
