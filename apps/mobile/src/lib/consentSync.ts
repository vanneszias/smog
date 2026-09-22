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
import { useSession } from "@/lib/session";

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
 */
export const CONSENT_SYNCED_KEY = "smog.consent.synced";

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

  try {
    await payloadFetch("/consent", {
      auth: true,
      body: JSON.stringify({ analyticsConsent: value === "granted" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  } catch (error) {
    console.error("[consentSync] Failed to record consent:", error);
    return;
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
    if (marker !== null) {
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
