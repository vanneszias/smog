import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANALYTICS_CONSENT_KEY,
  clearConsent,
  readConsent,
  subscribeConsent,
  writeConsent,
} from "./consentStore";

describe("consentStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /*
   * The three states are asserted against each other rather than one at a time:
   * the bug this guards is `if (consent)`, which collapses `null` and
   * `"denied"` into one branch and reads identically in a diff.
   */
  it("tells undecided, granted and denied apart", () => {
    expect(readConsent()).toBeNull();

    writeConsent("granted");
    expect(readConsent()).toBe("granted");

    writeConsent("denied");
    expect(readConsent()).toBe("denied");

    clearConsent();
    expect(readConsent()).toBeNull();
  });

  it("treats a value it did not write as undecided", () => {
    // An older build, another tab, a hand-edited store. `JSON.parse` would be
    // happy with any of these; this module is not.
    for (const junk of ["true", "false", "1", "", "GRANTED", "{}"]) {
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, junk);
      expect(`${junk} -> ${readConsent()}`).toBe(`${junk} -> null`);
    }
  });

  it("reports undecided rather than throwing when storage is unreadable", () => {
    // Private browsing: the getter itself throws, before any method is called.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const spy = vi
      .spyOn(window, "localStorage", "get")
      .mockImplementation(() => {
        throw new DOMException("denied", "SecurityError");
      });

    expect(readConsent()).toBeNull();
    expect(() => writeConsent("granted")).not.toThrow();

    spy.mockRestore();
    expect(warn).toHaveBeenCalled();
  });

  it("notifies subscribers when this tab writes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeConsent(listener);

    writeConsent("granted");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    writeConsent("denied");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  /*
   * `storage` fires in every OTHER tab, never the one that wrote, so a store
   * that only notifies on its own writes leaves a second tab tracking after a
   * refusal — and nothing in a single-tab test would show it.
   */
  it("notifies subscribers when another tab writes", () => {
    const listener = vi.fn();
    subscribeConsent(listener);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: ANALYTICS_CONSENT_KEY,
        newValue: "denied",
      })
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(readConsent()).toBeNull(); // the event carries the value; the store re-reads
  });

  it("ignores a storage event for an unrelated key", () => {
    const listener = vi.fn();
    subscribeConsent(listener);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "smog.guest.favorites",
        newValue: "[]",
      })
    );

    expect(listener).not.toHaveBeenCalled();
  });
});
