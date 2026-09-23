// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "./locale";

const SITE = join(__dirname, "..", "..");
const PUBLIC = join(SITE, "public");

const read = (path: string): string => readFileSync(join(PUBLIC, path), "utf8");

const APP_ID = "96XKP6MU2A.be.zias.smog";
const PACKAGE = "be.zias.smog";
/** The Play app signing key for `be.zias.smog`, which does not change. */
const FINGERPRINT =
  "23:4A:F1:75:8A:A7:4E:68:6B:D0:C0:9B:DA:E0:7F:ED:3F:64:C8:4E:D5:BD:EE:4A:AF:E6:EE:27:73:60:B1:C5";

/** Gesture pages, and nothing else, in every locale the site serves. */
const CLAIMED = LOCALES.map((locale) => `/${locale}/gestures/*`);

interface Aasa {
  applinks: {
    details: { appIDs: string[]; components: { "/": string }[] }[];
  };
}

interface AssetLink {
  relation: string[];
  target: {
    namespace: string;
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
}

/**
 * `public/_headers` as the platform reads it: a path line, then its indented
 * `Name: value` lines. Comments and blank lines separate rules.
 */
function headerRules(): Map<string, Record<string, string>> {
  const rules = new Map<string, Record<string, string>>();
  let current: Record<string, string> | undefined;

  for (const line of read("_headers").split("\n")) {
    if (line.trim() === "" || line.startsWith("#")) {
      current = undefined;
    } else if (/^\s/.test(line)) {
      const [name, ...value] = line.trim().split(":");
      if (current && name) {
        current[name.trim()] = value.join(":").trim();
      }
    } else {
      current = {};
      rules.set(line.trim(), current);
    }
  }

  return rules;
}

/**
 * The files iOS and Android fetch to decide whether this domain's links open
 * the app. A wrong value in either fails silently on a phone — the link just
 * opens in the browser — so every value is pinned here.
 */
describe("the app-link verification files", () => {
  it("claims exactly the gesture pages for the iOS app", () => {
    const aasa = JSON.parse(
      read(".well-known/apple-app-site-association")
    ) as Aasa;

    expect(aasa.applinks.details).toHaveLength(1);
    expect(aasa.applinks.details[0]?.appIDs).toEqual([APP_ID]);
    expect(
      aasa.applinks.details[0]?.components.map((component) => component["/"])
    ).toEqual(CLAIMED);
  });

  it("names the Android package and its signing key", () => {
    const links = JSON.parse(
      read(".well-known/assetlinks.json")
    ) as AssetLink[];

    expect(links).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: PACKAGE,
          sha256_cert_fingerprints: [FINGERPRINT],
        },
      },
    ]);
  });

  it.each([
    "/.well-known/apple-app-site-association",
    "/.well-known/assetlinks.json",
  ])("serves %s as JSON", (path) => {
    expect(headerRules().get(path)).toEqual({
      "Content-Type": "application/json",
    });
  });

  it("keeps the static-asset cache rules alongside them", () => {
    const rules = headerRules();

    expect(rules.get("/_next/static/*")).toEqual({
      "Cache-Control": "public,max-age=31536000,immutable",
    });
    expect(rules.get("/brand/*")).toEqual({
      "Cache-Control": "public,max-age=86400",
    });
  });

  /*
   * The other half lives in `apps/mobile/app.json`. The two can only work
   * together, and each would pass its own tests while disagreeing with the
   * other, so the app's claim is read from here too.
   */
  it("matches what the mobile app claims", () => {
    const { expo } = JSON.parse(
      readFileSync(join(SITE, "..", "mobile", "app.json"), "utf8")
    ) as {
      expo: {
        android: {
          intentFilters: {
            data: { host: string; pathPrefix: string; scheme: string }[];
          }[];
          package: string;
        };
        ios: { associatedDomains: string[]; bundleIdentifier: string };
      };
    };

    expect(expo.ios.associatedDomains).toEqual([
      "applinks:app.smog.vlaanderen",
    ]);
    expect(APP_ID.endsWith(`.${expo.ios.bundleIdentifier}`)).toBe(true);
    expect(expo.android.package).toBe(PACKAGE);
    expect(
      expo.android.intentFilters.flatMap((filter) =>
        filter.data.map(
          ({ host, pathPrefix, scheme }) => `${scheme}://${host}${pathPrefix}*`
        )
      )
    ).toEqual(CLAIMED.map((path) => `https://app.smog.vlaanderen${path}`));
  });
});
