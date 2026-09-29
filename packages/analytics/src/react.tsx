import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react";
import { type Analytics, NOOP_ANALYTICS } from "./gate";
import { SIGN_IN_METHODS, type SignInMethod } from "./schema";

export type { Analytics } from "./gate";

const AnalyticsContext = createContext<Analytics>(NOOP_ANALYTICS);

/** Provides the app's analytics (`createWebAnalytics` / `createNativeAnalytics`). */
export function AnalyticsProvider({
  analytics,
  children,
}: {
  analytics: Analytics;
  children: ReactNode;
}): ReactElement {
  return (
    <AnalyticsContext.Provider value={analytics}>
      {children}
    </AnalyticsContext.Provider>
  );
}

/**
 * The app's analytics, or a no-op without a provider (feature tests). The
 * consent gate lives inside it, so callers just call `track`.
 */
export function useAnalytics(): Analytics {
  return useContext(AnalyticsContext);
}

/**
 * Sends a `screen_view` for every change of `path`, the route template
 * (`/lists/$token` on the web, `/lists/[token]` in Expo Router), so share
 * tokens and ids never reach analytics. `null` while the router has none.
 */
export function useScreenTracking(path: string | null): void {
  const analytics = useAnalytics();
  useEffect(() => {
    if (path !== null) {
      analytics.screen(path);
    }
  }, [analytics, path]);
}

/** Identifies the signed-in user by id (spec §12), and resets on sign-out. */
export function useAnalyticsIdentity(userId: string | null): void {
  const analytics = useAnalytics();
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (userId !== null) {
      analytics.identify(userId);
    } else if (previous.current !== null) {
      analytics.reset();
    }
    previous.current = userId;
  }, [analytics, userId]);
}

const SIGN_IN_KEY = "smog:analytics:sign-in";
/** An older mark is from an abandoned attempt, not this sign-in. */
const SIGN_IN_MARK_TTL_MS = 15 * 60 * 1000;

interface SignInMark {
  at: number;
  method: SignInMethod;
}

let pendingSignIn: SignInMark | null = null;

function sessionStore(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    // Access itself can throw (blocked site data).
    return undefined;
  }
}

function readStoredMark(): SignInMark | null {
  try {
    const raw = sessionStore()?.getItem(SIGN_IN_KEY);
    if (!raw) {
      return null;
    }
    const mark = JSON.parse(raw) as Partial<SignInMark>;
    return typeof mark.at === "number" &&
      (SIGN_IN_METHODS as readonly unknown[]).includes(mark.method)
      ? (mark as SignInMark)
      : null;
  } catch {
    return null;
  }
}

/**
 * Remembers the method a sign-in started with (the auth screens call it on
 * the method choice). `sessionStorage` carries it over a full-page redirect
 * (Google, Apple, a magic link in the same tab); natively memory does.
 */
export function markSignInStarted(method: SignInMethod): void {
  pendingSignIn = { at: Date.now(), method };
  try {
    sessionStore()?.setItem(SIGN_IN_KEY, JSON.stringify(pendingSignIn));
  } catch {
    // Blocked storage: the memory mark still covers in-page sign-ins.
  }
}

function takeSignInMark(): SignInMethod | null {
  const mark = pendingSignIn ?? readStoredMark();
  pendingSignIn = null;
  try {
    sessionStore()?.removeItem(SIGN_IN_KEY);
  } catch {
    // Nothing to clean up.
  }
  return mark && Date.now() - mark.at < SIGN_IN_MARK_TTL_MS
    ? mark.method
    : null;
}

/**
 * Tracks `sign_in_completed { method }` when a user id appears after
 * `markSignInStarted`. A session that was already there (no mark) tracks
 * nothing.
 */
export function useSignInCompleted(userId: string | null): void {
  const analytics = useAnalytics();
  useEffect(() => {
    if (userId === null) {
      return;
    }
    const method = takeSignInMark();
    if (method) {
      analytics.track({ name: "sign_in_completed", properties: { method } });
    }
  }, [analytics, userId]);
}
