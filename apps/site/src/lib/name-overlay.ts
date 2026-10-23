import { setPreferences } from "@smog/local-store";
import { useLocalStore, useLocalStoreInstance } from "@smog/local-store/react";
import { useCallback, useEffect, useState } from "react";

export interface NameOverlayPreference {
  /** The device store has been read: until then no overlay shows (the saved choice is unknown). */
  loaded: boolean;
  setShown: (shown: boolean) => void;
  /** Whether the viewer wants the gesture name over the video (the default). */
  shown: boolean;
}

/**
 * The viewer's choice to hide the gesture name over the video
 * (`preferences.hideGestureName` in the local store, this device only).
 * Nothing renders from it on the server or before the store is read, so a
 * viewer who hid the name never sees it flash.
 */
export function useNameOverlayPreference(): NameOverlayPreference {
  const store = useLocalStoreInstance();
  const hidden = useLocalStore(
    (data) => data.preferences.hideGestureName === true
  );
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    store.ready
      .then(() => {
        if (active) {
          setLoaded(true);
        }
      })
      .catch((error: unknown) => {
        console.error("[nameOverlay] Failed to load the local store:", error);
        // The saved choice stays unknown, which reads as the default
        // (shown): a failed read must not hide the name for good.
        if (active) {
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [store]);
  const setShown = useCallback(
    (shown: boolean): void => {
      store
        .update(setPreferences({ hideGestureName: !shown }))
        .catch((error: unknown) => {
          console.error("[nameOverlay] Failed to save the choice:", error);
        });
    },
    [store]
  );
  return { loaded, setShown, shown: !hidden };
}
