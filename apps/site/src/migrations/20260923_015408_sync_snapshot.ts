import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-d1-sqlite";

/**
 * A no-op migration that exists only to carry a fresh drizzle snapshot
 * (`20260923_015408_sync_snapshot.json`), not to change any schema.
 *
 * `payload migrate:create` picks its "previous snapshot" by reading every
 * `.json` file in this directory and sorting the *filenames* — see
 * `requireDrizzleKit().generateMigration` call site in
 * `@payloadcms/drizzle/dist/utilities/buildCreateMigration.js`:
 *
 *   fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse()?.[0]
 *
 * It does not consult `migrations/index.ts`, does not replay migrations, and
 * does not care whether a `.json` file has a matching, registered `.ts`
 * migration. It just diffs the config's current drizzle schema against
 * whichever snapshot alphabetically sorts last.
 *
 * Before this migration, that file was `20260919_230345_add_search.json` —
 * dated the same day as `20260919_230345_add_search.ts`, the last migration
 * in this repo that was generated *and committed* together. Every migration
 * from `20260920_103500_share_token_defaults` through
 * `20260923_001946_add_legacy_ids` was authored by running
 * `payload migrate:create`, taking the statements that actually mattered
 * (documented in each file's own doc comment) and discarding the rest, which
 * was `generateMigration` re-deriving every table those later migrations
 * already ship — because it never had a snapshot newer than Sept 19 to diff
 * against. Every author since has paid that tax by hand.
 *
 * This migration's `.json` sibling is the drizzle snapshot of the schema as
 * built by every migration up to and including
 * `20260923_001946_add_legacy_ids`, generated the same way
 * (`payload migrate:create` against the current collection configs, on an
 * empty local D1) and verified to reproduce an *empty* diff when
 * `migrate:create` is run again immediately afterward — proof this snapshot
 * matches what the committed migration chain actually produces, not just
 * what the config says it should. `up`/`down` are empty because the schema
 * itself is already fully created by the migrations before this one; this
 * file's only job is to move the "previous snapshot" pointer forward so the
 * next `payload migrate:create` diffs against Sept 23 instead of Sept 19.
 *
 * Keep this a no-op. If a future migration needs real schema changes, add a
 * new file after this one — do not put schema statements here, and do not
 * delete this file once anything is deployed past it (its `.json` is load
 * -bearing for every `migrate:create` that follows).
 */
export async function up({
  db: _db,
  payload: _payload,
  req: _req,
}: MigrateUpArgs): Promise<void> {
  // Intentionally empty — see file doc comment above.
}

export async function down({
  db: _db,
  payload: _payload,
  req: _req,
}: MigrateDownArgs): Promise<void> {
  // Intentionally empty — see file doc comment above.
}
