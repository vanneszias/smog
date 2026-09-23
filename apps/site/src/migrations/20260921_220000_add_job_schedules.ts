import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-d1-sqlite";

/**
 * What putting the four jobs on a clock costs the database.
 *
 * Three unrelated-looking changes, all consequences of the same commit, and
 * all of the kind that no collection file declares — so the DDL below is read
 * back out of `sqlite_master` after `pushDevSchema` derived it, the same way
 * `20260921_180000_add_claims` and `20260921_200000_add_payload_jobs` were
 * written and for the same reason: a deployed database and a locally pushed
 * one have to be the same shape or `migrations.test.ts` is proving something
 * about neither.
 *
 * ## `payload_jobs_stats`
 *
 * **Nothing in `src/collections` declares it, and nothing in `src/jobs`
 * mentions it.** It arrives because a task now carries a `schedule`:
 * `sanitize.js` pushes a `payload-jobs-stats` *global* the moment any task or
 * workflow has one, because `handleSchedules` stores each task's
 * `lastScheduledRun` there and computes the next occurrence from it
 * (`operations/handleSchedules/index.js`). Without the table, every tick of
 * `GET /api/jobs/run` throws on `findGlobal` — after the lease is taken, which
 * would make the first missing table the last time the queue ever ran.
 *
 * It is a global rather than a collection, which is why
 * `payload_locked_documents_rels` is untouched for the second migration
 * running: a global is locked through `payload_locked_documents.global_slug`, a
 * column that has existed since the first migration, rather than through a
 * relationship column of its own. Checked against the pushed schema rather than
 * assumed — the rels table's DDL is byte-identical before and after — and
 * `migrations.test.ts` asserts the absence as well as the presence.
 *
 * Every column is nullable, including `created_at` and `updated_at`, and that
 * is Payload's shape rather than an oversight: `defaultAfterSchedule` creates
 * the row itself with the timestamps it wants, and a global that has never
 * been written has no row at all.
 *
 * ## `payload_jobs.meta`
 *
 * The same cause and the quietest of the three. `getDefaultJobsCollection`
 * adds a `meta` field to the queue's own collection when `jobs.stats` is on,
 * which `sanitize.js` turns on for the same reason it adds the global — and
 * `handleSchedules` writes `{ scheduled: true }` into it on every job it
 * queues.
 *
 * That flag is not decoration. `defaultBeforeSchedule` decides whether a
 * schedule is already covered by counting jobs where `meta.scheduled` equals
 * true (`countRunnableOrActiveJobsForQueue`), so without this column the
 * count is asked of a column that is not there. A `schedule` that appeared to
 * work while quietly queueing a second job every tick is the failure shape
 * this whole migration is guarding against.
 *
 * ## `renders.settled_at`
 *
 * The other half of this migration: the readiness sweep could starve. It read
 * every render still holding a Mux asset — one page, newest first — so once the
 * product had more healthy live assets than fit in a page, an older render sat
 * behind every newer one for ever.
 *
 * A column the sweep writes turns that set from a history into a work queue.
 * `jobs/expireSponsorships.ts` stamps a render the moment Mux calls its asset
 * `ready`, which is terminal, and the candidate query then excludes it — so
 * the set drains and its size is the work outstanding rather than everything
 * that has ever happened. Indexed, because that query filters on it every
 * hour for ever.
 *
 * Nullable with no default, so every existing row is born unsettled and the
 * first sweep after this migration checks the whole backlog once — which is
 * the correct behaviour rather than a cost: nothing has ever asked Mux about
 * those assets a second time. `ALTER TABLE ... ADD` of a nullable column is
 * the one form SQLite applies without rewriting the table.
 */
export async function up({
  db,
  payload: _payload,
  req: _req,
}: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`payload_jobs_stats\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`stats\` text,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `);

  await db.run(sql`ALTER TABLE \`payload_jobs\` ADD \`meta\` text;`);

  await db.run(sql`ALTER TABLE \`renders\` ADD \`settled_at\` text;`);
  await db.run(
    sql`CREATE INDEX \`renders_settled_at_idx\` ON \`renders\` (\`settled_at\`);`
  );
}

/**
 * Back to four jobs nothing puts on a clock.
 *
 * The index before the column, because SQLite refuses to drop a column an
 * index still names, and `migrations.test.ts` replays this chain for real
 * rather than reading it.
 *
 * Nothing is carried anywhere. `payload_jobs_stats` holds one row saying when
 * each schedule was last evaluated, and a rollback to a build with no
 * schedules is a build in which that fact has no meaning; `settled_at` records
 * an answer Mux will give again for free.
 */
export async function down({
  db,
  payload: _payload,
  req: _req,
}: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`renders_settled_at_idx\`;`);
  await db.run(sql`ALTER TABLE \`renders\` DROP COLUMN \`settled_at\`;`);
  await db.run(sql`ALTER TABLE \`payload_jobs\` DROP COLUMN \`meta\`;`);
  await db.run(sql`DROP TABLE \`payload_jobs_stats\`;`);
}
