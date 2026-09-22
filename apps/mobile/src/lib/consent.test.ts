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
});
