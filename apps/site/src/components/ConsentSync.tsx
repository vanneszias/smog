"use client";

import { useEffect } from "react";
import { readConsent } from "@/lib/consentStore";

/**
 * Carries this browser's analytics decision onto the signed-in account, the
 * first time there is one to carry it onto.
 *
 * ## Why this exists, and why it mirrors `GuestFavoritesSync`
 *
 * The guest's choice stays in the browser (`lib/consentStore.ts`) and a row
 * is written only once there is an account to attach it to — the same shape
 * `GuestFavoritesSync` uses for the same reason: sign-in redirects to the
 * home page, not to whatever page prompted the decision, so nothing else in
 * this app's request flow is a natural place to make the one POST that turns
 * a browser's answer into a legal-evidence row. It renders `null`; it is a
 * place to hang one effect, not a piece of UI.
 *
 * ## What "already reconciled" means here, and why
 *
 * Re-running this effect on every signed-in page load is the normal case,
 * not the exception — `lib/mergeGuestState.ts`'s doc comment states the same
 * rule for the same reason (no transactions on any write path, so
 * idempotence is a design requirement rather than a nicety). Posting a row
 * on every page load would turn `user-consents` from a legal-evidence table
 * into a log of page views, which is exactly the shape Review Focus 2 exists
 * to keep this table from becoming in the *other* direction (every refusal
 * silently dropped) — and a table that grows one row per page view for every
 * signed-in visitor is the same failure with the sign flipped.
 *
 * **Chosen: a local marker, not a server-side existence check.** Both were
 * available. A server check ("does the newest row for this account already
 * say what the browser says, at this `CONSENT_VERSION`?") is one indexed read
 * that `endpoints/analytics.ts`'s `withdrewConsent` already shows is cheap —
 * but it is a request on every single signed-in page load regardless of the
 * answer, which is the cost `GuestFavoritesSync`'s empty-array short-circuit
 * exists to avoid for the equally common case of "nothing changed since last
 * time". A local marker answers the same question for free, in the one place
 * that already holds the decision it is checking against, and is wrong in
 * exactly the same way `readConsent` already can be: cleared storage, a
 * private window, a second browser. Each of those means "sync once more",
 * never "never sync" or "sync forever" — the local marker is retried on
 * failure and it can only ever cost one duplicate row per browser reset, not
 * lose one.
 *
 * ## The ordering rule
 *
 * Same as `lib/mergeGuestState.ts`: the irreversible step goes last. There is
 * nothing here to clear — the local *decision* stays in `localStorage`
 * forever, so the banner does not reappear — but marking it synced is the
 * equivalent one-way step, so it happens only after the server has
 * acknowledged the POST, never before. A failed POST leaves the marker
 * exactly where it was, so the next signed-in page retries it.
 */

/** `POST /api/consent`, registered by `endpoints/consent.ts`. */
const CONSENT_PATH = "/api/consent";

/**
 * This browser's memory of "the server already has this answer", distinct
 * from `ANALYTICS_CONSENT_KEY` on purpose: that key is the visitor's
 * decision, and this one is this reconciler's own bookkeeping about whether
 * it told the server about it yet. Confusing the two is how a cleared decision
 * would look, to this file, like a decision that still needs syncing when it
 * no longer exists at all — which is why this is not folded into
 * `lib/consentStore.ts`'s exports.
 */
const SYNCED_KEY = "smog.consent.synced";

function readSyncedValue(): null | string {
  try {
    return typeof window === "undefined"
      ? null
      : window.localStorage.getItem(SYNCED_KEY);
  } catch (error) {
    console.warn("[ConsentSync] Failed to read the sync marker:", error);
    return null;
  }
}

function markSynced(value: string): void {
  try {
    window.localStorage.setItem(SYNCED_KEY, value);
  } catch (error) {
    // Best effort: a lost marker only risks one duplicate row on the next
    // page load, not a lost decision — the decision itself lives under
    // `ANALYTICS_CONSENT_KEY`, untouched by this failing.
    console.warn("[ConsentSync] Failed to persist the sync marker:", error);
  }
}

/**
 * Posts one decision to the account, and remembers having done so.
 *
 * Exported so `account/page.tsx`'s re-toggle control can make the same call
 * this effect does — the mechanism is not duplicated, it is shared. Never
 * throws: the caller here is a mount effect, and `syncGuestFavorites` in
 * `lib/mergeGuestState.ts` gives the reason an effect that throws is worse
 * than a decision that is retried on the next page — the account page's
 * caller also treats a `false` return as "leave the switch where it can be
 * retried" rather than as something to surface loudly.
 */
export async function postConsent(analyticsConsent: boolean): Promise<boolean> {
  try {
    const response = await fetch(CONSENT_PATH, {
      body: JSON.stringify({ analyticsConsent }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      return false;
    }
  } catch (error) {
    console.error("[ConsentSync] Failed to record consent:", error);
    return false;
  }

  // Last, and only here. See "The ordering rule" above.
  markSynced(analyticsConsent ? "granted" : "denied");

  return true;
}

export function ConsentSync() {
  useEffect(() => {
    const consent = readConsent();

    if (consent === null) {
      // Nothing decided yet — there is nothing to carry onto the account.
      return;
    }

    if (readSyncedValue() === consent) {
      // Already told the server this, and re-running is the normal case: see
      // "What already reconciled means here" above.
      return;
    }

    postConsent(consent === "granted");
  }, []);

  return null;
}
