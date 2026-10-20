import { sql } from "drizzle-orm";
import type { Db } from "./client";
import { deadLetter } from "./schema";

/**
 * Removes the dead letters addressed to `email` (phase 9 ruling 5c,
 * erasure): the rows whose stored body's `to` is that address, compared
 * case-insensitively. Rows without a body hold no address. The table is
 * small (14 days of retention), so the scan is bounded. Shared by the
 * self-service deletion and the admin's; each caller decides what a failure
 * means (the account is already gone by then).
 */
export async function eraseDeadLettersOf(db: Db, email: string): Promise<void> {
  await db
    .delete(deadLetter)
    .where(
      sql`${deadLetter.body} IS NOT NULL AND lower(json_extract(${deadLetter.body}, '$.to')) = ${email.toLowerCase()}`
    );
}
