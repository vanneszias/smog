import { describe, expect, it } from "vitest";
import { formatEmailDate, renderEmail } from "@/email/render";
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
      const reminder = renderEmail({
        endDate: "31 oktober 2027",
        gestureName: "Dank u",
        kind: "renewal-reminder",
        locale,
        sponsorName: "Acme",
        url: URL_FOR,
      });

      for (const message of [change, reEdit, reminder]) {
        expect(message.subject).not.toBe("");
        expect(message.text).toContain(URL_FOR);
        subjects.add(message.subject);
        bodies.add(message.text);
      }
    }

    // Three locales times three messages, all different. A dictionary that
    // answered one locale's copy for another collapses this count.
    expect(subjects.size).toBe(LOCALES.length * 3);
    expect(bodies.size).toBe(LOCALES.length * 3);
  });

  it("tells the sponsor which gesture and which date the reminder is about", () => {
    /*
     * The three facts the reminder carries, which are the three a sponsor needs
     * to decide: who it is addressed to, what is ending, and when. A reminder
     * that said only "your sponsorship ends soon" is unanswerable by a company
     * sponsoring more than one gesture.
     */
    const message = renderEmail({
      endDate: "31 oktober 2027",
      gestureName: "Dank u wel",
      kind: "renewal-reminder",
      locale: "nl",
      sponsorName: "Jan Janssens",
      url: URL_FOR,
    });

    expect(message.subject).toBe("Je SMOG-sponsoring verloopt binnenkort");
    expect(message.text).toContain("Jan Janssens");
    expect(message.text).toContain("Dank u wel");
    expect(message.text).toContain("31 oktober 2027");
    expect(message.text).toContain(URL_FOR);
  });

  it("flattens a gesture name that carries newlines", () => {
    /*
     * The same rule as the sponsor name beside it, applied to the value that
     * was added later — which is exactly the case the note in `render.ts`
     * predicts: the next interpolated value is added by somebody who has not
     * read it.
     */
    const message = renderEmail({
      endDate: "31 oktober 2027",
      gestureName: "Dank\r\nBcc: iemand@elders.test",
      kind: "renewal-reminder",
      locale: "nl",
      sponsorName: "Acme",
      url: URL_FOR,
    });

    expect(message.text).not.toContain("\r");
    expect(message.text).toContain("Dank Bcc: iemand@elders.test");
  });

  it("writes the end date the way the recipient's locale writes it", () => {
    /*
     * `2027-10-31` is a date an American reads as one thing and a Belgian as
     * another, and the sponsor reading this is Belgian. Asserted per locale
     * rather than through `Intl` a second time, which would only assert that
     * the same call returns the same answer.
     */
    const iso = "2027-10-31T23:00:00.000Z";

    expect(formatEmailDate(iso, "nl")).toBe("31 oktober 2027");
    expect(formatEmailDate(iso, "en")).toBe("31 October 2027");
    expect(formatEmailDate(iso, "fr")).toBe("31 octobre 2027");
  });

  it("answers an unparseable date with itself rather than Invalid Date", () => {
    // A sponsorship with a broken `endDate` is a message worth sending with an
    // ugly date in it, not one worth failing four times over and filing.
    expect(formatEmailDate("not a date", "nl")).toBe("not a date");
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
