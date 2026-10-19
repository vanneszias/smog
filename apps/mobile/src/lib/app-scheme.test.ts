import { describe, expect, it, jest } from "@jest/globals";

const mockConstants: { expoConfig: unknown } = { expoConfig: null };
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: mockConstants,
}));

const { appScheme } = require("./app-scheme") as typeof import("./app-scheme");

describe("appScheme", () => {
  it.each([
    [{ scheme: "smog-staging" }, "smog-staging"],
    [{ scheme: "smog-dev" }, "smog-dev"],
    [{ scheme: ["smog", "other"] }, "smog"],
    [{ scheme: "" }, "smog"],
    [{}, "smog"],
    [null, "smog"],
  ])("reads the scheme of %j as %s", (config, expected) => {
    mockConstants.expoConfig = config;
    expect(appScheme()).toBe(expected);
  });
});
