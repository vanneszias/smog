import { type GuestData, setPreferences } from "@smog/local-store";
import { useLocalStore, useLocalStoreInstance } from "@smog/local-store/react";
import { useCallback } from "react";

export type Preferences = GuestData["preferences"];

const selectPreferences = (data: GuestData): Preferences => data.preferences;

/**
 * The device's theme and language (local-store, for guests and signed-in
 * users alike: spec §11) and a setter that persists a change.
 */
export function usePreferences(): [
  Preferences,
  (next: Partial<Preferences>) => void,
] {
  const store = useLocalStoreInstance();
  const preferences = useLocalStore(selectPreferences);
  const update = useCallback(
    (next: Partial<Preferences>): void => {
      store.update(setPreferences(next)).catch((error: unknown) => {
        console.error("[preferences] Failed to save:", error);
      });
    },
    [store]
  );
  return [preferences, update];
}
