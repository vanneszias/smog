import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import type { ConfigContext, ExpoConfig } from "expo/config";
import createConfig from "../../../../../apps/mobile/app.config";

function load(): ExpoConfig {
  const context: ConfigContext = {
    config: {},
    packageJsonPath: null,
    projectRoot: process.cwd(),
    staticConfigPath: null,
  };
  return createConfig(context);
}

/**
 * The store app's identity, pinned whole (phase 9 ruling 9): the snapshot was
 * written from the config as it was before `APP_VARIANT` existed, so an unset
 * or `production` variant must still produce it byte for byte.
 */
describe("the production config", () => {
  const savedHost = process.env.EXPO_PUBLIC_SITE_HOST;
  const savedVariant = process.env.APP_VARIANT;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_SITE_HOST = "example.test";
    delete process.env.APP_VARIANT;
  });

  afterEach(() => {
    for (const [key, value] of [
      ["EXPO_PUBLIC_SITE_HOST", savedHost],
      ["APP_VARIANT", savedVariant],
    ] as const) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("matches the snapshot with no variant", () => {
    expect(load()).toMatchSnapshot();
  });

  it("is identical with APP_VARIANT=production and with an empty one", () => {
    const unset = load();
    process.env.APP_VARIANT = "production";
    expect(load()).toEqual(unset);
    process.env.APP_VARIANT = "";
    expect(load()).toEqual(unset);
  });
});
