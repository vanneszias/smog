import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import type { ConfigContext, ExpoConfig } from "expo/config";
import createConfig from "../app.config";

const PROJECT_ID = "9fa68b63-dfa5-498a-9196-5eba93ecac29";

function load(): ExpoConfig {
  const context: ConfigContext = {
    config: {},
    packageJsonPath: null,
    projectRoot: process.cwd(),
    staticConfigPath: null,
  };
  return createConfig(context);
}

describe("app.config", () => {
  const original = process.env.EXPO_PUBLIC_SITE_HOST;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_SITE_HOST = "example.test";
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.EXPO_PUBLIC_SITE_HOST;
    } else {
      process.env.EXPO_PUBLIC_SITE_HOST = original;
    }
  });

  it("keeps the store identity", () => {
    const config = load();
    expect(config.ios?.bundleIdentifier).toBe("be.zias.smog");
    expect(config.android?.package).toBe("be.zias.smog");
    expect(config.scheme).toBe("smog");
    expect(config.extra?.eas?.projectId).toBe(PROJECT_ID);
    expect(config.updates?.url).toBe(`https://u.expo.dev/${PROJECT_ID}`);
  });

  it("bumps the store versions above the old app", () => {
    const config = load();
    expect(config.version).toBe("3.0.0");
    expect(config.ios?.buildNumber).toBe("52");
    expect(config.android?.versionCode).toBe(81);
  });

  it("derives the app links from EXPO_PUBLIC_SITE_HOST", () => {
    const config = load();
    expect(config.ios?.associatedDomains).toContain("applinks:example.test");

    const https = config.android?.intentFilters?.find((filter) =>
      [filter.data ?? []].flat().some((data) => data.scheme === "https")
    );
    expect(https?.autoVerify).toBe(true);
    expect(https?.data).toEqual([
      { host: "example.test", pathPrefix: "/gestures/", scheme: "https" },
      { host: "example.test", pathPrefix: "/lists/", scheme: "https" },
    ]);
  });

  it("falls back to the staging workers.dev host", () => {
    delete process.env.EXPO_PUBLIC_SITE_HOST;
    const config = load();
    expect(config.ios?.associatedDomains).toEqual([
      "applinks:smog-site-staging.workers.dev",
    ]);
  });

  it("registers the permission-stripping plugin", () => {
    const config = load();
    expect(config.plugins).toContain(
      "./plugins/with-screen-capture-permissions.js"
    );
  });
});
