import { describe, expect, it } from "vitest";
import {
  carriesSecret,
  EMAIL_BODY_CLASS,
  type EmailBodyClass,
} from "../../../../../email/src/body-policy";
import {
  EMAIL_SAMPLES,
  EMAIL_TEMPLATE_IDS,
} from "../../../../../email/src/samples";

/*
 * Phase 9 ruling 5c: a dead letter keeps no body for an email that carries
 * a token or a code. `EMAIL_BODY_CLASS` is a mapped type (check-types fails
 * for an unclassified template); this holds each class to the template's
 * sample props, so a template that takes a `url`, `token` or `code` prop
 * cannot be filed as `none`, and a `link` cannot hide a secret in its URL.
 */

const SECRET_PROPS = ["code", "token"] as const;
const SECRET_IN_URL = /[?&#](token|code|key|secret|otp|signature|sig)=/i;
const SECRET_IN_PATH = /\/(token|reset|verify|magic)[/-]/i;

function propsOf(template: (typeof EMAIL_TEMPLATE_IDS)[number]) {
  return EMAIL_SAMPLES[template] as unknown as Record<string, unknown>;
}

function classOf(
  template: (typeof EMAIL_TEMPLATE_IDS)[number]
): EmailBodyClass {
  return EMAIL_BODY_CLASS[template];
}

describe("EMAIL_BODY_CLASS", () => {
  it("classifies every registered template, and no other", () => {
    expect(Object.keys(EMAIL_BODY_CLASS).sort()).toEqual(
      [...EMAIL_TEMPLATE_IDS].sort()
    );
  });

  for (const template of EMAIL_TEMPLATE_IDS) {
    it(`${template}: its class matches what its props take`, () => {
      const props = propsOf(template);
      const keys = Object.keys(props);
      const takesLink = keys.includes("url");
      const takesSecret = SECRET_PROPS.some((key) => keys.includes(key));
      const url = typeof props.url === "string" ? props.url : "";
      const urlLooksSecret =
        SECRET_IN_URL.test(url) || SECRET_IN_PATH.test(url);
      const klass = classOf(template);

      if (takesSecret || urlLooksSecret) {
        expect(klass, "a code or a token needs `secret`").toBe("secret");
      }
      if (takesLink || takesSecret) {
        expect(
          klass,
          "a url, token or code prop needs a class other than none"
        ).not.toBe("none");
      }
      if (klass === "none") {
        expect(takesLink || takesSecret).toBe(false);
      }
      if (klass === "link") {
        expect(takesLink).toBe(true);
        expect(urlLooksSecret).toBe(false);
      }
    });
  }

  it("keeps every auth email and the renewal reminder secret", () => {
    for (const template of EMAIL_TEMPLATE_IDS.filter((id) =>
      id.startsWith("auth/")
    )) {
      expect(carriesSecret(template), template).toBe(true);
    }
    expect(carriesSecret("transactional/renewal-reminder")).toBe(true);
    // Third-party personal data (sponsor contact, invoice, VAT): never stored.
    expect(carriesSecret("transactional/admin-new-sponsorship")).toBe(true);
  });

  it("treats a template it does not know as secret", () => {
    expect(carriesSecret("transactional/from-the-future")).toBe(true);
    expect(carriesSecret("constructor")).toBe(true);
    expect(carriesSecret("transactional/welcome")).toBe(false);
  });
});
