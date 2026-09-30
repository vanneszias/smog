import { describe, expect, test } from "bun:test";
import { CONSENT_POLICY_VERSION, LOCALES } from "@smog/config/constants";
import {
  LEGAL_CANONICAL_LOCALE,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_KINDS,
  type LegalBlock,
  legalDocument,
  parseLegalInline,
} from "./index";

/** The Belgian DPA has a site per language. */
const DPA_SITES = [
  "gegevensbeschermingsautoriteit.be",
  "dataprotectionauthority.be",
  "autoriteprotectiondonnees.be",
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ANCHOR = /^[a-z]+(?:-[a-z]+)*$/;

function shape(block: LegalBlock): string {
  if (typeof block === "string") {
    return "p";
  }
  if ("list" in block) {
    return `list:${block.list.length}`;
  }
  if ("lines" in block) {
    return `lines:${block.lines.length}`;
  }
  return "consent";
}

function inlineTexts(block: LegalBlock): string[] {
  if (typeof block === "string") {
    return [block];
  }
  if ("list" in block) {
    return [...block.list];
  }
  if ("lines" in block) {
    return [...block.lines];
  }
  return [];
}

function links(text: string): string[] {
  return parseLegalInline(text).flatMap((part) =>
    part.type === "link" ? [part.href] : []
  );
}

describe("parseLegalInline", () => {
  test("splits text, **bold** and [links](href)", () => {
    expect(
      parseLegalInline(
        "**Mux:** video. [Privacy](https://www.mux.com/privacy), see [account](/account)."
      )
    ).toEqual([
      { text: "Mux:", type: "strong" },
      { text: " video. ", type: "text" },
      { href: "https://www.mux.com/privacy", text: "Privacy", type: "link" },
      { text: ", see ", type: "text" },
      { href: "/account", text: "account", type: "link" },
      { text: ".", type: "text" },
    ]);
  });

  test("plain text stays one part; an unsafe href stays text", () => {
    expect(parseLegalInline("Just text.")).toEqual([
      { text: "Just text.", type: "text" },
    ]);
    expect(parseLegalInline("[x](javascript:alert(1))")).toEqual([
      { text: "[x](javascript:alert(1))", type: "text" },
    ]);
  });
});

describe("the legal texts (spec §9, inventory P-07, P-08)", () => {
  test("Dutch is canonical; the effective date is its own and not before the consent version", () => {
    expect(LEGAL_CANONICAL_LOCALE).toBe("nl");
    // Own date (review M2); a consent refers to a policy already in force.
    expect(LEGAL_EFFECTIVE_DATE).toMatch(ISO_DATE);
    expect(CONSENT_POLICY_VERSION <= LEGAL_EFFECTIVE_DATE).toBe(true);
  });

  test("the old section counts: 16 for privacy, 15 for the terms", () => {
    expect(legalDocument("nl", "privacy").sections).toHaveLength(16);
    expect(legalDocument("nl", "terms").sections).toHaveLength(15);
  });

  for (const kind of LEGAL_KINDS) {
    test(`${kind}: every language has the same sections, blocks and links`, () => {
      const canonical = legalDocument("nl", kind);
      for (const locale of LOCALES) {
        const doc = legalDocument(locale, kind);
        expect(doc.title.length).toBeGreaterThan(0);
        expect(doc.sections.map((s) => s.id)).toEqual(
          canonical.sections.map((s) => s.id)
        );
        doc.sections.forEach((section, index) => {
          const source = canonical.sections[index];
          expect(section.blocks.map(shape), `${locale} ${section.id}`).toEqual(
            source?.blocks.map(shape) ?? []
          );
          const hrefs = (s: typeof section): string[] =>
            s.blocks
              .flatMap(inlineTexts)
              .flatMap(links)
              .filter((href) => !DPA_SITES.some((site) => href.includes(site)));
          if (source) {
            expect(hrefs(section), `${locale} ${section.id}`).toEqual(
              hrefs(source)
            );
          }
        });
      }
    });
  }

  test("section ids are unique anchors", () => {
    for (const kind of LEGAL_KINDS) {
      const ids = legalDocument("nl", kind).sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) {
        expect(id).toMatch(ANCHOR);
      }
    }
  });

  test("the privacy policy names the new processors, never the old ones", () => {
    for (const locale of LOCALES) {
      const text = JSON.stringify(legalDocument(locale, "privacy"));
      for (const name of [
        "Cloudflare",
        "Workers",
        "D1",
        "R2",
        "KV",
        "Queues",
        "Turnstile",
        "Better Auth",
        "Mux",
        "Mollie",
        "OpenPanel",
        "analytics.zias.be",
        "Expo",
        "Google",
        "Apple",
      ]) {
        expect(text, `${locale}: ${name}`).toContain(name);
      }
      for (const name of [
        "WorkOS",
        "Convex",
        "Redis",
        "BullMQ",
        "SMTP",
        "IMAP",
      ]) {
        expect(text, `${locale}: ${name}`).not.toContain(name);
      }
      // Retention: admin logs 3 years, unpaid 24 h, payments 10 years.
      expect(text).toContain("3 ");
      expect(text).toContain("24 ");
      expect(text).toContain("10 ");
      // Analytics is pseudonymous and carries the IP (review I3).
      expect(text).toContain("pseudon");
      expect(text).toContain("OpenPanel");
      for (const claim of [
        "anoniem apparaatprofiel",
        "anonymous device profile",
        "profil d'appareil anonyme",
      ]) {
        expect(text, `${locale}: ${claim}`).not.toContain(claim);
      }
      // Retention for sessions and codes (review I4): 7 days, 5 min, 1 h.
      expect(text).toContain("7 ");
      expect(text).toContain("5 minut");
      // No server-side guest retention any more.
      expect(text).not.toContain("12 ");
    }
  });

  test("the privacy policy has the consent switch in its cookies section", () => {
    for (const locale of LOCALES) {
      const cookies = legalDocument(locale, "privacy").sections.find(
        (s) => s.id === "cookies"
      );
      expect(cookies?.blocks.some((b) => shape(b) === "consent")).toBe(true);
    }
  });

  test("the terms mention the renewal and the 7-day re-edit link", () => {
    for (const locale of LOCALES) {
      const sponsoring = JSON.stringify(
        legalDocument(locale, "terms").sections.find(
          (s) => s.id === "sponsoring"
        )
      );
      expect(sponsoring).toContain("7 ");
      expect(sponsoring).toContain("30 ");
    }
  });
});
