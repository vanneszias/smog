import { describe, expect, it } from "vitest";
import { renderEmail } from "@/email/render";
import { LOCALES } from "@/lib/locale";

const URL_FOR = "https://smog.example.test/nl/account/confirm-email?token=abc";

describe("the message bodies", () => {
  it("renders every message in the recipient's locale", () => {
    /*
     * Every locale the public site serves, for both messages, asserted as a
     * set rather than one at a time: the failure this guards against is a
     * locale that falls through to another language, which a test naming one
     * locale would not see. `LOCALES` rather than a literal, so adding a
     * fourth locale fails here rather than silently sending it Dutch.
     */
    const subjects = new Set<string>();
    const bodies = new Set<string>();

    for (const locale of LOCALES) {
      const change = renderEmail({
        kind: "email-change",
        locale,
        url: URL_FOR,
      });
      const reEdit = renderEmail({
        kind: "re-edit",
        locale,
        sponsorName: "Acme",
        url: URL_FOR,
      });

      for (const message of [change, reEdit]) {
        expect(message.subject).not.toBe("");
        expect(message.text).toContain(URL_FOR);
        subjects.add(message.subject);
        bodies.add(message.text);
      }
    }

    // Three locales times two messages, all different. A dictionary that
    // answered one locale's copy for another collapses this count.
    expect(subjects.size).toBe(LOCALES.length * 2);
    expect(bodies.size).toBe(LOCALES.length * 2);
  });

  it("names the sponsor in the invitation it addresses to them", () => {
    const message = renderEmail({
      kind: "re-edit",
      locale: "nl",
      sponsorName: "Acme Verzekeringen",
      url: URL_FOR,
    });

    expect(message.text).toContain("Acme Verzekeringen");
  });

  it("flattens a sponsor name that carries newlines", () => {
    /*
     * `sponsorName` is whatever a stranger typed into the checkout form, and
     * Cloudflare composes the MIME headers around what this returns. A newline
     * that survived into a header is a header injection; one that survived
     * into the body is a message that reads as if it came from somewhere else.
     */
    const message = renderEmail({
      kind: "re-edit",
      locale: "nl",
      sponsorName: "Acme\r\nBcc: someone@example.test",
      url: URL_FOR,
    });

    expect(message.text).toContain("Acme Bcc: someone@example.test");
    expect(message.subject).not.toContain("\n");
    expect(message.text.split("\n").length).toBe(
      renderEmail({
        kind: "re-edit",
        locale: "nl",
        sponsorName: "Acme",
        url: URL_FOR,
      }).text.split("\n").length
    );
  });

  it("keeps the link intact", () => {
    // The whole message exists to deliver this string. A renderer that
    // trimmed, wrapped or escaped it would produce a link nobody can click,
    // which no subject-line assertion would notice.
    const url = `${URL_FOR}&other=1`;

    for (const locale of LOCALES) {
      expect(renderEmail({ kind: "email-change", locale, url }).text).toContain(
        url
      );
    }
  });
});
