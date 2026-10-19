import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { APP_MAGIC_LINK_PATH } from "@smog/auth/react";
import { PRODUCTION_LAUNCH_ORIGIN } from "@smog/config/constants";
import { parseMobileEnv } from "@smog/config/env/mobile";
import { tokens } from "@smog/styles/tokens";
import type { ConfigContext, ExpoConfig } from "expo/config";
import createConfig from "../app.config";
import easJson from "../eas.json";
import { devToolsAvailable } from "./lib/dev-tools";

const PROJECT_ID = "9fa68b63-dfa5-498a-9196-5eba93ecac29";

interface EasProfile {
  autoIncrement?: boolean;
  channel?: string;
  developmentClient?: boolean;
  distribution?: string;
  env: Record<string, string>;
  environment?: string;
}

const eas = easJson as {
  build: Record<string, EasProfile | undefined>;
  cli: { appVersionSource?: string; version?: string };
  submit: Record<string, unknown>;
};

function profile(name: string): EasProfile {
  const found = eas.build[name];
  if (!found) {
    throw new Error(`eas.json has no build.${name}`);
  }
  return found;
}

/** The https hosts of the verified (autoVerify) Android intent filter. */
function verifiedHosts(config: ExpoConfig): string[] {
  const https = config.android?.intentFilters?.find(
    (filter) => filter.autoVerify === true
  );
  return [https?.data ?? []].flat().map((data) => data.host ?? "");
}

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

  it("leaves the build numbers to EAS (remote app versions)", () => {
    const config = load();
    expect(config.version).toBe("3.0.0");
    // EAS cannot write an autoIncrement into a dynamic app.config.ts; the
    // owner seeds the remote counters at the stores' last values, iOS 51 /
    // Android 80, so the first build is 52 / 81 (ruling 3).
    expect(config.ios?.buildNumber).toBeUndefined();
    expect(config.android?.versionCode).toBeUndefined();
    expect(eas.cli.appVersionSource).toBe("remote");
    expect(eas.build.production?.autoIncrement).toBe(true);
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
      // The app's magic link (an exact path; the token is its query),
      // the same path the server mails (`@smog/auth`).
      { host: "example.test", path: APP_MAGIC_LINK_PATH, scheme: "https" },
    ]);
  });

  it("falls back to the staging workers.dev host", () => {
    delete process.env.EXPO_PUBLIC_SITE_HOST;
    const config = load();
    expect(config.ios?.associatedDomains).toEqual([
      "applinks:smog-site-staging.zias.workers.dev",
    ]);
  });

  it("uses the generated brand assets on the brand green", () => {
    const config = load();
    expect(config.icon).toBe("./assets/icon.png");
    expect(config.ios?.icon).toBe("./assets/smog.icon");
    expect(config.android?.adaptiveIcon).toEqual({
      backgroundColor: tokens.color.brand.green,
      foregroundImage: "./assets/android-icon-foreground.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    });
    const splash = config.plugins?.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === "expo-splash-screen"
    );
    expect(splash?.[1]).toMatchObject({
      backgroundColor: tokens.color.brand.green,
      image: "./assets/splash-icon.png",
    });
    for (const asset of [
      "icon.png",
      "smog.icon/icon.json",
      "android-icon-foreground.png",
      "android-icon-monochrome.png",
      "splash-icon.png",
    ]) {
      expect(existsSync(join(process.cwd(), "assets", asset))).toBe(true);
    }
  });

  it("registers the permission-stripping plugin", () => {
    const config = load();
    expect(config.plugins).toContain(
      "./plugins/with-screen-capture-permissions.js"
    );
  });

  it("enables Sign in with Apple on iOS", () => {
    const config = load();
    expect(config.plugins).toContain("expo-apple-authentication");
    expect(config.ios?.usesAppleSignIn).toBe(true);
  });
});

/** Each EAS profile, resolved the way its build resolves it (ruling 3). */
describe("eas.json profiles", () => {
  const KEYS = [
    "EXPO_PUBLIC_API_URL",
    "EXPO_PUBLIC_ENVIRONMENT",
    "EXPO_PUBLIC_SITE_HOST",
  ] as const;
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  const MATRIX = [
    {
      api: "http://localhost:5173",
      channel: "development",
      devTools: true,
      environment: "development",
      host: "localhost",
      name: "development",
      runtime: "dev",
    },
    {
      api: "https://smog-site-staging.zias.workers.dev",
      channel: "staging",
      devTools: true,
      environment: "preview",
      host: "smog-site-staging.zias.workers.dev",
      name: "staging",
      runtime: "staging",
    },
    {
      api: PRODUCTION_LAUNCH_ORIGIN,
      channel: "production",
      devTools: false,
      environment: "production",
      host: new URL(PRODUCTION_LAUNCH_ORIGIN).hostname,
      name: "production",
      runtime: "production",
    },
  ] as const;

  it("has exactly the development, staging and production profiles", () => {
    expect(Object.keys(eas.build).sort()).toEqual([
      "development",
      "production",
      "staging",
    ]);
  });

  it.each(MATRIX)("$name builds for its origin", (row) => {
    const { env, ...rest } = profile(row.name);
    expect(rest.channel).toBe(row.channel);
    expect(rest.environment).toBe(row.environment);
    // Only the reviewed public origin keys; the OpenPanel pair lives in the
    // EAS environment variables, never in git.
    expect(Object.keys(env).sort()).toEqual([...KEYS]);
    expect(env).toEqual({
      EXPO_PUBLIC_API_URL: row.api,
      EXPO_PUBLIC_ENVIRONMENT: row.runtime,
      EXPO_PUBLIC_SITE_HOST: row.host,
    });

    const parsed = parseMobileEnv(env);
    expect(parsed.EXPO_PUBLIC_API_URL).toBe(row.api);
    expect(parsed.EXPO_PUBLIC_SITE_HOST).toBe(row.host);

    Object.assign(process.env, env);
    const config = load();
    expect(config.ios?.associatedDomains).toEqual([`applinks:${row.host}`]);
    const hosts = verifiedHosts(config);
    expect(hosts.length).toBeGreaterThan(0);
    expect(new Set(hosts)).toEqual(new Set([row.host]));
    expect(devToolsAvailable()).toBe(row.devTools);
  });

  it("builds the store app with remote, auto-incremented versions", () => {
    const production = profile("production");
    expect(production.distribution).toBe("store");
    expect(production.autoIncrement).toBe(true);
    // A dev client never reaches the store.
    expect(production.developmentClient).not.toBe(true);
    expect(profile("staging").developmentClient).not.toBe(true);
    expect(profile("development").developmentClient).toBe(true);
    expect(profile("development").distribution).toBe("internal");
    expect(profile("staging").distribution).toBe("internal");
  });

  it("fills the production submit profile without a key file", () => {
    expect(eas.submit.production).toEqual({
      android: { releaseStatus: "draft", track: "internal" },
      ios: { appleTeamId: "96XKP6MU2A", ascAppId: "6758547774" },
    });
    expect(eas.cli.version).toBe(">= 24.10.0");
  });
});
