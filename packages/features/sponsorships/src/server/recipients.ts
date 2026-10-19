/**
 * Who gets the admin emails (A-14, ruling 8): every `user` with the admin
 * role, a verified email and no ban in force, each in their own locale
 * (else `nl`). One message per admin, so one bad address does not block
 * the others (bug 30).
 */
import { DEFAULT_LOCALE, type Locale } from "@smog/config/constants";
import { user, userBanInForce } from "@smog/db";
import type { Db } from "@smog/db/client";
import type { OutboxEmail } from "@smog/email";
import { and, asc, eq, not } from "drizzle-orm";

export interface AdminRecipient {
  email: string;
  id: string;
  locale: Locale;
}

export async function adminRecipients(
  db: Db,
  now: Date
): Promise<AdminRecipient[]> {
  const rows = await db
    .select({ email: user.email, id: user.id, locale: user.locale })
    .from(user)
    .where(
      and(
        eq(user.role, "admin"),
        eq(user.emailVerified, true),
        not(userBanInForce(now))
      )
    )
    .orderBy(asc(user.id));
  return rows.map((row) => ({
    email: row.email,
    id: row.id,
    locale: row.locale ?? DEFAULT_LOCALE,
  }));
}

/** One email per admin, built by `build` (its idempotency key names the admin). */
export async function emailAdmins(
  db: Db,
  now: Date,
  build: (admin: AdminRecipient) => OutboxEmail
): Promise<OutboxEmail[]> {
  return (await adminRecipients(db, now)).map(build);
}
