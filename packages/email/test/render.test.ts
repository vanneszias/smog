import { LOCALES } from "@smog/i18n";
import { describe, expect, it } from "vitest";
import { emailLocale, renderEmail } from "../src";

const URL = "https://smog.test/api/auth/verify-email?token=abc&callbackURL=%2F";

describe("renderEmail", () => {
  it.each(LOCALES)("renders the verify email in %s", async (locale) => {
    const email = await renderEmail(
      "auth/verify-email",
      { minutes: 60, name: "Ada", url: URL },
      locale
    );

    const subjects = {
      en: "Confirm your email address",
      fr: expect.any(String),
      nl: "Bevestig je e-mailadres",
    };
    expect(email.subject).toEqual(subjects[locale]);
    expect(email.html).toContain("<!DOCTYPE html");
    expect(email.html).toContain(`lang="${locale}"`);
    expect(email.html).toContain(URL.replaceAll("&", "&amp;"));
    expect(email.text).toContain(URL);
    expect(email.text).toContain("Ada");
  });

  it("renders the OTP code, the magic link and the reset link", async () => {
    const otp = await renderEmail(
      "auth/otp",
      { code: "482913", minutes: 5 },
      "nl"
    );
    expect(otp.subject).toBe("482913 is je code voor SMOG & Co");
    expect(otp.html).toContain("482913");
    expect(otp.text).toContain("5 minuten");

    const magic = await renderEmail(
      "auth/magic-link",
      { minutes: 5, url: "https://smog.test/magic?token=m" },
      "en"
    );
    expect(magic.subject).toBe("Your SMOG & Co sign-in link");
    expect(magic.text).toContain("https://smog.test/magic?token=m");

    const reset = await renderEmail(
      "auth/reset-password",
      { minutes: 60, url: "https://smog.test/reset?token=r" },
      "fr"
    );
    expect(reset.text).toContain("https://smog.test/reset?token=r");
    expect(reset.html).toContain('lang="fr"');
  });

  it("greets without a name when there is none", async () => {
    const email = await renderEmail(
      "auth/reset-password",
      { minutes: 60, url: URL },
      "en"
    );
    expect(email.text).toContain("Hello,");
  });

  it("escapes user data in the HTML (i18n does not escape)", async () => {
    const email = await renderEmail(
      "auth/verify-email",
      { minutes: 60, name: '<script>alert("x")</script>', url: URL },
      "en"
    );

    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("rejects a javascript: link", async () => {
    await expect(
      renderEmail(
        "auth/magic-link",
        { minutes: 5, url: "javascript:alert(1)" },
        "en"
      )
    ).rejects.toThrow("url");
  });
});

describe("emailLocale", () => {
  it("prefers the user's locale, then Accept-Language, then nl", () => {
    const request = new Request("https://smog.test", {
      headers: { "accept-language": "fr-BE,fr;q=0.9" },
    });
    expect(emailLocale({ request, userLocale: "en" })).toBe("en");
    expect(emailLocale({ request, userLocale: null })).toBe("fr");
    expect(emailLocale({})).toBe("nl");
  });
});
