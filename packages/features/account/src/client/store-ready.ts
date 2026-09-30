import { useLocalStoreInstance } from "@smog/local-store/react";
import { useEffect, useState } from "react";

/** Whether the store has read its adapter (before that it holds defaults). */
export function useStoreReady(): boolean {
  const store = useLocalStoreInstance();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    store.ready.then(
      () => {
        if (active) {
          setReady(true);
        }
      },
      (error: unknown) => {
        // `ready` is documented never to reject; the data then stays default.
        console.error("[account] Failed to load the local store:", error);
      }
    );
    return () => {
      active = false;
    };
  }, [store]);
  return ready;
}
