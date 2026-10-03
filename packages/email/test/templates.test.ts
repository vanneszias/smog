import { LOCALES, type Locale } from "@smog/i18n";
import { describe, expect, it } from "vitest";
import { EmailRenderError, type EmailTemplateProps, renderEmail } from "../src";
import { EMAIL_SAMPLES } from "../src/samples";

const SITE = "https://smog.example";
const SCRIPT = "<script>alert(1)</script>";

/** Any run of spaces (also no-break and narrow no-break) as one space. */
function plain(text: string): string {
  return text.replace(/[\s  ]+/g, " ");
}

const MONEY: Record<Locale, string> = {
  en: "€60.00",
  fr: "60,00 €",
  nl: "€ 60,00",
};

/** 23:30 UTC on 1 October is already 2 October in Brussels. */
const LATE_EVENING = "2027-10-01T23:30:00.000Z";
const BRUSSELS_DATE: Record<Locale, string> = {
  en: "2 October 2027",
  fr: "2 octobre 2027",
  nl: "2 oktober 2027",
};

const YOUR_GESTURE: Record<Locale, string> = {
  en: "your gesture",
  fr: "votre geste",
  nl: "je gebaar",
};

describe("the layout", () => {
  it("shows the logo from the site, the copyright and the tagline", async () => {
    const email = await renderEmail(
      "transactional/welcome",
      EMAIL_SAMPLES["transactional/welcome"],
      "nl",
      { siteUrl: "https://smog-site-staging.example" }
    );
    expect(email.html).toContain(
      'src="https://smog-site-staging.example/brand/email-logo.png"'
    );
    expect(email.html).toContain('alt="SMOG &amp; Co"');
    const year = new Date().getUTCFullYear();
    expect(email.text).toContain(`© ${year} SMOG & CO vzw · België`);
    expect(email.text).toContain(
      "SMOG — Spreken Met Ondersteuning van Gebaren"
    );
  });

  it("falls back to the wordmark without a site URL", async () => {
    const email = await renderEmail(
      "auth/otp",
      EMAIL_SAMPLES["auth/otp"],
      "en"
    );
    expect(email.html).not.toContain("email-logo.png");
    expect(email.html).toContain("SMOG &amp; Co");
  });

  it("wraps a failed render in EmailRenderError", async () => {
    await expect(
      renderEmail(
        "transactional/payment-confirmed",
        {} as EmailTemplateProps["transactional/payment-confirmed"],
        "nl"
      )
    ).rejects.toBeInstanceOf(EmailRenderError);
  });
});

describe("escaping", () => {
  it.each([
    "transactional/sponsorship-received",
    "transactional/sponsorship-live",
    "transactional/admin-new-sponsorship",
    "transactional/admin-render-failed",
  ] as const)("escapes a <script> display name in %s", async (template) => {
    const props = { ...EMAIL_SAMPLES[template], displayName: SCRIPT };
    const email = await renderEmail(template, props as never, "en");
    expect(email.html).not.toContain("<script");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("escapes the names and the error text the admin emails show", async () => {
    const email = await renderEmail(
      "transactional/admin-new-sponsorship",
      {
        ...EMAIL_SAMPLES["transactional/admin-new-sponsorship"],
        contact: { company: SCRIPT, email: "a@smog.example", name: SCRIPT },
        gestures: [{ amountCents: 5000, name: SCRIPT }],
      },
      "nl"
    );
    expect(email.html).not.toContain("<script");
    const failed = await renderEmail(
      "transactional/admin-render-failed",
      { ...EMAIL_SAMPLES["transactional/admin-render-failed"], error: SCRIPT },
      "nl"
    );
    expect(failed.html).not.toContain("<script");
  });
});

describe("money and dates per locale", () => {
  it.each(LOCALES)(
    "payment_confirmed shows the gesture's amount in %s",
    async (locale) => {
      const email = await renderEmail(
        "transactional/payment-confirmed",
        {
          amountCents: 6000,
          endsAt: null,
          gestureName: "Hond",
          kind: "initial",
          name: "Alex",
        },
        locale
      );
      expect(plain(email.text)).toContain(MONEY[locale]);
      expect(email.text).toContain("Hond");
    }
  );

  it.each(LOCALES)(
    "a renewal's payment_confirmed shows the new end date in Brussels (%s)",
    async (locale) => {
      const email = await renderEmail(
        "transactional/payment-confirmed",
        {
          amountCents: 6000,
          endsAt: LATE_EVENING,
          gestureName: "Hond",
          kind: "renewal",
          name: "Alex",
        },
        locale
      );
      expect(plain(email.text)).toContain(BRUSSELS_DATE[locale]);
    }
  );

  it.each(LOCALES)(
    "sponsorship_live shows both stored dates (%s)",
    async (locale) => {
      const email = await renderEmail(
        "transactional/sponsorship-live",
        {
          ...EMAIL_SAMPLES["transactional/sponsorship-live"],
          endsAt: LATE_EVENING,
          startsAt: "2026-10-02T08:00:00.000Z",
        },
        locale
      );
      const text = plain(email.text);
      expect(text).toContain(BRUSSELS_DATE[locale]);
      expect(text).toContain(BRUSSELS_DATE[locale].replace("2027", "2026"));
    }
  );

  it("renewal_reminder says 30 days and links to the renewal page", async () => {
    const url = `${SITE}/sponsor/renew?token=abc`;
    const email = await renderEmail(
      "transactional/renewal-reminder",
      { endsAt: LATE_EVENING, gestureName: "Hond", name: "Alex", url },
      "nl"
    );
    expect(plain(email.text)).toContain("30 dagen");
    expect(plain(email.text)).toContain(BRUSSELS_DATE.nl);
    expect(email.text).toContain(url);
  });
});

describe("the missing-gesture fallback (bug 28)", () => {
  for (const locale of LOCALES) {
    it.each([
      "transactional/sponsorship-received",
      "transactional/payment-confirmed",
      "transactional/sponsorship-live",
      "transactional/renewal-reminder",
    ] as const)(
      `%s says "${YOUR_GESTURE[locale]}" in ${locale}`,
      async (template) => {
        const props = { ...EMAIL_SAMPLES[template], gestureName: null };
        const email = await renderEmail(template, props as never, locale);
        expect(email.text.toLowerCase()).toContain(YOUR_GESTURE[locale]);
        expect(email.text).not.toContain("null");
        expect(email.text).not.toContain("Hond");
      }
    );
  }
});

describe("the admin emails", () => {
  const sample = EMAIL_SAMPLES["transactional/admin-new-sponsorship"];

  it("admin_new_sponsorship lists the gestures, the contact and the invoice box", async () => {
    const email = await renderEmail(
      "transactional/admin-new-sponsorship",
      {
        ...sample,
        gestures: [
          { amountCents: 6000, name: "Hond" },
          { amountCents: 5000, name: null },
        ],
        totalCents: 11_000,
      },
      "nl"
    );
    const text = plain(email.text);
    expect(email.subject).toBe("Nieuwe sponsoring van Acme BV");
    for (const expected of [
      "Hond",
      "€ 60,00",
      "€ 50,00",
      "€ 110,00",
      "Alex (Acme BV)",
      "alex@smog.example",
      "1 jaar",
      "BE 0123.456.749",
      "facturen@smog.example",
      "Ja",
    ]) {
      expect(text).toContain(expected);
    }
    expect(email.text).toContain(sample.url);
  });

  it("uses the sponsor's email when the invoice has none, and says no invoice", async () => {
    const withoutEmail = await renderEmail(
      "transactional/admin-new-sponsorship",
      {
        ...sample,
        invoice: { email: "", name: "Acme BV", vatNumber: "0123456749" },
      },
      "en"
    );
    expect(plain(withoutEmail.text)).toContain(
      "Invoice email: alex@smog.example"
    );
    const none = await renderEmail(
      "transactional/admin-new-sponsorship",
      {
        ...sample,
        contact: { ...sample.contact, company: null },
        invoice: null,
      },
      "en"
    );
    const text = plain(none.text);
    expect(text).toContain("Invoice requested: No");
    expect(text).not.toContain("VAT number");
    expect(text).not.toContain("Alex (");
  });

  it("names a renewal in the subject", async () => {
    const email = await renderEmail(
      "transactional/admin-new-sponsorship",
      { ...sample, kind: "renewal" },
      "en"
    );
    expect(email.subject).toBe("Sponsorship renewed by Acme BV");
  });

  it("admin_render_failed shows at most 300 characters of the error", async () => {
    const error = `${"x".repeat(299)}yz${"!".repeat(50)}`;
    const email = await renderEmail(
      "transactional/admin-render-failed",
      { ...EMAIL_SAMPLES["transactional/admin-render-failed"], error },
      "en"
    );
    expect(email.subject).toBe("Video failed for Hond");
    expect(email.text).toContain(`${"x".repeat(299)}y`);
    expect(email.text).not.toContain("yz");
  });

  it.each([
    ["late", "Te laat betaald"],
    ["mismatch", "klopt niet"],
    ["double", "Dubbel betaald"],
  ] as const)("admin_refund_needed explains %s", async (reason, phrase) => {
    const sampleRefund = EMAIL_SAMPLES["transactional/admin-refund-needed"];
    const email = await renderEmail(
      "transactional/admin-refund-needed",
      { ...sampleRefund, reason },
      "nl"
    );
    expect(email.subject).toBe(
      `Terugbetaling nodig voor betaling ${sampleRefund.paymentId}`
    );
    const text = plain(email.text);
    expect(text).toContain(phrase);
    expect(text).toContain("€ 60,00");
    expect(email.text).toContain(sampleRefund.url);
  });
});
