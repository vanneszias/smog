import { describe, expect, it } from "bun:test";
import {
  isLanguagePage,
  languageUrl,
  pageLanguageParam,
} from "../../../../../apps/site/src/lib/page-language";

describe("language URLs (?lang=)", () => {
  it.each([
    "/",
    "/gestures",
    "/gestures/",
    "/gestures/hond",
    "/sponsor",
    "/privacy",
    "/terms",
  ])("treats %s as a public page in every language", (path) => {
    expect(isLanguagePage(path)).toBe(true);
  });

  it.each([
    "/my",
    "/account",
    "/sign-in",
    "/lists/abc",
    "/sponsor/edit",
    "/sponsor/success",
    "/gestures/hond/extra",
    "/admin/translation/legal",
    "/dev/ui",
  ])("leaves %s alone: private, tokened or its own ?lang", (path) => {
    expect(isLanguagePage(path)).toBe(false);
  });

  it("reads ?lang only on a public page and only a short string", () => {
    expect(pageLanguageParam({ pathname: "/", search: { lang: "fr" } })).toBe(
      "fr"
    );
    expect(
      pageLanguageParam({ pathname: "/my", search: { lang: "fr" } })
    ).toBeNull();
    expect(
      pageLanguageParam({ pathname: "/", search: { lang: ["fr"] } })
    ).toBeNull();
    expect(pageLanguageParam({ pathname: "/", search: { lang: "" } })).toBe(
      null
    );
    expect(
      pageLanguageParam({ pathname: "/", search: { lang: "x".repeat(36) } })
    ).toBeNull();
  });

  it("builds the language variant and the bare URL", () => {
    expect(languageUrl("https://smog.example", "/gestures", "pt-BR")).toBe(
      "https://smog.example/gestures?lang=pt-BR"
    );
    expect(languageUrl("https://smog.example", "/", null)).toBe(
      "https://smog.example/"
    );
  });
});
