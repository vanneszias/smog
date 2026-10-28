/**
 * Realistic data on the schema of migration 0014 (before phase 10b), for the
 * migration tests that run a rebuild on it (`migration-0015.test.ts`): the
 * frozen dev seed (20 gestures with keywords, five categories, `gesture_fts`
 * rows and the admin), then a second admin, a banned admin, learners in every
 * locale, and one row in every table that references `user` or `sponsor`
 * (sessions, accounts, passkeys, consent, favorites, lists, shares, audit,
 * sponsorships with their payment, render job, events and tokens).
 *
 * Inserts the old column set only; the tests then apply every later
 * migration and compare each table with `snapshotTables`.
 */

export const ADMIN_ID = "5eed0003-0000-4000-8000-000000000001";
export const ADMIN2_ID = "u-admin-2";
export const BANNED_ADMIN_ID = "u-admin-banned";
export const LEARNER_NL_ID = "u-learner-nl";
export const LEARNER_FR_ID = "u-learner-fr";
export const LEARNER_EN_ID = "u-learner-en";
export const LEARNER_NONE_ID = "u-learner-none";

const T = 1_780_000_000_000;

function statements(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => line.trim() !== "" && !line.startsWith("--"));
}

/** The frozen dev seed, one statement per line. */
export async function applyLegacySeed(
  db: D1Database,
  seedSql: string
): Promise<void> {
  await db.batch(statements(seedSql).map((line) => db.prepare(line)));
}

/** Everything the rebuilds must not lose, on the 0014 schema. */
export async function seedRealisticData(db: D1Database): Promise<void> {
  const run = (sql: string, ...values: unknown[]) =>
    db.prepare(sql).bind(...values);

  const user = (
    id: string,
    email: string,
    role: string,
    locale: string | null,
    banned = 0,
    banExpires: number | null = null
  ) =>
    run(
      "INSERT INTO user (id, name, email, email_verified, role, locale, banned, ban_expires, created_at, updated_at, legacy_id, welcomed_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      `Naam ${id}`,
      email,
      role,
      locale,
      banned,
      banExpires,
      T,
      T,
      `legacy-${id}`,
      T + 5
    );

  await db.batch([
    // An unpublished category and gestures with accents, quotes and a keyword
    // in several words, beside the seed's twenty.
    run(
      "INSERT INTO category (id, slug, name, sort_order, published_at, created_at, updated_at) VALUES ('c-hidden', 'verborgen', 'Verborgen', 9, NULL, ?, ?)",
      T,
      T
    ),
    run(
      "INSERT INTO gesture (id, slug, name, sort_name, description, playback_id, published_at, created_at, updated_at, legacy_id) VALUES ('g-cafe', 'cafe', 'Café', 'cafe', 'Een koffie ''to go'' bestellen.', 'pb-cafe', ?, ?, ?, 'legacy-g-cafe'), ('g-draft', 'concept', 'Concept', 'concept', '', 'pb-draft', NULL, ?, ?, NULL)",
      T,
      T,
      T,
      T,
      T
    ),
    // A gesture whose index row is missing (an index that drifted): the
    // migration writes it from the tables.
    run(
      "INSERT INTO gesture (id, slug, name, sort_name, description, playback_id, published_at, created_at, updated_at) VALUES ('g-nofts', 'vergeten', 'Vergeten', 'vergeten', 'Niet geindexeerd.', 'pb-nofts', ?, ?, ?)",
      T,
      T,
      T
    ),
    run(
      "INSERT INTO gesture_keyword (gesture_id, keyword, position) VALUES ('g-cafe', 'koffie', 0), ('g-cafe', 'espresso bestellen', 1), ('g-draft', 'schets', 0), ('g-nofts', 'kwijt', 0)"
    ),
    run(
      "INSERT INTO gesture_category (gesture_id, category_id) VALUES ('g-cafe', '5eed0001-0000-4000-8000-000000000001'), ('g-cafe', 'c-hidden'), ('g-draft', 'c-hidden'), ('g-nofts', '5eed0001-0000-4000-8000-000000000001')"
    ),
    run(
      "INSERT INTO gesture_fts (gesture_id, name, keywords, categories, description) VALUES ('g-cafe', 'Café', 'koffie espresso bestellen', 'Begroeten', 'Een koffie ''to go'' bestellen.'), ('g-draft', 'Concept', 'schets', '', '')"
    ),
    // Users: a second admin, an admin whose ban is in force, learners.
    user(ADMIN2_ID, "admin2@example.test", "admin", "nl"),
    user(BANNED_ADMIN_ID, "banned-admin@example.test", "admin", "en", 1, null),
    user(LEARNER_NL_ID, "nl@example.test", "user", "nl"),
    user(LEARNER_FR_ID, "fr@example.test", "user", "fr"),
    user(LEARNER_EN_ID, "en@example.test", "user", "en"),
    user(LEARNER_NONE_ID, "none@example.test", "user", null),
    // Rows that cascade from user.
    run(
      "INSERT INTO session (id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id, impersonated_by) VALUES ('s-1', ?, 'tok-1', ?, ?, '203.0.113.1', 'UA', ?, NULL), ('s-2', ?, 'tok-2', ?, ?, NULL, NULL, ?, ?), ('s-3', ?, 'tok-3', ?, ?, NULL, NULL, ?, NULL)",
      T + 9_000_000,
      T,
      T,
      ADMIN_ID,
      T + 9_000_000,
      T,
      T,
      LEARNER_NL_ID,
      ADMIN_ID,
      T + 9_000_000,
      T,
      T,
      LEARNER_FR_ID
    ),
    run(
      "INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES ('a-1', ?, 'credential', ?, 'scrypt$hash', ?, ?), ('a-2', 'google-sub', 'google', ?, NULL, ?, ?)",
      LEARNER_NL_ID,
      LEARNER_NL_ID,
      T,
      T,
      LEARNER_FR_ID,
      T,
      T
    ),
    run(
      "INSERT INTO passkey (id, name, public_key, user_id, credential_id, counter, device_type, backed_up, created_at) VALUES ('pk-1', 'Laptop', 'pub', ?, 'cred-1', 3, 'singleDevice', 0, ?)",
      LEARNER_NL_ID,
      T
    ),
    run(
      "INSERT INTO consent_event (id, user_id, purpose, granted, policy_version, source, created_at) VALUES ('ce-1', ?, 'analytics', 1, '2026-09-30', 'web', ?), ('ce-2', ?, 'analytics', 0, '2026-09-30', 'mobile', ?)",
      LEARNER_NL_ID,
      T,
      LEARNER_NL_ID,
      T + 1
    ),
    run(
      "INSERT INTO guest_import (user_id, seq) VALUES (?, 1), (?, 2)",
      LEARNER_NL_ID,
      LEARNER_NL_ID
    ),
    run(
      "INSERT INTO favorite (user_id, gesture_id, created_at) VALUES (?, 'g-cafe', ?), (?, '5eed0002-0000-4000-8000-000000000001', ?), (?, 'g-cafe', ?)",
      LEARNER_NL_ID,
      T,
      LEARNER_NL_ID,
      T + 1,
      LEARNER_FR_ID,
      T
    ),
    run(
      "INSERT INTO list (id, owner_id, name, description, created_at, updated_at) VALUES ('l-1', ?, 'Mijn lijst', 'Beschrijving', ?, ?), ('l-2', ?, 'Lijst van fr', NULL, ?, ?)",
      LEARNER_NL_ID,
      T,
      T,
      LEARNER_FR_ID,
      T,
      T
    ),
    run(
      "INSERT INTO list_item (list_id, gesture_id, position, added_by, created_at) VALUES ('l-1', 'g-cafe', 0, ?, ?), ('l-1', '5eed0002-0000-4000-8000-000000000001', 1, ?, ?), ('l-2', 'g-cafe', 0, NULL, ?)",
      LEARNER_NL_ID,
      T,
      LEARNER_FR_ID,
      T,
      T
    ),
    run(
      "INSERT INTO list_share (id, list_id, role, token, created_by, created_at, revoked_at) VALUES ('ls-1', 'l-1', 'view', 'share-token-1', ?, ?, NULL), ('ls-2', 'l-1', 'edit', 'share-token-2', ?, ?, ?)",
      LEARNER_NL_ID,
      T,
      LEARNER_FR_ID,
      T,
      T + 2
    ),
    // Audit rows (the SET NULL column).
    run(
      "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, data, created_at) VALUES ('al-1', ?, 'gesture.update', 'gesture', 'g-cafe', '{\"fields\":[\"name\"]}', ?), ('al-2', ?, 'user.ban', 'user', ?, '{}', ?), ('al-3', NULL, 'legacy', 'system', NULL, '{\"legacy\":{}}', ?)",
      ADMIN_ID,
      T,
      ADMIN2_ID,
      BANNED_ADMIN_ID,
      T + 1,
      T + 2
    ),
    // Sponsors in every locale, with one invoice request.
    run(
      "INSERT INTO sponsor (id, name, email, company, locale, created_at) VALUES ('sp-nl', 'Sponsor NL', 'sponsor-nl@example.test', 'NL BV', 'nl', ?), ('sp-fr', 'Sponsor FR', 'Sponsor-FR@Example.test', NULL, 'fr', ?), ('sp-en', 'Sponsor EN', 'sponsor-en@example.test', 'EN Ltd', 'en', ?)",
      T,
      T,
      T
    ),
    run(
      "INSERT INTO invoice_request (sponsor_id, name, vat_number, email) VALUES ('sp-nl', 'NL BV', 'BE0123456749', 'billing@example.test')"
    ),
    run(
      "INSERT INTO sponsorship (id, sponsor_id, gesture_id, display_name, logo_key, status, starts_at, ends_at, video_playback_id, created_at, updated_at, legacy_id) VALUES ('ss-live', 'sp-nl', 'g-cafe', 'NL BV', 'logos/a', 'live', ?, ?, 'pb-live', ?, ?, 'legacy-ss-live'), ('ss-review', 'sp-fr', '5eed0002-0000-4000-8000-000000000001', 'Sponsor FR', NULL, 'in_review', NULL, NULL, NULL, ?, ?, NULL), ('ss-old', 'sp-en', 'g-cafe', 'EN Ltd', NULL, 'expired', ?, ?, NULL, ?, ?, NULL)",
      T,
      T + 9_000_000,
      T,
      T,
      T,
      T,
      T - 9_000_000,
      T - 1,
      T - 9_000_000,
      T
    ),
    run(
      "INSERT INTO payment (id, mollie_id, kind, status, amount_cents, currency, created_at, updated_at) VALUES ('pay-1', 'tr_1', 'initial', 'paid', 6000, 'EUR', ?, ?), ('pay-2', 'tr_2', 'initial', 'open', 6000, 'EUR', ?, ?)",
      T,
      T,
      T,
      T
    ),
    run(
      "INSERT INTO payment_item (payment_id, sponsorship_id, amount_cents, includes_logo) VALUES ('pay-1', 'ss-live', 6000, 1), ('pay-2', 'ss-review', 6000, 0), ('pay-1', 'ss-old', 0, 0)"
    ),
    run(
      "INSERT INTO render_job (id, sponsorship_id, status, workflow_instance_id, input, attempt, created_at, updated_at) VALUES ('rj-1', 'ss-live', 'succeeded', 'rj-1', '{\"a\":1}', 1, ?, ?), ('rj-2', 'ss-review', 'queued', 'rj-2', '{}', 2, ?, ?)",
      T,
      T,
      T,
      T
    ),
    run(
      "INSERT INTO sponsorship_event (id, sponsorship_id, type, actor_id, data, created_at) VALUES ('se-1', 'ss-live', 'approved', ?, '{}', ?), ('se-2', 'ss-live', 'created', NULL, '{}', ?), ('se-3', 'ss-review', 'rejected', ?, '{\"reason\":\"x\"}', ?)",
      ADMIN_ID,
      T,
      T - 1,
      ADMIN2_ID,
      T
    ),
    run(
      "INSERT INTO sponsorship_token (id, sponsorship_id, purpose, token_hash, expires_at, created_at) VALUES ('st-1', 'ss-live', 'reedit', 'hash-1', ?, ?), ('st-2', 'ss-live', 'renewal', 'hash-2', ?, ?)",
      T + 100,
      T,
      T + 100,
      T
    ),
  ]);
}

/** The tables of the schema that hold application data (no FTS shadow tables). */
export async function dataTables(db: D1Database): Promise<string[]> {
  const rows = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' AND name NOT LIKE 'gesture_fts%' AND name NOT LIKE '_bk_%' AND name NOT LIKE '__new_%' ORDER BY name"
    )
    .all<{ name: string }>();
  return rows.results.map((row) => row.name);
}

export type TableDump = Partial<
  Record<string, { columns: string[]; rows: Record<string, unknown>[] }>
>;

/** Every row of every table, ordered by all columns (a before/after comparison). */
export async function snapshotTables(
  db: D1Database,
  tables: string[]
): Promise<TableDump> {
  const dump: TableDump = {};
  for (const table of tables) {
    // biome-ignore lint/performance/noAwaitInLoops: a few table reads, in order.
    const info = await db
      .prepare(`SELECT name FROM pragma_table_info('${table}') ORDER BY cid`)
      .all<{ name: string }>();
    const columns = info.results.map((row) => row.name);
    const order = columns.map((_, i) => i + 1).join(", ");
    const rows = await db
      .prepare(
        `SELECT ${columns.map((c) => `"${c}"`).join(", ")} FROM "${table}" ORDER BY ${order}`
      )
      .all<Record<string, unknown>>();
    dump[table] = { columns, rows: rows.results };
  }
  return dump;
}

/** The rows of `table` restricted to the columns it had before. */
export async function rowsWithColumns(
  db: D1Database,
  table: string,
  columns: string[]
): Promise<Record<string, unknown>[]> {
  const order = columns.map((_, i) => i + 1).join(", ");
  const rows = await db
    .prepare(
      `SELECT ${columns.map((c) => `"${c}"`).join(", ")} FROM "${table}" ORDER BY ${order}`
    )
    .all<Record<string, unknown>>();
  return rows.results;
}

/**
 * A big audit table (the `actor_id` the user rebuild nulls and restores): `n`
 * rows, most with an admin as actor, one in ten a `legacy` row with none.
 */
export async function seedBulkAudit(db: D1Database, n: number): Promise<void> {
  await db
    .prepare(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${n})
       INSERT INTO audit_log (id, actor_id, action, target_type, target_id, data, created_at)
       SELECT 'bulk-' || printf('%06d', i), CASE WHEN i % 10 = 0 THEN NULL WHEN i % 3 = 0 THEN '${ADMIN2_ID}' ELSE '${ADMIN_ID}' END, CASE WHEN i % 10 = 0 THEN 'legacy' ELSE 'gesture.update' END, CASE WHEN i % 10 = 0 THEN 'system' ELSE 'gesture' END, 'g-' || (i % 50), '{"fields":["name"]}', 1700000000000 + i FROM n`
    )
    .run();
}
