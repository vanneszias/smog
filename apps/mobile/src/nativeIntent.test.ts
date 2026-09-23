import { readFileSync } from "node:fs";
import { join } from "node:path";
import { redirectSystemPath } from "../app/+native-intent";

const ORIGIN = "https://app.smog.vlaanderen";

const redirect = (path: string, initial = false) =>
  redirectSystemPath({ initial, path });

describe("redirectSystemPath", () => {
  it.each([
    "nl",
    "en",
    "fr",
  ])("opens a /%s/ gesture link on the gesture screen", (locale) => {
    expect(redirect(`${ORIGIN}/${locale}/gestures/12`)).toBe("/gestures/12");
    expect(redirect(`${ORIGIN}/${locale}/gestures/12`, true)).toBe(
      "/gestures/12"
    );
  });

  it.each([
    "nl",
    "en",
    "fr",
  ])("does the same for a bare /%s/ path", (locale) => {
    expect(redirect(`/${locale}/gestures/12`)).toBe("/gestures/12");
  });

  it("keeps the query string and drops a fragment", () => {
    expect(redirect(`${ORIGIN}/nl/gestures/12?ref=qr&x=1`)).toBe(
      "/gestures/12?ref=qr&x=1"
    );
    expect(redirect("/fr/gestures/12?ref=qr#top")).toBe("/gestures/12?ref=qr");
  });

  it("accepts a trailing slash", () => {
    expect(redirect(`${ORIGIN}/en/gestures/12/`)).toBe("/gestures/12");
  });

  it("routes a non-numeric id too, for the screen's own error to handle", () => {
    expect(redirect(`${ORIGIN}/nl/gestures/abc`)).toBe("/gestures/abc");
  });

  it("does not navigate for the Google sign-in return", () => {
    // `openAuthSessionAsync` consumes this URL; routing it as well would put
    // the unmatched-route screen over the sign-in being finished.
    expect(redirect("smogmobile://auth-callback?code=abc123")).toBeNull();
    expect(redirect("smogmobile://auth-callback?code=abc123", true)).toBeNull();
  });

  it.each([
    "/",
    "/gestures/12",
    "/search",
    "smogmobile://gestures/12",
    "smogmobile://settings",
    `${ORIGIN}/nl`,
    `${ORIGIN}/nl/gestures`,
    `${ORIGIN}/nl/favorites`,
    `${ORIGIN}/de/gestures/12`,
    `${ORIGIN}/nl/gestures/12/video`,
    `${ORIGIN}/api/gestures/12`,
    "https://example.com/nl/gestures/12",
    "http://app.smog.vlaanderen/nl/gestures/12",
    "https://app.smog.vlaanderen.example.com/nl/gestures/12",
    "exp://192.168.1.10:8081/--/gestures/12",
  ])("leaves %s untouched", (path) => {
    expect(redirect(path)).toBe(path);
  });
});

interface IntentFilter {
  action: string;
  autoVerify?: boolean;
  category: string[];
  data: { host?: string; pathPrefix?: string; scheme?: string }[];
}

const { expo } = JSON.parse(
  readFileSync(join(__dirname, "..", "app.json"), "utf8")
) as {
  expo: {
    android: { intentFilters: IntentFilter[]; package: string };
    ios: { associatedDomains: string[]; bundleIdentifier: string };
    scheme: string;
  };
};

/**
 * The app's half of the claim; the site's `.well-known` files are the other
 * (`apps/site/src/lib/appLinks.test.ts` checks the two agree). Nothing fails
 * at build time if these are wrong: the links just open in the browser.
 */
describe("app.json's app links", () => {
  it("claims the production host for iOS universal links", () => {
    expect(expo.ios.associatedDomains).toEqual([
      "applinks:app.smog.vlaanderen",
    ]);
  });

  it("claims the gesture pages, and only those, as verified Android links", () => {
    expect(expo.android.intentFilters).toEqual([
      {
        action: "VIEW",
        autoVerify: true,
        category: ["BROWSABLE", "DEFAULT"],
        data: ["nl", "en", "fr"].map((locale) => ({
          host: "app.smog.vlaanderen",
          pathPrefix: `/${locale}/gestures/`,
          scheme: "https",
        })),
      },
    ]);
  });

  it("keeps the store identity and the sign-in scheme", () => {
    expect(expo.scheme).toBe("smogmobile");
    expect(expo.ios.bundleIdentifier).toBe("be.zias.smog");
    expect(expo.android.package).toBe("be.zias.smog");
  });
});
