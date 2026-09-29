import { afterEach, describe, expect, it } from "@jest/globals";
import { devToolsAvailable } from "./dev-tools";

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
