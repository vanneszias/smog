import AsyncStorage from "@react-native-async-storage/async-storage";
import { renderHook } from "@testing-library/react-native";
import * as analytics from "./analytics";
import { loadConsent, resetConsentForTests, setConsent } from "./consent";

const mockTrack = jest.fn();
const mockScreenView = jest.fn();
const mockIdentify = jest.fn();
const mockClear = jest.fn();
const mockConstructed = jest.fn();
/**
 * What the real SDK would put on the wire. `@openpanel/react-native`'s
 * `OpenPanel` remembers the last `screenView` path (`this.lastPath`) and
 * attaches it as `__path` to every later `track` call
 * (`node_modules/@openpanel/react-native/dist/index.js`), so a path sent
 * once as a screen view rides along on every event after it. The mock
 * reproduces exactly that, so a test can inspect the payloads an event
 * would really carry rather than only the arguments this module passed.
 */
const mockWire = jest.fn();

jest.mock("@openpanel/react-native", () => ({
  OpenPanel: jest.fn().mockImplementation((options: unknown) => {
    mockConstructed(options);
    let lastPath = "";
    return {
      clear: mockClear,
      identify: mockIdentify,
      screenView: (path: string, properties?: Record<string, unknown>) => {
        mockScreenView(path, properties);
        lastPath = path;
        mockWire("screen_view", { ...properties, __path: path });
      },
      track: (name: string, properties?: Record<string, unknown>) => {
        mockTrack(name, properties);
        mockWire(name, { ...properties, __path: lastPath });
      },
    };
  }),
}));

/*
 * expo-router, as a route in this app would see it: `useSegments()` gives
 * the route's own file-system pattern, `usePathname()` the concrete URL
 * with each dynamic segment filled in. Both are provided so a screen-view
 * hook that reads the concrete pathname is caught sending it.
 */
let mockSegments: string[] = [];
let mockPathname = "/";
jest.mock("expo-router", () => ({
  usePathname: () => mockPathname,
  useSegments: () => mockSegments,
}));

/** Property names that would tie an event to an account. */
const FORBIDDEN_KEYS = ["user_id", "userId", "profileId", "email"] as const;

const onRoute = (segments: string[], pathname: string): void => {
  mockSegments = segments;
  mockPathname = pathname;
};

const ENV = {
  EXPO_PUBLIC_OPENPANEL_API_URL: "https://analytics.example/api",
  EXPO_PUBLIC_OPENPANEL_CLIENT_ID: "native-id",
  EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET: "native-secret",
};

/*
 * No `jest.isolateModules`: an isolated registry would hand `./analytics` its
 * own copy of the consent store, so `setConsent` below would change a store
 * the module under test never reads. One registry, and an explicit reset of
 * the lazy client, instead.
 *
 * Calls go through the `analytics.` namespace directly (never destructured
 * out of it) so knip's static export-usage check can see each one; a
 * destructured binding — even one destructured off this same import —
 * severs the trace back to the export it came from, and an export nothing
 * visibly imports fails the release-check build (`AGENTS.md`, "Before
 * pushing").
 */
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  resetConsentForTests();
  analytics.resetAnalyticsForTests();
  await loadConsent();
  Object.assign(process.env, ENV);
});

afterEach(() => {
  for (const key of Object.keys(ENV)) {
    delete process.env[key];
  }
});

describe("mobile analytics", () => {
  it("sends nothing, and builds no client, before anyone has answered", () => {
    analytics.trackEvent("gesture_viewed", {
      gesture_id: "1",
      source: "direct",
    });
    expect(mockConstructed).not.toHaveBeenCalled();
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it("sends nothing after a refusal", async () => {
    await setConsent("denied");
    analytics.trackEvent("gesture_viewed", {
      gesture_id: "1",
      source: "direct",
    });
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it("sends an allowed event with platform native", async () => {
    await setConsent("granted");
    analytics.trackEvent("gesture_viewed", {
      gesture_id: "1",
      source: "direct",
    });
    expect(mockTrack).toHaveBeenCalledWith("gesture_viewed", {
      gesture_id: "1",
      platform: "native",
      source: "direct",
    });
  });

  it("uses the native client's credentials, not the web pair", async () => {
    await setConsent("granted");
    analytics.trackEvent("video_playback_completed", { gesture_id: "1" });
    expect(mockConstructed).toHaveBeenCalledWith(
      expect.objectContaining({
        apiUrl: ENV.EXPO_PUBLIC_OPENPANEL_API_URL,
        clientId: ENV.EXPO_PUBLIC_OPENPANEL_CLIENT_ID,
        clientSecret: ENV.EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET,
      })
    );
  });

  it("never identifies anyone, and names no account in any event (Review Focus 4)", async () => {
    await setConsent("granted");
    onRoute(["gestures", "[id]"], "/gestures/1");
    renderHook(() => analytics.useScreenViews());
    analytics.trackEvent("gesture_collection_changed", {
      action: "added",
      collection: "favorites",
      gesture_id: "1",
      source: "gesture_detail",
    });
    analytics.trackEvent("gesture_viewed", {
      gesture_id: "1",
      source: "direct",
    });
    analytics.trackEvent("search_performed", {
      category_count: 0,
      has_results: true,
      query_length: 3,
      result_count: 2,
      source: "submit",
    });
    analytics.trackEvent("video_playback_completed", { gesture_id: "1" });

    expect(mockIdentify).not.toHaveBeenCalled();
    expect(mockConstructed.mock.calls[0][0]).not.toHaveProperty("profileId");
    // Every event type and a screen view really went out, so the loop
    // below cannot pass by having nothing to look at.
    expect(mockTrack).toHaveBeenCalledTimes(4);
    expect(mockScreenView).toHaveBeenCalledTimes(1);
    // One assertion per key: any single one of them present fails the test.
    // (An `arrayContaining` of all four, which this replaced, failed only
    // when every one of them was present at once.)
    for (const [, properties] of [
      ...mockTrack.mock.calls,
      ...mockScreenView.mock.calls,
      ...mockWire.mock.calls,
    ]) {
      for (const key of FORBIDDEN_KEYS) {
        expect(properties ?? {}).not.toHaveProperty(key);
      }
    }
  });

  it("stops sending, and clears the client, the moment consent is withdrawn", async () => {
    await setConsent("granted");
    analytics.trackEvent("video_playback_completed", { gesture_id: "1" });
    await setConsent("denied");
    analytics.trackEvent("video_playback_completed", { gesture_id: "2" });

    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockClear).toHaveBeenCalled();
  });

  it("reuses one client for the app's life across withdraw and re-grant", async () => {
    // Each SDK construction registers an AppState listener it never
    // removes, so a client per grant would leak one per consent flip.
    await setConsent("granted");
    analytics.trackEvent("video_playback_completed", { gesture_id: "1" });
    await setConsent("denied");
    analytics.trackEvent("video_playback_completed", { gesture_id: "2" });
    await setConsent("granted");
    analytics.trackEvent("video_playback_completed", { gesture_id: "3" });

    expect(mockConstructed).toHaveBeenCalledTimes(1);
    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(mockTrack.mock.calls.map(([, properties]) => properties)).toEqual([
      { gesture_id: "1", platform: "native" },
      { gesture_id: "3", platform: "native" },
    ]);
  });

  it("keeps the SDK's own filter closed after a withdrawal", async () => {
    await setConsent("granted");
    analytics.trackEvent("video_playback_completed", { gesture_id: "1" });
    const { filter } = mockConstructed.mock.calls[0][0] as {
      filter: () => boolean;
    };
    expect(filter()).toBe(true);

    await setConsent("denied");
    expect(filter()).toBe(false);
  });

  it("is a silent no-op when the credentials are not configured", async () => {
    // `= undefined` would not do: Node stringifies any assignment to
    // `process.env.*`, so the value would become the *string* "undefined"
    // (truthy) rather than really unsetting it — confirmed by a failing
    // run of this exact test with that "fix" in place.
    // biome-ignore lint/performance/noDelete: only `delete` truly unsets a process.env var; an assignment stringifies to "undefined"
    delete process.env.EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET;
    await setConsent("granted");
    expect(() =>
      analytics.trackEvent("video_playback_completed", { gesture_id: "1" })
    ).not.toThrow();
    expect(mockConstructed).not.toHaveBeenCalled();
  });

  it("sends screen views through the SDK's own screenView", async () => {
    await setConsent("granted");
    onRoute(["(tabs)", "search"], "/search");
    renderHook(() => analytics.useScreenViews());
    expect(mockScreenView).toHaveBeenCalledWith("/search", {
      platform: "native",
    });
  });

  it("sends no screen view before consent is granted", () => {
    onRoute(["(tabs)", "search"], "/search");
    renderHook(() => analytics.useScreenViews());
    expect(mockScreenView).not.toHaveBeenCalled();
  });
});

/**
 * Screen views carry route PATTERNS, never concrete paths (final-review
 * Critical finding, 2026-09-22). A list is owned by one account and the
 * lists tab is signed-in only, so `/lists/<id>` names an account as surely
 * as a user id would — and the SDK then repeats that path as `__path` on
 * every later event. Each dynamic segment is sent as its `[param]` name.
 */
describe("screen views name the route, not the thing on it", () => {
  const DYNAMIC_ROUTES: {
    id: string;
    pathname: string;
    pattern: string;
    segments: string[];
  }[] = [
    {
      id: "list-abc123",
      pathname: "/lists/list-abc123",
      pattern: "/lists/[id]",
      segments: ["(tabs)", "lists", "[id]"],
    },
    {
      id: "gesture-42",
      pathname: "/gestures/gesture-42",
      pattern: "/gestures/[id]",
      segments: ["gestures", "[id]"],
    },
  ];

  it.each(DYNAMIC_ROUTES)("sends $pathname as $pattern", async ({
    pathname,
    pattern,
    segments,
  }) => {
    await setConsent("granted");
    onRoute(segments, pathname);
    renderHook(() => analytics.useScreenViews());
    expect(mockScreenView).toHaveBeenCalledTimes(1);
    expect(mockScreenView).toHaveBeenCalledWith(pattern, {
      platform: "native",
    });
  });

  it.each([
    { pathname: "/", segments: ["(tabs)"] },
    { pathname: "/search", segments: ["(tabs)", "search"] },
    { pathname: "/lists", segments: ["(tabs)", "lists"] },
    {
      pathname: "/settings/account",
      segments: ["(tabs)", "settings", "account"],
    },
    { pathname: "/sign-in", segments: ["(auth)", "sign-in"] },
    { pathname: "/dev/kitchen-sink", segments: ["dev", "kitchen-sink"] },
  ])("sends the static route $pathname unchanged", async ({
    pathname,
    segments,
  }) => {
    await setConsent("granted");
    onRoute(segments, pathname);
    renderHook(() => analytics.useScreenViews());
    expect(mockScreenView).toHaveBeenCalledWith(pathname, {
      platform: "native",
    });
  });

  it("never puts a concrete dynamic id in any screen-view or event payload", async () => {
    await setConsent("granted");
    for (const { id, pathname, pattern, segments } of DYNAMIC_ROUTES) {
      mockWire.mockClear();
      onRoute(segments, pathname);
      const { unmount } = renderHook(() => analytics.useScreenViews());
      // The event list detail really sends after a screen view there: the
      // SDK attaches the last screen-view path to it as `__path`.
      analytics.trackEvent("gesture_collection_changed", {
        action: "removed",
        collection: "list",
        gesture_id: "g-1",
        source: "gesture_list",
      });
      analytics.trackEvent("search_performed", {
        category_count: 0,
        has_results: true,
        query_length: 3,
        result_count: 1,
        source: "submit",
      });
      unmount();

      expect(mockWire).toHaveBeenCalledTimes(3);
      for (const [, properties] of mockWire.mock.calls) {
        expect(properties.__path).toBe(pattern);
        expect(JSON.stringify(properties)).not.toContain(id);
      }
      for (const [path] of mockScreenView.mock.calls) {
        expect(path).not.toContain(id);
      }
    }
  });
});
