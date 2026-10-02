import {
  type Analytics,
  type AnalyticsTransport,
  type ConsentSource,
  createAnalytics,
} from "./gate";
import type { AnalyticsPlatform, TrackedEvent } from "./schema";

export type { Analytics } from "./gate";

/** The part of `@openpanel/react-native`'s `OpenPanel` the transport uses. */
export interface OpenPanelClient {
  clear: () => void;
  identify: (payload: {
    profileId: string;
    properties: Record<string, unknown>;
  }) => unknown;
  screenView: (path: string, properties?: Record<string, unknown>) => void;
  track: (name: string, properties?: Record<string, unknown>) => unknown;
}

export interface OpenPanelClientOptions {
  apiUrl: string;
  clientId: string;
  clientSecret: string;
  /** Asked by the SDK before every send (the queue flushes on app resume). */
  filter: () => boolean;
}

export type OpenPanelFactory = (
  options: OpenPanelClientOptions
) => Promise<OpenPanelClient>;

/**
 * `@openpanel/react-native` (an optional peer dependency), loaded on first
 * use: the module pulls in `react-native` and Expo modules, so importing
 * this file stays safe in tests and on the web. No `storage` is passed, so
 * no event queue outlives the app process (nothing is kept after a
 * withdraw).
 */
const loadOpenPanel: OpenPanelFactory = async (options) => {
  const { OpenPanel } = await import("@openpanel/react-native");
  return new OpenPanel(options);
};

export interface NativeTransportOptions {
  /** The consent, asked again by the SDK before each send. */
  allow: () => boolean;
  apiUrl: string;
  /** A write-only client: its secret ships in the binary (spec §12). */
  clientId: string | undefined;
  clientSecret: string | undefined;
  /** Tests inject one; `@openpanel/react-native` otherwise. */
  createClient?: OpenPanelFactory;
}

/** The native transport; calls resolve once the SDK has the event. */
export interface NativeTransport extends AnalyticsTransport {
  identify: (userId: string, platform: AnalyticsPlatform) => Promise<void>;
  reset: () => Promise<void>;
  screen: (path: string, platform: AnalyticsPlatform) => Promise<void>;
  track: (event: TrackedEvent) => Promise<void>;
}

/**
 * The OpenPanel client is created on the first consented call, never
 * before (the gate only calls the transport with consent), and cleared on
 * withdraw or sign-out. Without credentials analytics is off, with one
 * warning.
 */
export function createNativeTransport(
  options: NativeTransportOptions
): NativeTransport {
  const { allow, apiUrl, clientId, clientSecret } = options;
  const createClient = options.createClient ?? loadOpenPanel;
  let client: Promise<OpenPanelClient> | undefined;
  let warned = false;

  const get = (): Promise<OpenPanelClient> | undefined => {
    if (!(clientId && clientSecret)) {
      if (!warned) {
        warned = true;
        console.warn(
          "[analytics] EXPO_PUBLIC_OPENPANEL_CLIENT_ID or _SECRET is unset: analytics is off"
        );
      }
      return;
    }
    client ??= createClient({
      apiUrl,
      clientId,
      clientSecret,
      filter: allow,
    }).catch((error: unknown) => {
      client = undefined;
      throw error;
    });
    return client;
  };

  const withClient = async (
    use: (op: OpenPanelClient) => unknown
  ): Promise<void> => {
    const pending = get();
    if (pending) {
      await use(await pending);
    }
  };

  return {
    identify: (userId, platform) =>
      withClient((op) =>
        op.identify({
          profileId: userId,
          properties: { auth_mode: "authenticated", platform },
        })
      ),
    reset: async () => {
      // Nothing to clear when no client was ever created.
      if (client) {
        (await client).clear();
      }
    },
    screen: (path, platform) =>
      withClient((op) => op.screenView(path, { platform })),
    track: (event) =>
      withClient((op) => op.track(event.name, { ...event.properties })),
  };
}

/**
 * The screen path for Expo Router's `useSegments()`: groups (`(tabs)`) are
 * dropped and dynamic segments stay templates (`/lists/[token]`), so share
 * tokens and ids never reach analytics.
 */
export function nativeRouteTemplate(segments: readonly string[]): string {
  const visible = segments.filter(
    (segment) => !(segment.startsWith("(") && segment.endsWith(")"))
  );
  return `/${visible.join("/")}`;
}

export interface NativeAnalyticsOptions
  extends ConsentSource,
    Omit<NativeTransportOptions, "allow"> {}

/** The app's analytics: the consent gate over the OpenPanel client. */
export function createNativeAnalytics(
  options: NativeAnalyticsOptions
): Analytics {
  const { getConsent, subscribe, ...transport } = options;
  const allow = (): boolean => getConsent() === true;
  return createAnalytics({
    getConsent,
    platform: "native",
    subscribe,
    transport: createNativeTransport({ ...transport, allow }),
  });
}
