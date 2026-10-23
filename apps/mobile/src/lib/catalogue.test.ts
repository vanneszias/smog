import { describe, expect, it } from "@jest/globals";
import { wantedLocale } from "./catalogue";

describe("wantedLocale", () => {
  it("takes the stored choice first", () => {
    expect(wantedLocale("fr", ["en-US"], ["nl", "en", "fr"])).toBe("fr");
  });

  it("resolves the device list against the enabled languages, like setupNative", () => {
    // `de` is not enabled: the second device language wins, and it is the tag sent.
    expect(wantedLocale(null, ["de-DE", "fr-BE"], ["nl", "en", "fr"])).toBe(
      "fr"
    );
  });

  it("uses an added language once the server lists it", () => {
    expect(
      wantedLocale(null, ["de-DE", "fr-BE"], ["nl", "en", "fr", "de"])
    ).toBe("de");
  });

  it("falls back to the default when no device language is enabled", () => {
    expect(wantedLocale(null, ["ja-JP"], ["nl", "en", "fr"])).toBe("nl");
  });

  it("knows the shipped three before the first answer", () => {
    expect(wantedLocale(null, ["en-GB"])).toBe("en");
    expect(wantedLocale(null, ["de-DE"])).toBe("nl");
  });
});
