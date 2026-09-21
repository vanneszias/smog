import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-d1-sqlite";

/**
 * `payload_jobs` and `payload_jobs_log` — the queue's own tables.
 *
 * **Nothing in `src/collections` declares them.** They arrive because
 * `src/jobs/index.ts` registers a task: `config.jobs.enabled` is false until
 * one exists (`payload/dist/config/sanitize.js`), and the moment it flips
 * Payload adds a `payload-jobs` collection of its own. So this migration has
 * no collection file to read, and the DDL below is read back out of
 * `sqlite_master` after `pushDevSchema` derived it — the same way
 * `20260921_180000_add_claims` was written, and for the same reason: a
 * deployed database and a locally pushed one have to be the same shape or the
 * chain test is proving something about neither.
 *
 * ## `payload_locked_documents_rels` is deliberately untouched
 *
 * Every other collection added since Stage 1 has cost a twelve-step rebuild
 * of that table, because Payload adds a relationship column per collection.
 * This one does not: the jobs collection sets `lockDocuments: false`
 * (`queues/config/collection.js`), so it never takes an admin edit lock and
 * gets no column. Checked against the pushed schema rather than assumed — the
 * table's DDL is byte-identical before and after — which is why this
 * migration is two `CREATE TABLE`s and nothing else.
 *
 * ## Why the queue is a database table at all
 *
 * Workers cannot run a long-lived scheduler, so `jobs.autoRun` is unavailable
 * and the queue is drained by `GET /api/jobs/run` on a cron. That makes the
 * durable row the only thing standing between "the sponsor will be told" and
 * "the sponsor was going to be told when the isolate went away". A message
 * that cannot outlive the request that queued it is not a queue.
 *
 * `total_tried` and `has_error` are what bound the retries, and `wait_until`
 * is what defers them — Payload's own columns, listed here because they are
 * the mechanism `jobs/index.ts`'s policy is expressed in.
 */
export async function up({
  db,
  payload: _payload,
  req: _req,
}: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`payload_jobs\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`input\` text,
  	\`completed_at\` text,
  	\`total_tried\` numeric DEFAULT 0,
  	\`has_error\` integer DEFAULT false,
  	\`error\` text,
  	\`task_slug\` text,
  	\`queue\` text DEFAULT 'default',
  	\`wait_until\` text,
  	\`processing\` integer DEFAULT false,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `);
  await db.run(
    sql`CREATE INDEX \`payload_jobs_completed_at_idx\` ON \`payload_jobs\` (\`completed_at\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_jobs_total_tried_idx\` ON \`payload_jobs\` (\`total_tried\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_jobs_has_error_idx\` ON \`payload_jobs\` (\`has_error\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_jobs_task_slug_idx\` ON \`payload_jobs\` (\`task_slug\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_jobs_queue_idx\` ON \`payload_jobs\` (\`queue\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_jobs_wait_until_idx\` ON \`payload_jobs\` (\`wait_until\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_jobs_processing_idx\` ON \`payload_jobs\` (\`processing\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_jobs_updated_at_idx\` ON \`payload_jobs\` (\`updated_at\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_jobs_created_at_idx\` ON \`payload_jobs\` (\`created_at\`);`
  );

  // One row per attempt, and the reason a failed one failed. `task_i_d` is
  // Payload's own camel-case-to-snake-case of `taskID`, transcribed rather
  // than tidied: the adapter derives the column name the same way on every
  // read, so a "nicer" spelling here is a table the queue cannot use.
  await db.run(sql`CREATE TABLE \`payload_jobs_log\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`executed_at\` text NOT NULL,
  	\`completed_at\` text NOT NULL,
  	\`task_slug\` text NOT NULL,
  	\`task_i_d\` text NOT NULL,
  	\`input\` text,
  	\`output\` text,
  	\`state\` text NOT NULL,
  	\`error\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`payload_jobs\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `);
  await db.run(
    sql`CREATE INDEX \`payload_jobs_log_order_idx\` ON \`payload_jobs_log\` (\`_order\`);`
  );
  await db.run(
    sql`CREATE INDEX \`payload_jobs_log_parent_id_idx\` ON \`payload_jobs_log\` (\`_parent_id\`);`
  );
}

/**
 * Back to no queue.
 *
 * The log goes first: its `_parent_id` references `payload_jobs`, and
 * `migrations.test.ts` replays this chain with `PRAGMA foreign_keys = ON`, so
 * the other order is a migration that passes review and fails on the database.
 *
 * Nothing is carried anywhere, unlike the claim tables' merge. A row here is
 * either work that has not happened yet or the record of work that failed; a
 * `down` is a rollback to a build with no task registered, where neither can
 * be run by anything.
 */
export async function down({
  db,
  payload: _payload,
  req: _req,
}: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`payload_jobs_log\`;`);
  await db.run(sql`DROP TABLE \`payload_jobs\`;`);
}
