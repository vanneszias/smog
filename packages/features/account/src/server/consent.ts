/**
 * The consent log (spec §5.3): append-only `consent_event` rows; the
 * current state is the newest analytics row (ties in the same millisecond
 * go to the row inserted last). IP address and user agent are not stored.
 */
import { CONSENT_POLICY_VERSION } from "@smog/config/constants";
import { consentEvent } from "@smog/db";
import type { Db } from "@smog/db/client";
import { newId } from "@smog/utils";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  type ConsentState,
  needsConsentDecision,
  type SetConsent,
  UNDECIDED_CONSENT,
} from "../schema";

/** The user's current analytics decision, or undecided. */
export async function getConsent(
  db: Db,
  userId: string
): Promise<ConsentState> {
  try {
    const [row] = await db
      .select({
        createdAt: consentEvent.createdAt,
        granted: consentEvent.granted,
        policyVersion: consentEvent.policyVersion,
      })
      .from(consentEvent)
      .where(
        and(
          eq(consentEvent.userId, userId),
          eq(consentEvent.purpose, "analytics")
        )
      )
      .orderBy(desc(consentEvent.createdAt), desc(sql`rowid`))
      .limit(1);
    if (!row) {
      return UNDECIDED_CONSENT;
    }
    return {
      analytics: row.granted,
      decidedAt: row.createdAt.getTime(),
      needsDecision: needsConsentDecision(row.granted, row.policyVersion),
      policyVersion: row.policyVersion,
    };
  } catch (error) {
    console.error("[account] Failed to read the consent state:", error);
    throw error;
  }
}

/**
 * Appends an analytics decision (policy `CONSENT_POLICY_VERSION`, dated
 * `now`) and returns the new state. A decision that repeats the current
 * one (same answer, current policy) appends nothing and returns the
 * current state, so the log (and the export) grows only with changes.
 * `beforeAppend` runs only when a row will be appended (the router's
 * per-user limit); it throws to refuse.
 */
export async function setConsent(
  db: Db,
  userId: string,
  input: SetConsent,
  now: Date = new Date(),
  { beforeAppend }: { beforeAppend?: () => Promise<void> } = {}
): Promise<ConsentState> {
  const current = await getConsent(db, userId);
  if (
    current.analytics === input.analytics &&
    current.policyVersion === CONSENT_POLICY_VERSION
  ) {
    return current;
  }
  await beforeAppend?.();
  try {
    await db.insert(consentEvent).values({
      createdAt: now,
      granted: input.analytics,
      id: newId(),
      policyVersion: CONSENT_POLICY_VERSION,
      purpose: "analytics",
      source: input.source,
      userId,
    });
  } catch (error) {
    console.error("[account] Failed to record the consent decision:", error);
    throw error;
  }
  return {
    analytics: input.analytics,
    decidedAt: now.getTime(),
    needsDecision: false,
    policyVersion: CONSENT_POLICY_VERSION,
  };
}
