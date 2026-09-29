import { afterEach, describe, expect, it } from "@jest/globals";
import {
  createDevToolsUnlock,
  DEV_TOOLS_TAPS,
  devToolsAvailable,
} from "./dev-tools";

describe("devToolsAvailable", () => {
  const original = process.env.EXPO_PUBLIC_ENVIRONMENT;
  afterEach(() => {
    process.env.EXPO_PUBLIC_ENVIRONMENT = original;
  });

  it("is on in dev and staging builds", () => {
    process.env.EXPO_PUBLIC_ENVIRONMENT = "dev";
    expect(devToolsAvailable()).toBe(true);
    process.env.EXPO_PUBLIC_ENVIRONMENT = "staging";
    expect(devToolsAvailable()).toBe(true);
  });

  it("is off in production builds", () => {
    process.env.EXPO_PUBLIC_ENVIRONMENT = "production";
    expect(devToolsAvailable()).toBe(false);
  });
});

describe("createDevToolsUnlock", () => {
  it("unlocks after five taps and counts down before that", () => {
    const unlock = createDevToolsUnlock(true);
    expect(DEV_TOOLS_TAPS).toBe(5);
    expect([1, 2, 3, 4].map(() => unlock.tap())).toEqual([4, 3, 2, 1]);
    expect(unlock.isUnlocked()).toBe(false);
    expect(unlock.tap()).toBe(0);
    expect(unlock.isUnlocked()).toBe(true);
    // Further taps keep it unlocked.
    expect(unlock.tap()).toBe(0);
  });

  it("never unlocks in a production build", () => {
    const unlock = createDevToolsUnlock(false);
    for (let tap = 0; tap < 10; tap += 1) {
      unlock.tap();
    }
    expect(unlock.isUnlocked()).toBe(false);
  });

  it("tells subscribers when it unlocks", () => {
    const unlock = createDevToolsUnlock(true);
    let calls = 0;
    const stop = unlock.subscribe(() => {
      calls += 1;
    });
    for (let tap = 0; tap < DEV_TOOLS_TAPS; tap += 1) {
      unlock.tap();
    }
    stop();
    expect(calls).toBe(1);
  });
});
