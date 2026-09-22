import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";

/**
 * The device's analytics-consent decision, as a tri-state.
 *
 * `null` is "never asked", not "refused": the consent row this eventually
 * writes has a boolean column that cannot tell the two apart, which is
 * exactly why the device must. The key and values match `apps/site`'s
 * `lib/consentStore.ts`, so the two apps describe one decision one way.
 *
 * The old app's `@smog_analytics_consent` is deliberately never read: every
 * person is re-asked under the new policy (spec, "Decisions taken
 * 2026-09-22").
 *
 * AsyncStorage is asynchronous, so unlike the web store this one has a
 * fourth state the UI must respect — *not loaded yet* — and `useConsent`
 * reports it separately rather than letting `null` mean both.
 */
export type ConsentState = "granted" | "denied" | null;

export const ANALYTICS_CONSENT_KEY = "smog.consent.analytics";

let current: ConsentState = null;
let loaded = false;
let loading: Promise<ConsentState> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function parse(raw: string | null): ConsentState {
  return raw === "granted" || raw === "denied" ? raw : null;
}

export function loadConsent(): Promise<ConsentState> {
  if (loaded) {
    return Promise.resolve(current);
  }
  if (loading === null) {
    loading = AsyncStorage.getItem(ANALYTICS_CONSENT_KEY)
      .then(parse)
      .catch((error: unknown) => {
        console.warn("[consent] Failed to read the stored decision:", error);
        return null;
      })
      .then((value) => {
        current = value;
        loaded = true;
        loading = null;
        emit();
        return value;
      });
  }
  return loading;
}

export function readConsent(): ConsentState {
  return current;
}

export function isConsentLoaded(): boolean {
  return loaded;
}

export async function setConsent(value: "granted" | "denied"): Promise<void> {
  current = value;
  loaded = true;
  emit();
  try {
    await AsyncStorage.setItem(ANALYTICS_CONSENT_KEY, value);
  } catch (error) {
    console.warn("[consent] Failed to persist the decision:", error);
  }
}

export async function clearConsent(): Promise<void> {
  current = null;
  loaded = true;
  emit();
  try {
    await AsyncStorage.removeItem(ANALYTICS_CONSENT_KEY);
  } catch (error) {
    console.warn("[consent] Failed to clear the decision:", error);
  }
}

export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

interface Snapshot {
  consent: ConsentState;
  loaded: boolean;
}

let snapshot: Snapshot = { consent: current, loaded };

function getSnapshot(): Snapshot {
  if (snapshot.consent !== current || snapshot.loaded !== loaded) {
    snapshot = { consent: current, loaded };
  }
  return snapshot;
}

export function useConsent(): Snapshot {
  const value = useSyncExternalStore(subscribeConsent, getSnapshot);
  useEffect(() => {
    loadConsent();
  }, []);
  return value;
}

/**
 * Tests only: forget the in-memory decision so each test starts cold.
 * Listeners are kept on purpose — `lib/analytics.ts` subscribes once, at
 * import, and must still hear the next withdrawal.
 */
export function resetConsentForTests(): void {
  current = null;
  loaded = false;
  loading = null;
  snapshot = { consent: null, loaded: false };
}
