import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import {
  ANALYTICS_CONSENT_KEY,
  type ConsentState,
  clearConsent,
  isConsentLoaded,
  loadConsent,
  readConsent,
  resetConsentForTests,
  setConsent,
  subscribeConsent,
  useConsent,
} from "./consent";

beforeEach(async () => {
  await AsyncStorage.clear();
  resetConsentForTests();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the consent store", () => {
  it("is undecided, not refused, when nothing is stored", async () => {
    expect(await loadConsent()).toBeNull();
    expect(isConsentLoaded()).toBe(true);
  });

  it("reads back a stored decision", async () => {
    await AsyncStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
    expect(await loadConsent()).toBe("granted");
    const decision: ConsentState = readConsent();
    expect(decision).toBe("granted");
  });

  it("treats a value it did not write as undecided", async () => {
    // The legacy native store wrote "true"/"false" under another key; a
    // garbage value under ours must re-ask, not be guessed at.
    await AsyncStorage.setItem(ANALYTICS_CONSENT_KEY, "true");
    expect(await loadConsent()).toBeNull();
  });

  it("never reads the legacy apps/native key", async () => {
    await AsyncStorage.setItem("@smog_analytics_consent", "true");
    expect(await loadConsent()).toBeNull();
  });

  it("persists a decision and notifies subscribers", async () => {
    await loadConsent();
    const listener = jest.fn();
    const unsubscribe = subscribeConsent(listener);

    await setConsent("denied");

    expect(readConsent()).toBe("denied");
    expect(await AsyncStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe("denied");
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("clears back to undecided", async () => {
    await setConsent("granted");
    await clearConsent();
    expect(readConsent()).toBeNull();
    expect(await AsyncStorage.getItem(ANALYTICS_CONSENT_KEY)).toBeNull();
  });

  it("keeps the decision for this session when storage refuses the write", async () => {
    jest
      .spyOn(AsyncStorage, "setItem")
      .mockRejectedValueOnce(new Error("disk full"));
    jest.spyOn(console, "warn").mockImplementation(() => undefined);

    await setConsent("granted");

    expect(readConsent()).toBe("granted");
  });

  it("reports not-loaded before the first read resolves (Review Focus 2)", async () => {
    await AsyncStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");
    const { result } = renderHook(() => useConsent());

    expect(result.current).toEqual({ consent: null, loaded: false });
    await waitFor(() =>
      expect(result.current).toEqual({ consent: "granted", loaded: true })
    );
  });

  it("re-renders a hook consumer when the decision changes", async () => {
    const { result } = renderHook(() => useConsent());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await setConsent("granted");
    });

    expect(result.current.consent).toBe("granted");
  });

  it("keeps a decision made while the first read is still in flight", async () => {
    await AsyncStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");

    const pending = loadConsent();
    await setConsent("denied");
    await pending;

    expect(readConsent()).toBe("denied");
    expect(await AsyncStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe("denied");
  });

  it("keeps a withdrawal made while the first read is still in flight", async () => {
    await AsyncStorage.setItem(ANALYTICS_CONSENT_KEY, "granted");

    const pending = loadConsent();
    await clearConsent();
    await pending;

    expect(readConsent()).toBeNull();
    expect(await AsyncStorage.getItem(ANALYTICS_CONSENT_KEY)).toBeNull();
  });
});

describe("the flash guard, on a fresh module instance", () => {
  // `resetConsentForTests` deliberately resets `loaded` (and the cached
  // snapshot) before every test above, which means a regression in the
  // module's own initial `let loaded = false` declaration is invisible to
  // them — the reset always overwrites it before any assertion runs. A
  // module nobody has reset yet is the only way to see that declaration's
  // real starting value, so this loads one with `jest.isolateModules`
  // instead of the top-of-file import.
  //
  // This does not render `useConsent` through the fresh instance:
  // `jest.isolateModules` forks the whole require graph it touches,
  // including `react`, so a hook called through that copy runs against a
  // dispatcher the outer `react-test-renderer` (which holds a different
  // `react` instance) never sets — confirmed by a throwaway probe that
  // failed with "Cannot read properties of null (reading
  // 'useSyncExternalStore')" rather than any assertion. `isConsentLoaded`
  // and `readConsent` read the same module-private state `useConsent`'s
  // snapshot is built from, without going through React at all, so they
  // catch the same regression in the initial declaration.
  it("has not loaded before anything has asked it to", () => {
    jest.isolateModules(() => {
      const fresh = require("./consent") as typeof import("./consent");

      expect(fresh.isConsentLoaded()).toBe(false);
      expect(fresh.readConsent()).toBeNull();
    });
  });
});
