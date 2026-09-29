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

/**
 * The consent gate (spec §12): every call is a no-op unless consent is
 * `true` right now, so nothing is initialised or sent before Allow or
 * after Withdraw. Withdrawing resets the transport (the identity is
 * cleared). Analytics never breaks a product action: invalid events are
 * dropped and every error is logged with `[analytics]` and swallowed.
 *
 * The identity and the current screen are kept (in memory only) while
 * consent is missing, so a user who signs in first and allows later is
 * identified then, and the screen they allowed on is counted.
 */
export function createAnalytics(options: CreateAnalyticsOptions): Analytics {
  const { platform, transport } = options;
  let userId: string | null = null;
  let identified = false;
  /** The screen on show, sent when consent arrives while it is open. */
  let currentPath: string | null = null;

  const allowed = (): boolean => {
    try {
      return options.getConsent() === true;
    } catch (error) {
      console.error("[analytics] Failed to read the consent:", error);
      return false;
    }
  };
  let wasAllowed = allowed();

  const sendIdentity = (): void => {
    if (userId !== null && !identified) {
      identified = true;
      const id = userId;
      safely("identify", () => transport.identify(id, platform));
    }
  };

  options.subscribe?.(() => {
    const now = allowed();
    if (now === wasAllowed) {
      return;
    }
    wasAllowed = now;
    if (now) {
      sendIdentity();
      if (currentPath !== null) {
        const path = currentPath;
        safely("track a screen", () => transport.screen(path, platform));
      }
    } else {
      identified = false;
      safely("reset", () => transport.reset());
    }
  });

  return {
    identify: (next) => {
      if (userId !== next) {
        userId = next;
        identified = false;
      }
      if (allowed()) {
        sendIdentity();
      }
    },
    reset: () => {
      const had = userId !== null;
      userId = null;
      identified = false;
      if (had && allowed()) {
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
      if (!allowed()) {
        return;
      }
      safely("track a screen", () => transport.screen(path, platform));
    },
    track: (event) => {
      if (!allowed()) {
        return;
      }
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
      safely(`track ${parsed.data.name}`, () => transport.track(tracked));
    },
  };
}
