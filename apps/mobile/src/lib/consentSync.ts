import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect } from "react";
import { AppState } from "react-native";
import { payloadFetch } from "@/lib/api";
import {
  clearConsent,
  loadConsent,
  readConsent,
  subscribeConsent,
} from "@/lib/consent";
import { getToken, getVerifiedToken, useSession } from "@/lib/session";

/**
 * Writes a signed-in person's analytics decision to `POST /api/consent`, once
 * per change — a port of `apps/site/src/components/ConsentSync.tsx`, whose
 * comments explain each rule below and the bug that produced it.
 *
 * Two things differ from the web, both because AsyncStorage is asynchronous:
 *
 * - Passes are chained, not flag-guarded. A synchronous `reconciling` flag
 *   only prevents re-entry within one tick; here a consent change and a
 *   session change can both be mid-`await` at once, both read the old
 *   marker, and both POST.
 * - There is no page load to retry on, so the hook also runs a pass when the
 *   app returns to the foreground. A failed write leaves its marker
 *   `pending`, and the next pass sends it again.
 *
 * Two more things a fix-round review found, both about `useSession`'s
 * asynchrony rather than `AsyncStorage`'s:
 *
 * - `user === null` does not mean "signed out". `resolveSessionUser`
 *   (`session.ts`) answers `null` both for a genuine sign-out (no token)
 *   and for a token it could not verify (offline, a stalled request, a
 *   429/5xx) — `pass` tells the two apart with `getToken()` before it will
 *   drop a decision.
 * - A pass carries the `userId` it was enqueued for, but the keychain can
 *   already hold a *different* account's token by the time it runs
 *   (`SessionProvider` does not re-verify the instant a token changes) —
 *   `pass` refuses to POST unless `getToken()` still matches
 *   `getVerifiedToken()`, so an outgoing account's decision is never sent
 *   under an incoming one's token. And `postConsent`'s request now carries
 *   a hand-rolled timeout, so a stalled one fails into the retry path
 *   instead of holding every later pass queued behind it forever.
 */
export const CONSENT_SYNCED_KEY = "smog.consent.synced";

/**
 * How long a `POST /api/consent` is given before it is treated as failed.
 * Without this, a stalled request (a dropped connection that never errors,
 * a captive portal that never answers) would hold the shared `queue`
 * forever — every later pass, including the one that would drop a marker
 * on a real sign-out, waits behind it. Fifteen seconds is generous for one
 * small JSON POST and short enough that a person who backgrounds and
 * reopens the app is not stuck behind yesterday's stalled request.
 */
const CONSENT_POST_TIMEOUT_MS = 15_000;

interface SyncMarker {
  pending?: true;
  userId: string;
  value: string;
}

function isSyncMarker(value: unknown): value is SyncMarker {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.userId === "string" &&
    typeof candidate.value === "string" &&
    (candidate.pending === undefined || candidate.pending === true)
  );
}

async function readMarker(): Promise<SyncMarker | null> {
  try {
    const raw = await AsyncStorage.getItem(CONSENT_SYNCED_KEY);
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return isSyncMarker(parsed) ? parsed : null;
  } catch (error) {
    console.warn("[consentSync] Failed to read the sync marker:", error);
    return null;
  }
}

async function writeMarker(marker: SyncMarker): Promise<boolean> {
  try {
    await AsyncStorage.setItem(CONSENT_SYNCED_KEY, JSON.stringify(marker));
    return true;
  } catch (error) {
    console.warn("[consentSync] Failed to persist the sync marker:", error);
    return false;
  }
}

async function clearMarker(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CONSENT_SYNCED_KEY);
  } catch (error) {
    console.warn("[consentSync] Failed to clear the sync marker:", error);
  }
}

async function dropForeignDecision(): Promise<void> {
  await clearConsent();
  await clearMarker();
}

async function postConsent(
  userId: string,
  value: "granted" | "denied"
): Promise<void> {
  // Provisional first: if the app dies mid-request, the decision is already
  // attributed to this account, so a different person signing in next drops
  // it instead of inheriting it (Stage 8.5 whole-branch review, blocker A).
  if (!(await writeMarker({ pending: true, userId, value }))) {
    await clearConsent();
    return;
  }

  // `AbortSignal.timeout` is not relied on — it does not exist on every
  // Hermes build this app ships to — so the timeout is wired by hand: an
  // `AbortController` whose `abort()` a plain `setTimeout` calls, cleared
  // the moment the request settles either way. Without this, a request
  // that never errors and never resolves would hold this pass — and every
  // later one queued behind it in `reconcileConsent`'s chain — forever.
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, CONSENT_POST_TIMEOUT_MS);

  try {
    await payloadFetch("/consent", {
      auth: true,
      body: JSON.stringify({ analyticsConsent: value === "granted" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: controller.signal,
    });
  } catch (error) {
    console.error("[consentSync] Failed to record consent:", error);
    return;
  } finally {
    clearTimeout(timeout);
  }

  if (!(await writeMarker({ userId, value }))) {
    await clearConsent();
  }
}

async function pass(userId: string | null): Promise<void> {
  await loadConsent();
  const consent = readConsent();
  const marker = await readMarker();

  if (userId === null) {
    // A stored token with no resolved user is not a sign-out — it is
    // `resolveSessionUser` unable to verify one (offline, a stalled
    // request, a 429/5xx from `/users/me`), and `useConsentSync` reports
    // that the exact same way it reports a real sign-out: `user === null`.
    // Only the absence of a token itself — which a 401 does clear, in
    // `api.ts` — means this device has actually signed out; anything else
    // must leave an attributed decision exactly as it is, pending or not,
    // for the next pass to resolve once the session can be verified again
    // (fix round 1, Review Focus 3 and 5).
    if (marker !== null && (await getToken()) === null) {
      await dropForeignDecision();
    }
    return;
  }
  if (consent === null) {
    return;
  }
  if (marker !== null && marker.userId !== userId) {
    await dropForeignDecision();
    return;
  }
  if (marker !== null && marker.value === consent && marker.pending !== true) {
    return;
  }

  // The keychain may already hold a different token than the one `userId`
  // was verified with: `SessionProvider` does not re-verify the instant a
  // token changes (see `session.ts`'s `getVerifiedToken` comment), so a
  // pass enqueued for the outgoing account can still run after the
  // incoming account's token has already been written. POSTing with
  // whatever token is in the keychain *now* would file this decision under
  // whoever that token belongs to — refuse, and let the next pass, once
  // the session has caught up, reconcile for real (fix round 1, finding 2).
  if ((await getToken()) !== getVerifiedToken()) {
    return;
  }

  await postConsent(userId, consent);
}

let queue: Promise<void> = Promise.resolve();

/**
 * One reconciliation pass, serialised against every other pass through a
 * shared promise chain — not a boolean flag, because `AsyncStorage` is
 * asynchronous: a consent change and a session change can each be mid-`await`
 * at once, and a flag only guards against re-entry within a single
 * synchronous tick (Review Focus 1).
 */
export function reconcileConsent(userId: string | null): Promise<void> {
  const next = queue.then(() => pass(userId));
  queue = next.catch(() => undefined);
  return next;
}

/**
 * Runs a pass on mount, whenever the signed-in user id changes, whenever the
 * device's own consent decision changes, and whenever the app returns to the
 * foreground — there is no page load to retry a failed write on, so the
 * foreground transition is this app's equivalent (Review Focus 5). Does
 * nothing while the session is still resolving, so a guest's brief
 * `loading: true` window before sign-in resolves is not mistaken for "no
 * account".
 */
export function useConsentSync(): void {
  const { loading, user } = useSession();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (loading) {
      return;
    }

    const run = () => {
      reconcileConsent(userId);
    };

    run();
    const unsubscribe = subscribeConsent(run);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        run();
      }
    });

    return () => {
      unsubscribe();
      subscription.remove();
    };
  }, [loading, userId]);
}
