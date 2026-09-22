"use client";

import { useEffect } from "react";
import {
  clearConsent,
  readConsent,
  subscribeConsent,
} from "@/lib/consentStore";

/**
 * The one thing in this app that turns a browser's analytics decision into a
 * `user-consents` row — and the one thing that takes a decision away again
 * when the account it was made by is no longer the account signed in.
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
 * lose one. What a *lost* marker costs is not free, and {@link markSynced}
 * now states that cost rather than the reassuring version this file used to
 * carry.
 *
 * ## It watches the store, and does not only read it once
 *
 * The effect runs on mount **and** subscribes to `lib/consentStore.ts`, so a
 * decision made on the page this component is already mounted on is recorded
 * when it is made. Reading the store once on mount was the original shape,
 * and it was wrong in a way no test saw: `ConsentBanner` writes
 * `localStorage` and nothing else, so a signed-in visitor who declined on the
 * landing page and closed the tab left *no row at all* — the refusal existed
 * only in a browser nobody would ever read it back from. A refusal that is
 * not recorded is, in this table, indistinguishable from never having been
 * asked, which is the one ambiguity this whole stage exists to remove.
 *
 * The subscription is also why this component is now the **only** caller of
 * {@link postConsent}, and why that function is no longer exported.
 * `AccountConsentControl` used to write the store and post itself; with a
 * store watcher mounted in the layout that would be two rows for one toggle,
 * every single time. So every control in this app writes the store, and the
 * store's one reader-and-reconciler is here.
 *
 * ## Ruling 12: the marker is scoped to an account, and a mismatch clears
 *
 * The marker used to hold only a value ("granted"/"denied"). That was wrong,
 * and a real walkthrough is what found it, not a hypothetical: account A
 * grants on a shared computer, signs out; account B signs in on the same
 * browser; `localStorage` still says "granted" and the old marker still says
 * "granted", so nothing would post — B would be tracked with *no row at
 * all*, which is the exact "no row is indistinguishable from a refusal"
 * ambiguity this whole stage exists to remove, reappearing on the read side
 * (`endpoints/analytics.ts`'s `withdrewConsent` treats an absent row as "not
 * withdrawn").
 *
 * The marker therefore records *which account* it was written for, and this
 * effect compares that against the account signed in now. Two outcomes when
 * they differ:
 *
 * - **The tempting fix — key the marker by user id and let the mismatch fall
 *   through to "not yet synced" — is wrong on purpose left unchosen.** That
 *   would make B's very first page load POST `"granted"` under B's own
 *   account, fabricating a row for a decision B never made. `user-consents`
 *   is evidence; inventing a row for it to save one POST is the wrong trade
 *   in every direction.
 * - **What actually happens:** the browser's decision is cleared
 *   (`clearConsent()`), **the marker is cleared with it**, and nothing is
 *   posted. `ConsentBanner` then reads `null` on the next render and asks B
 *   for themselves, and B's own answer produces B's own row, under B's own
 *   account, the ordinary way.
 *
 * Clearing the marker is not tidiness. Leaving it behind — which is what this
 * component originally did — pins it to account A for ever: B answers, only
 * `localStorage` is written, and the *next* page load finds A's marker beside
 * B's answer, calls it a mismatch again, and wipes it. B is asked on every
 * page, B's answer is never kept, and B's row is never written. The branch
 * titled "take no for an answer" never took one, on the one machine — a
 * shared browser — it was written for.
 *
 * ## The same machine, with nobody signed in
 *
 * Ruling 12 reasoned about A followed by B. A followed by *nobody* is the
 * same shared computer with the same consequence, and it is the more common
 * half, because signing out is something people do on purpose. So this
 * component is mounted for guests too, and a **marker with no session** is
 * the signal: some account synced a decision in this browser, there is no
 * longer an account to own it, so it is cleared and the next visitor is
 * asked for themselves.
 *
 * The signal is deliberately the marker rather than "no session". A guest who
 * answered the banner and never signed in has made a decision of their own
 * and has no marker beside it; clearing on every signed-out load would re-ask
 * them on every page, for ever, and would record nothing for anybody.
 *
 * `userId` is a required prop — `null` when nobody is signed in — rather
 * than something this component resolves itself, the same reason `GuestFavoritesSync` and `ConsentSync` are both
 * mounted from `[locale]/layout.tsx` rather than reading the session on
 * their own: the layout already has `user` in scope from `readSession()`,
 * and a second read here would be the same cost paid twice.
 *
 * ## The ordering rule
 *
 * Same as `lib/mergeGuestState.ts`: the irreversible step goes last.
 * Marking a decision synced, and clearing one that belongs to a different
 * account, are both one-way steps — the first happens only after the server
 * has acknowledged the POST, never before, so a failed POST leaves the
 * marker exactly where it was and the next signed-in page retries it.
 */

/** `POST /api/consent`, registered by `endpoints/consent.ts`. */
const CONSENT_PATH = "/api/consent";

/**
 * This browser's memory of "the server already has this answer, for this
 * account", distinct from `ANALYTICS_CONSENT_KEY` on purpose: that key is
 * the visitor's decision, and this one is this reconciler's own bookkeeping
 * about whether it told the server about it yet, and for whom. Confusing the
 * two is how a cleared decision would look, to this file, like a decision
 * that still needs syncing when it no longer exists at all — which is why
 * this is not folded into `lib/consentStore.ts`'s exports.
 */
const SYNCED_KEY = "smog.consent.synced";

/** What the marker holds: a value, and the account it was recorded for. */
interface SyncMarker {
  userId: string;
  value: string;
}

function isSyncMarker(value: unknown): value is SyncMarker {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { userId?: unknown }).userId === "string" &&
    typeof (value as { value?: unknown }).value === "string"
  );
}

function readSyncedMarker(): null | SyncMarker {
  try {
    if (typeof window === "undefined") {
      return null;
    }

    const raw = window.localStorage.getItem(SYNCED_KEY);

    if (raw === null) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);

    return isSyncMarker(parsed) ? parsed : null;
  } catch (error) {
    console.warn("[ConsentSync] Failed to read the sync marker:", error);
    return null;
  }
}

function clearSyncMarker(): void {
  try {
    window.localStorage.removeItem(SYNCED_KEY);
  } catch (error) {
    console.warn("[ConsentSync] Failed to clear the sync marker:", error);
  }
}

/**
 * Records which account this browser's decision has been posted for, and
 * says whether that actually stuck.
 *
 * ## What a lost marker really costs — the honest version
 *
 * This used to say that a lost marker "only risks one duplicate row on the
 * next page load, not a lost decision". Since Ruling 12 that is false, and it
 * was false in the direction that matters. `writeConsent` documents that
 * `setItem` throws `QuotaExceededError` in private browsing, so this write
 * can fail while `ANALYTICS_CONSENT_KEY` is already on disk from an earlier
 * page. The decision then sits in this browser with **nothing saying whose it
 * is**, the account-mismatch branch has no marker to compare and cannot fire,
 * and the next account to sign in falls straight through to
 * `postConsent(B, …)` — a row recorded for B out of A's decision, which
 * Ruling 12 names the worst of the three options it weighed.
 *
 * ## So the failure is detected rather than shrugged at
 *
 * The write is read back, which catches a store that throws *and* a store
 * that accepts the write and keeps nothing. When the marker is not durable
 * the caller drops the browser's decision: a decision this browser cannot
 * attribute is one it must not keep, because keeping it is what hands it to
 * the next account. The cost is that the banner asks again — the safe failure
 * Ruling 12 already priced, and the same one a person gets for signing out.
 * The row that was just written is unaffected: the account's answer is on the
 * record, and only this browser's copy of it is dropped.
 *
 * **What this does not close, stated rather than implied.** A marker that was
 * written and is *later* evicted — storage cleared for one key, a browser
 * reclaiming space — leaves exactly the same decision-without-an-owner, and
 * it cannot be told apart from the first-ever sync, where a null marker
 * legitimately means "never posted". Nothing client-side can distinguish the
 * two, so that gap stays open and is not claimed shut here. Closing it needs
 * the server check this module's "chosen: a local marker" note declined: one
 * indexed read per signed-in page load, which buys the distinction the
 * browser cannot make.
 */
function markSynced(userId: number | string, value: string): boolean {
  try {
    const marker: SyncMarker = { userId: String(userId), value };
    const serialised = JSON.stringify(marker);

    window.localStorage.setItem(SYNCED_KEY, serialised);

    return window.localStorage.getItem(SYNCED_KEY) === serialised;
  } catch (error) {
    console.warn("[ConsentSync] Failed to persist the sync marker:", error);

    return false;
  }
}

/**
 * Posts one decision to the account, and remembers having done so — for
 * that account, by id.
 *
 * Module-local, and that is the point: this is the single write path to
 * `/api/consent` in the browser, and the single caller is the reconciler
 * below. It used to be exported for `AccountConsentControl` to call directly;
 * now that the reconciler watches the store, a control that posted as well
 * would write two rows for one toggle. Never throws: the caller is an effect,
 * and `syncGuestFavorites` in `lib/mergeGuestState.ts` gives the reason an
 * effect that throws is worse than a decision retried on the next page.
 */
async function postConsent(
  userId: number | string,
  analyticsConsent: boolean
): Promise<boolean> {
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
  if (!markSynced(userId, analyticsConsent ? "granted" : "denied")) {
    /*
     * The decision is on the server and cannot be attributed here, so this
     * browser stops holding it. See {@link markSynced} for why this is the
     * lesser of the two wrongs available.
     */
    clearConsent();

    return false;
  }

  return true;
}

/**
 * A decision this browser is not entitled to keep, taken away.
 *
 * The order is not arbitrary: the decision goes first, the marker second. The
 * other way round would end the re-entrancy this reconciler has to guard
 * against anyway — but it would also mean that a marker removed before a
 * decision whose removal then throws leaves a decision with no owner, which
 * is the exact state {@link markSynced} exists to prevent. Failing towards
 * "asked again" beats failing towards "recorded for the wrong account".
 */
function dropForeignDecision(): void {
  clearConsent();
  clearSyncMarker();
}

/**
 * One pass: compare what this browser holds against who is signed in, and
 * carry, clear or do nothing.
 */
function reconcileConsent(userId: null | number | string): void {
  const consent = readConsent();
  const marker = readSyncedMarker();

  if (userId === null) {
    if (marker !== null) {
      // A decision some account already synced in this browser, with nobody
      // signed in to own it. See "The same machine, with nobody signed in".
      dropForeignDecision();
    }

    return;
  }

  if (consent === null) {
    // Nothing decided yet — there is nothing to carry onto the account.
    return;
  }

  if (marker !== null && marker.userId !== String(userId)) {
    // Ruling 12: a different account's answer is sitting in this browser's
    // storage. See the module doc comment for why this clears rather than
    // syncs — and why the marker goes with it.
    dropForeignDecision();

    return;
  }

  if (marker !== null && marker.value === consent) {
    // Already told the server this, for this account, and re-running is the
    // normal case: see "What already reconciled means here".
    return;
  }

  postConsent(userId, consent === "granted");
}

export function ConsentSync({ userId }: { userId: null | number | string }) {
  useEffect(() => {
    /*
     * Re-entrancy guard. `clearConsent()` notifies the store's subscribers,
     * and this reconciler is one of them — so a clear re-enters this pass
     * synchronously, finds the state it was called on, and clears again, for
     * ever. See {@link dropForeignDecision} for why the ordering inside the
     * clear is not the place to fix that.
     */
    let reconciling = false;

    const pass = () => {
      if (reconciling) {
        return;
      }

      reconciling = true;

      try {
        reconcileConsent(userId);
      } finally {
        reconciling = false;
      }
    };

    pass();

    return subscribeConsent(pass);
  }, [userId]);

  return null;
}
