import {
  createContext,
  type ReactNode,
  useContext,
  useRef,
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

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null ||
    Array.isArray(a) !== Array.isArray(b)
  ) {
    return false;
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((k) => Object.is(left[k], right[k]))
  );
}

/**
 * Subscribes to a slice of the guest data. The result is memoised per
 * snapshot and shallow-compared, so a selector may build a new array or
 * object without causing extra renders. Server renders and hydration use the defaults, so markup
 * always matches. Create the store once per client, never at module scope on
 * the server.
 */
export function useLocalStore<T>(selector: (data: GuestData) => T): T {
  const store = useLocalStoreInstance();
  const cache = useRef<{
    selector: (data: GuestData) => T;
    snapshot: GuestData;
    value: T;
  } | null>(null);
  const read = (snapshot: GuestData): T => {
    const cached = cache.current;
    if (
      cached &&
      cached.snapshot === snapshot &&
      cached.selector === selector
    ) {
      return cached.value;
    }
    const computed = selector(snapshot);
    // Reuse the previous value when it is shallow-equal, so a selector that
    // builds a fresh array or object does not loop.
    const value =
      cached && shallowEqual(cached.value, computed) ? cached.value : computed;
    cache.current = { selector, snapshot, value };
    return value;
  };
  return useSyncExternalStore(
    store.subscribe,
    () => read(store.getSnapshot()),
    () => read(SERVER_SNAPSHOT)
  );
}
