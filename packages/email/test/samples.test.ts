import { LOCALES } from "@smog/i18n";
import { describe, expect, it } from "vitest";
import { type EmailTemplateId, renderEmail } from "../src";
import { EMAIL_SAMPLES, EMAIL_TEMPLATE_IDS } from "../src/samples";

const URL_IN_TEXT = /https?:\/\/[^\s)"'<>]+/g;
/** Reserved for examples (RFC 2606): no real host or address. */
const EXAMPLE_HOST = /(^|\.)example$/;

/*
 * `EMAIL_SAMPLES` drives the admin email previews (A-25, W-07). Every
 * registered template needs one, so a new template (phase 6) shows up in
 * the previews, or this fails.
 */
describe("EMAIL_SAMPLES", () => {
  it("has a sample for every registered template, and no other", () => {
    // `check-types` enforces it (the mapped type); this pins the runtime list.
    const registered: Record<EmailTemplateId, true> = {
      "auth/magic-link": true,
      "auth/otp": true,
      "auth/reset-password": true,
      "auth/verify-email": true,
    };
    expect([...EMAIL_TEMPLATE_IDS].sort()).toEqual(
      Object.keys(registered).sort()
    );
  });

  for (const template of EMAIL_TEMPLATE_IDS) {
    it.each(LOCALES)(
      `renders ${template} from its sample in %s`,
      async (locale) => {
        const email = await renderEmail(
          template,
          EMAIL_SAMPLES[template] as never,
          locale
        );
        expect(email.subject.length).toBeGreaterThan(0);
        expect(email.html).toContain(`lang="${locale}"`);
        expect(email.text.trim().length).toBeGreaterThan(0);
      }
    );
  }

  it("uses no real host or address", () => {
    const json = JSON.stringify(EMAIL_SAMPLES);
    expect(json).not.toContain("@");
    for (const url of json.match(URL_IN_TEXT) ?? []) {
      expect(new URL(url).hostname).toMatch(EXAMPLE_HOST);
    }
  });
});
