/**
 * The SQL of `bun run admin:grant` (spec §6, phase 8 ruling 18): one
 * definition, so the script (`scripts/admin-grant.ts`) and the site's
 * Workers-pool proof (`apps/site/test/maintenance-admin-signin.test.ts`)
 * run the same statements. Pure strings, no I/O; client-safe.
 *
 * - The grant: `UPDATE user SET role = 'admin'` and lifts any ban, by the
 *   lower-cased email. It only ever sets `admin`, so it never demotes, and
 *   0007's `user_keep_one_admin` trigger never fires an abort for it.
 * - `create: true` first inserts the account when no account has that
 *   email: verified, role `admin`, no credential (no `account` row), name
 *   `""`, a new UUID, and `welcomed_at` set (the welcome email is for
 *   sign-ups). The insert names its conflict target (`email`) and does
 *   nothing on it, so an existing account falls back to the plain grant.
 *   That account then signs in with an email code, a magic link or a
 *   provider, which all prove control of the address.
 */

/** Deliberately strict: one `local@domain.tld`, no spaces or control chars. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Now, in the epoch milliseconds Better Auth's columns hold. */
const NOW_MS = "CAST(unixepoch('subsec') * 1000 AS INTEGER)";

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** The email as Better Auth stores it (trimmed, lower-cased), or a throw. */
function normalizeGrantEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL.test(normalized)) {
    throw new Error(
      `[adminGrant] Not an email address: ${JSON.stringify(email)}`
    );
  }
  return normalized;
}

export interface GrantSqlOptions {
  /** Insert the account first when no account has the email. */
  create?: boolean;
  /** The new account's id (tests); a fresh UUID v4 otherwise. */
  id?: string;
}

/**
 * The statements in order: with `create`, the insert, then always the
 * grant. Each answers with `RETURNING`, so the output shows whether a row
 * was created and the account's role afterwards.
 */
export function buildGrantStatements(
  email: string,
  { create = false, id = crypto.randomUUID() }: GrantSqlOptions = {}
): string[] {
  const normalized = quote(normalizeGrantEmail(email));
  const grant = `UPDATE user SET role = 'admin', banned = 0, ban_reason = NULL, ban_expires = NULL, updated_at = ${NOW_MS} WHERE email = ${normalized} RETURNING id, email, role, banned;`;
  if (!create) {
    return [grant];
  }
  if (!UUID.test(id)) {
    throw new Error(`[adminGrant] Not a UUID: ${JSON.stringify(id)}`);
  }
  const insert = `INSERT INTO user (id, name, email, email_verified, image, created_at, updated_at, role, banned, locale, welcomed_at) VALUES (${quote(id)}, '', ${normalized}, 1, NULL, ${NOW_MS}, ${NOW_MS}, 'admin', 0, NULL, ${NOW_MS}) ON CONFLICT (email) DO NOTHING RETURNING id AS created_id;`;
  return [insert, grant];
}

/**
 * `buildGrantStatements` as one `wrangler d1 execute --command` argument,
 * which runs them in order (one line, so a printed command stays
 * copyable).
 */
export function buildGrantSql(
  email: string,
  options: GrantSqlOptions = {}
): string {
  return buildGrantStatements(email, options).join(" ");
}
