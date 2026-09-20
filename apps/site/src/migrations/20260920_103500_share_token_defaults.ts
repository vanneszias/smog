import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from "@payloadcms/db-d1-sqlite";

/**
 * Backfills the share tokens on lists that predate token minting.
 *
 * **No schema change.** Both columns and both unique indexes have existed
 * since `20260919_200842_add_lists`; what never existed was anything that
 * wrote them, so every row Stage 1 and Stage 2 created carries NULL in both
 * and its share links are inert (the spec's "Sharing is inert until Stage 3",
 * gap 1). Stage 3 Task 7 adds a `beforeChange` hook that mints on create,
 * which fixes every *future* row and no existing one — an owner of an older
 * list has no way to obtain a link, because nothing mints on update either
 * (and nothing should: an explicitly cleared token is how a link is killed
 * permanently, and re-minting on the next save would resurrect it).
 *
 * Hence a data migration rather than a hook. It is deliberately the only
 * thing in this file, and there is deliberately no `.json` snapshot beside
 * it: those are Drizzle's schema snapshots, used by `payload migrate:create`
 * to diff against, and a migration that alters no schema must not move the
 * baseline the next one diffs from.
 *
 * **`hex(randomblob(16))` rather than a UUID.** SQLite has no UUID function,
 * and the format carries no meaning — the token is a bearer credential and
 * what matters is its entropy, which is the same 128 bits either way.
 * `randomblob` is non-deterministic and SQLite evaluates it per row, so one
 * `UPDATE` gives every row its own value rather than one value to all of
 * them; `migrations.test.ts` asserts exactly that against real SQLite,
 * because a single shared token across every legacy list would be the worst
 * possible outcome of this file and no schema assertion would notice it.
 *
 * `WHERE ... IS NULL` keeps it idempotent and keeps it off rows that already
 * have a token — including any minted between deploying the code and running
 * this.
 */
export async function up({
  db,
  payload: _payload,
  req: _req,
}: MigrateUpArgs): Promise<void> {
  await db.run(
    sql`UPDATE \`lists\` SET \`view_share_token\` = lower(hex(randomblob(16))) WHERE \`view_share_token\` IS NULL;`
  );
  await db.run(
    sql`UPDATE \`lists\` SET \`edit_share_token\` = lower(hex(randomblob(16))) WHERE \`edit_share_token\` IS NULL;`
  );
}

/**
 * Puts the backfilled tokens back to NULL.
 *
 * It cannot distinguish a token this migration generated from one an owner
 * has since rotated, so it matches on the shape it wrote: exactly 32
 * characters, every one of them lowercase hex. `crypto.randomUUID()` never
 * produces that — a UUID is 36 characters and carries dashes — so a minted
 * or rotated token is left alone. A down migration that cleared *every*
 * token would revoke live share links as the price of a rollback.
 */
export async function down({
  db,
  payload: _payload,
  req: _req,
}: MigrateDownArgs): Promise<void> {
  await db.run(
    sql`UPDATE \`lists\` SET \`view_share_token\` = NULL WHERE length(\`view_share_token\`) = 32 AND \`view_share_token\` NOT GLOB '*[^0-9a-f]*';`
  );
  await db.run(
    sql`UPDATE \`lists\` SET \`edit_share_token\` = NULL WHERE length(\`edit_share_token\`) = 32 AND \`edit_share_token\` NOT GLOB '*[^0-9a-f]*';`
  );
}
