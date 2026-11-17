import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * Set on this device once a gesture video has played (its near-end cue).
 * Device UI state, like the course counter: never synced, never exported,
 * and it holds no choice (the consent itself is stored as before).
 */
export const GESTURE_WATCHED_KEY = "smog:gesture-watched:v1";

interface ConsentMoment {
  /** Records that a gesture video was watched (idempotent). */
  markGestureWatched: () => void;
  /** A gesture video has been watched on this device: the prompt may show. */
  reached: boolean;
}

const ConsentMomentContext = createContext<ConsentMoment>({
  markGestureWatched: () => undefined,
  reached: false,
});

/**
 * When the app may ask for statistics consent: not on the first launch,
 * before the person has seen anything, but once they have watched their
 * first gesture video (docs/DECISIONS.md, "The app asks for statistics after
 * the first gesture"). Nothing is sent before a decision either way.
 */
export function ConsentMomentProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const [reached, setReached] = useState(false);
  const marked = useRef(false);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(GESTURE_WATCHED_KEY)
      .then((stored) => {
        if (live && stored === "1") {
          marked.current = true;
          setReached(true);
        }
      })
      .catch((error: unknown) => {
        console.error("[consent] Failed to read the watched mark:", error);
      });
    return () => {
      live = false;
    };
  }, []);
  const markGestureWatched = useCallback(() => {
    if (marked.current) {
      return;
    }
    marked.current = true;
    setReached(true);
    AsyncStorage.setItem(GESTURE_WATCHED_KEY, "1").catch((error: unknown) => {
      console.error("[consent] Failed to save the watched mark:", error);
    });
  }, []);
  const value = useMemo(
    () => ({ markGestureWatched, reached }),
    [markGestureWatched, reached]
  );
  return (
    <ConsentMomentContext.Provider value={value}>
      {children}
    </ConsentMomentContext.Provider>
  );
}

/** The consent moment: whether it is reached, and how to reach it. */
export function useConsentMoment(): ConsentMoment {
  return useContext(ConsentMomentContext);
}
