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

  it.each([
    `${ORIGIN}/nl/gestures`,
    `${ORIGIN}/nl/gestures/`,
    `${ORIGIN}/en/gestures?q=hallo`,
    `${ORIGIN}/fr/gestures/?q=bonjour&page=2`,
    "/nl/gestures?q=hallo",
  ])("opens the gesture list %s on the search tab", (path) => {
    // The search screen reads no parameters, so `q` has nowhere to go.
    expect(redirect(path)).toBe("/search");
  });

  it.each([
    `${ORIGIN}/nl/gestures/12/video`,
    `${ORIGIN}/en/gestures/12/extra/deep?x=1`,
    "/fr/gestures/a/b",
  ])("sends %s, which the app has no screen for, home", (path) => {
    expect(redirect(path)).toBe("/");
  });

  it.each([
    ".",
    "..",
    "%2E",
    "%2E%2E",
    "%2e.",
  ])("sends the dot-segment id %s home rather than to the gesture screen", (id) => {
    expect(redirect(`${ORIGIN}/nl/gestures/${id}`)).toBe("/");
    expect(redirect(`${ORIGIN}/nl/gestures/${id}?x=1`)).toBe("/");
  });

  it("does not throw on a malformed escape in the id", () => {
    expect(redirect(`${ORIGIN}/nl/gestures/%E0%A4%A`)).toBe(
      "/gestures/%E0%A4%A"
    );
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
    `${ORIGIN}/nl/gesturesx/12`,
    `${ORIGIN}/nl/favorites`,
    `${ORIGIN}/de/gestures/12`,
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
