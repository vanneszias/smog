import AsyncStorage from "@react-native-async-storage/async-storage";
import * as analytics from "./analytics";
import { loadConsent, resetConsentForTests, setConsent } from "./consent";

const mockTrack = jest.fn();
const mockScreenView = jest.fn();
const mockIdentify = jest.fn();
const mockClear = jest.fn();
const mockConstructed = jest.fn();

jest.mock("@openpanel/react-native", () => ({
  OpenPanel: jest.fn().mockImplementation((options: unknown) => {
    mockConstructed(options);
    return {
      clear: mockClear,
      identify: mockIdentify,
      screenView: mockScreenView,
      track: mockTrack,
    };
  }),
}));

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
    analytics.trackEvent("search_performed", {
      category_count: 0,
      has_results: true,
      query_length: 3,
      result_count: 2,
      source: "submit",
    });
    analytics.trackScreenView("/gestures/1");

    expect(mockIdentify).not.toHaveBeenCalled();
    expect(mockConstructed.mock.calls[0][0]).not.toHaveProperty("profileId");
    for (const [, properties] of [
      ...mockTrack.mock.calls,
      ...mockScreenView.mock.calls,
    ]) {
      expect(Object.keys(properties ?? {})).not.toEqual(
        expect.arrayContaining(["user_id", "userId", "profileId", "email"])
      );
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
    analytics.trackScreenView("/search");
    expect(mockScreenView).toHaveBeenCalledWith("/search", {
      platform: "native",
    });
  });
});
