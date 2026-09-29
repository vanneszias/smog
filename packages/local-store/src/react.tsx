import {
  createContext,
  type ReactNode,
  useContext,
  useSyncExternalStore,
} from "react";
import { defaultGuestData, type GuestData } from "./schema";
import type { LocalStore } from "./store";

const LocalStoreContext = createContext<LocalStore | null>(null);

/** Defaults for server rendering and the first client render (hydration). */
const SERVER_SNAPSHOT: GuestData = defaultGuestData();

export function LocalStoreProvider({
  store,
  children,
}: {
  store: LocalStore;
  children: ReactNode;
}) {
  return (
    <LocalStoreContext.Provider value={store}>
      {children}
    </LocalStoreContext.Provider>
  );
}

export function useLocalStoreInstance(): LocalStore {
  const store = useContext(LocalStoreContext);
  if (!store) {
    throw new Error("[localStore] useLocalStore needs a LocalStoreProvider");
  }
  return store;
}

/**
 * Subscribes to a slice of the guest data. The selector must return a stable
 * value (a field of the snapshot or a primitive), not a new object per call.
 * Server renders and hydration use the defaults, so markup always matches.
 */
export function useLocalStore<T>(selector: (data: GuestData) => T): T {
  const store = useLocalStoreInstance();
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getSnapshot()),
    () => selector(SERVER_SNAPSHOT)
  );
}
