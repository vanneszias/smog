import { resolveLocale } from "./locale";

describe("resolveLocale", () => {
  it("takes the first supported tag", () => {
    expect(resolveLocale(["fr-BE", "nl-BE"])).toBe("fr");
  });

  it("matches on the language subtag", () => {
    expect(resolveLocale(["en-US"])).toBe("en");
  });

  it("falls back to nl for an unsupported language", () => {
    expect(resolveLocale(["de-DE"])).toBe("nl");
  });

  it("skips an unsupported tag to reach a supported one", () => {
    expect(resolveLocale(["de-DE", "fr-FR"])).toBe("fr");
  });

  it("falls back to nl for no tags at all", () => {
    expect(resolveLocale([])).toBe("nl");
  });

  it("is case-insensitive", () => {
    expect(resolveLocale(["FR"])).toBe("fr");
  });
});
