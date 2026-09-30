import {
  type AnalyticsEvent,
  type AnalyticsPlatform,
  analyticsEventSchema,
  type TrackedEvent,
} from "./schema";

/**
 * Where consented events go: the web relay or the native OpenPanel client.
 * A transport may be async; the gate never waits for it.
 */
export interface AnalyticsTransport {
  identify: (userId: string, platform: AnalyticsPlatform) => unknown;
  /** Forgets the identity (and, natively, the device's OpenPanel ids). */
  reset: () => unknown;
  screen: (path: string, platform: AnalyticsPlatform) => unknown;
  track: (event: TrackedEvent) => unknown;
}

/** The consent decision: `true` only when the person chose Allow. */
export interface ConsentSource {
  getConsent: () => boolean | null;
  /** Calls `onChange` after every consent change; returns the unsubscribe. */
  subscribe?: (onChange: () => void) => () => void;
}

export interface Analytics {
  /** Signed in: the user id only (no email or name, spec §12). */
  identify: (userId: string) => void;
  /** Whether consent is `true` right now (nothing else may touch the device before). */
  isAllowed: () => boolean;
  /** Signed out: forget the identity. */
  reset: () => void;
  /** A route template (`/lists/$token`), never the filled-in path. */
  screen: (path: string) => void;
  track: (event: AnalyticsEvent) => void;
}

export interface CreateAnalyticsOptions extends ConsentSource {
  platform: AnalyticsPlatform;
  transport: AnalyticsTransport;
}

/** An `Analytics` that never sends anything (no provider, tests). */
export const NOOP_ANALYTICS: Analytics = {
  identify: () => undefined,
  isAllowed: () => false,
  reset: () => undefined,
  screen: () => undefined,
  track: () => undefined,
};

/** Runs a transport call; a throw or a rejection is logged, never raised. */
function safely(action: string, call: () => unknown): void {
  const fail = (error: unknown): void => {
    console.error(`[analytics] Failed to ${action}:`, error);
  };
  try {
    const result = call();
    if (result instanceof Promise) {
      result.catch(fail);
    }
  } catch (error) {
    fail(error);
  }
}

/** The consent right now; a throwing reader counts as `false`. */
function readConsent(getConsent: () => boolean | null): boolean | null {
  try {
    return getConsent();
  } catch (error) {
    console.error("[analytics] Failed to read the consent:", error);
    return false;
  }
}

/**
 * The consent gate (spec §12): every call is a no-op unless consent is
 * `true` right now, so nothing is initialised or sent before Allow or
 * after Withdraw. Analytics never breaks a product action: invalid events
 * are dropped and every error is logged with `[analytics]` and swallowed.
 *
 * - `false` (refused, withdrawn) closes the gate: the transport is reset
 *   (the identity cleared) and nothing is held.
 * - `null` (undecided, or `useConsent` still loading, which happens on
 *   every sign-in) only pauses: nothing is sent, nothing is reset. The
 *   identity, the current screen and one `sign_in_completed` are kept in
 *   memory. On `true` the gate sends what the transport does not have yet
 *   (never a second identify or screen view of the same screen); on
 *   `false` they are dropped.
 */
export function createAnalytics(options: CreateAnalyticsOptions): Analytics {
  const { platform, transport } = options;
  let userId: string | null = null;
  /** The transport holds `userId` (sent while allowed, not reset since). */
  let identified = false;
  /** The screen on show, and the last one the transport got. */
  let currentPath: string | null = null;
  let sentPath: string | null = null;
  /** The transport was used since the last close (it may hold ids). */
  let touched = false;
  /** A sign-in that happened while the consent was loading. */
  let heldSignIn: AnalyticsEvent | null = null;

  const consent = (): boolean | null => readConsent(options.getConsent);
  const allowed = (): boolean => consent() === true;
  let previous = consent();

  const sendIdentity = (): void => {
    if (userId !== null && !identified) {
      identified = true;
      touched = true;
      const id = userId;
      safely("identify", () => transport.identify(id, platform));
    }
  };

  const sendScreen = (path: string): void => {
    sentPath = path;
    touched = true;
    safely("track a screen", () => transport.screen(path, platform));
  };

  const sendEvent = (event: AnalyticsEvent): void => {
    const parsed = analyticsEventSchema.safeParse(event);
    if (!parsed.success) {
      console.error(
        `[analytics] Dropped an invalid ${String(event.name)} event:`,
        parsed.error.issues
      );
      return;
    }
    const tracked = {
      ...parsed.data,
      properties: { ...parsed.data.properties, platform },
    } as TrackedEvent;
    touched = true;
    safely(`track ${parsed.data.name}`, () => transport.track(tracked));
  };

  const close = (): void => {
    heldSignIn = null;
    sentPath = null;
    identified = false;
    if (touched) {
      touched = false;
      safely("reset", () => transport.reset());
    }
  };

  options.subscribe?.(() => {
    const now = consent();
    if (now === previous) {
      return;
    }
    previous = now;
    if (now === true) {
      sendIdentity();
      if (currentPath !== null && currentPath !== sentPath) {
        sendScreen(currentPath);
      }
      if (heldSignIn) {
        const held = heldSignIn;
        heldSignIn = null;
        sendEvent(held);
      }
    } else if (now === false) {
      close();
    }
  });

  return {
    identify: (next) => {
      if (userId !== next) {
        if (identified) {
          // Another user: the transport must not keep the previous one.
          identified = false;
          safely("reset", () => transport.reset());
        }
        userId = next;
      }
      if (allowed()) {
        sendIdentity();
      }
    },
    isAllowed: allowed,
    reset: () => {
      userId = null;
      heldSignIn = null;
      if (identified) {
        identified = false;
        safely("reset", () => transport.reset());
      }
    },
    screen: (path) => {
      const parsed = analyticsEventSchema.safeParse({
        name: "screen_view",
        properties: { path },
      });
      if (!parsed.success) {
        console.error("[analytics] Dropped an invalid screen path");
        return;
      }
      currentPath = path;
      if (allowed()) {
        sendScreen(path);
      }
    },
    track: (event) => {
      const now = consent();
      if (now === true) {
        sendEvent(event);
      } else if (now === null && event.name === "sign_in_completed") {
        heldSignIn = event;
      }
    },
  };
}
