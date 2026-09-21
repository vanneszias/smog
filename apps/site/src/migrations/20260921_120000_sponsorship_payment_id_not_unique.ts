import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-d1-sqlite";

/**
 * `sponsorships.molliePaymentId` stops being unique (Stage 5 Task 7).
 *
 * Stage 1 made it unique — `20260919_214755_add_sponsorship_token_unique_indexes`
 * is the migration — on the reasoning that "the Mollie webhook resolves a
 * payment to a sponsorship through this column". It does not.
 * `endpoints/mollie.ts` resolves through `metadata.sponsorshipIds`, and the
 * column means "which payment paid for this", which is many-to-one: a
 * checkout covering three gestures writes three rows carrying one payment id,
 * and D1 refused the second of them. The constraint made the shipped bulk
 * purchase impossible rather than safer.
 *
 * Checked against the product rather than argued:
 * `packages/convex/convex/schema.ts` declares `by_payment_id` as a **plain**
 * index and `apps/server/src/webhooks/mollie.ts` writes the same payment id to
 * every sponsorship in a bulk payment. One payment id across many rows has
 * always been the intended behaviour.
 *
 * `reEditToken` keeps its unique index and must: it is a bearer credential,
 * where a collision hands one sponsor's token holder another sponsor's
 * record. So does `webhook_deliveries.payment_id`, which is one row per
 * payment and is the only atomic claim this adapter offers.
 *
 * Index-only, so no table rebuild: SQLite drops and recreates an index in
 * place. The DDL below is read back out of `sqlite_master` after
 * `pushDevSchema` derived it from the collection config, so a deployed
 * database and a locally pushed one are the same shape.
 */
export async function up({
  db,
  payload: _payload,
  req: _req,
}: MigrateUpArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`sponsorships_mollie_payment_id_idx\`;`);
  await db.run(
    sql`CREATE INDEX \`sponsorships_mollie_payment_id_idx\` ON \`sponsorships\` (\`mollie_payment_id\`);`
  );
}

/**
 * Putting the constraint back can fail, and that is correct.
 *
 * By the time anyone rolls this back there may be bulk payments in the table —
 * several rows sharing one id — and `CREATE UNIQUE INDEX` refuses over them.
 * A `down` that deduplicated first would be deleting somebody's paid
 * sponsorship to satisfy an index that should never have existed.
 */
export async function down({
  db,
  payload: _payload,
  req: _req,
}: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`sponsorships_mollie_payment_id_idx\`;`);
  await db.run(
    sql`CREATE UNIQUE INDEX \`sponsorships_mollie_payment_id_idx\` ON \`sponsorships\` (\`mollie_payment_id\`);`
  );
}
