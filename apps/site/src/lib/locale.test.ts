import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALES,
  localeAlternates,
  localeHref,
  resolveLocale,
} from "./locale";

describe("locale", () => {
  it("publishes exactly the three locales the Payload config declares", () => {
    expect(LOCALES).toEqual(["nl", "en", "fr"]);
  });

  it("defaults to Dutch, which is the locale the content is authored in", () => {
    expect(DEFAULT_LOCALE).toBe("nl");
  });

  it("accepts a known locale", () => {
    expect(isLocale("fr")).toBe(true);
  });

  it("rejects an unknown one rather than coercing it", () => {
    expect(isLocale("de")).toBe(false);
    expect(isLocale("")).toBe(false);
    expect(isLocale("NL")).toBe(false);
  });

  it("resolves an unknown segment to the default instead of throwing", () => {
    // A bad locale in the URL is a 404 concern for the route, not a crash
    // for every helper that reads it.
    expect(resolveLocale("de")).toBe("nl");
    expect(resolveLocale(undefined)).toBe("nl");
  });

  it("resolves a known segment to itself", () => {
    expect(resolveLocale("fr")).toBe("fr");
  });
});

describe("localeHref", () => {
  it("keeps the path and query when switching locale", () => {
    expect(localeHref("/en/gestures?q=hallo", "fr")).toBe(
      "/fr/gestures?q=hallo"
    );
  });

  it("handles the bare locale root", () => {
    expect(localeHref("/en", "nl")).toBe("/nl");
  });

  it("leaves no trailing slash behind on the bare root", () => {
    // `"/".split("/")` is `["", ""]`, so a splice-based implementation emits
    // `/nl/` here — a different URL to `/nl` for a crawler and for anything
    // that compares `pathname`.
    expect(localeHref("/", "nl")).toBe("/nl");
    expect(localeHref("/en/", "nl")).toBe("/nl");
  });

  it("prefixes a path that carries no locale yet", () => {
    expect(localeHref("/gestures", "fr")).toBe("/fr/gestures");
  });

  it("rewrites only the first segment, not every occurrence", () => {
    // A naive `pathname.replace("en", "fr")` returns `/fr/gestures/fr-something`
    // and 404s. Only the leading segment is a locale.
    expect(localeHref("/en/gestures/en-something", "fr")).toBe(
      "/fr/gestures/en-something"
    );
  });

  it("does not rewrite a locale-looking value inside the query", () => {
    // The query belongs to the page, not to the router. Rewriting `/en` inside
    // it sends the visitor somewhere they did not ask to go.
    expect(localeHref("/en/gestures?next=/en/lists&q=en", "fr")).toBe(
      "/fr/gestures?next=/en/lists&q=en"
    );
  });

  it("keeps a hash fragment", () => {
    expect(localeHref("/en/gestures?q=hallo#results", "fr")).toBe(
      "/fr/gestures?q=hallo#results"
    );
  });

  it("is a no-op when the locale is already the requested one", () => {
    expect(localeHref("/fr/gestures?q=hallo", "fr")).toBe(
      "/fr/gestures?q=hallo"
    );
  });

  it("does not treat an unknown leading segment as a locale", () => {
    // `/de` is not a locale, so it is a path segment like any other and must
    // survive the switch rather than being overwritten.
    expect(localeHref("/de/gestures", "fr")).toBe("/fr/de/gestures");
  });

  it("returns a path even when handed an absolute URL", () => {
    // Nothing in this app passes one, but the return value is fed straight to
    // `href`, and a same-origin path is the only safe thing to emit.
    expect(localeHref("https://elsewhere.example/en/gestures", "fr")).toBe(
      "/fr/gestures"
    );
  });
});

describe("localeAlternates", () => {
  it("names the same page in every locale", () => {
    expect(localeAlternates("/gestures/7")).toEqual({
      en: "/en/gestures/7",
      fr: "/fr/gestures/7",
      nl: "/nl/gestures/7",
    });
  });

  it("handles the locale root without a trailing slash", () => {
    // `/nl/` is a different URL to `/nl` for a crawler, and an hreflang that
    // names a URL the site redirects away from is an hreflang it ignores.
    expect(localeAlternates("")).toEqual({
      en: "/en",
      fr: "/fr",
      nl: "/nl",
    });
  });

  it("covers exactly the declared locales", () => {
    expect(Object.keys(localeAlternates("")).sort()).toEqual(
      [...LOCALES].sort()
    );
  });
});
