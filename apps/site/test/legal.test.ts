import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const ORIGIN = "http://localhost:5173";
const NOTICE = 'role="note"';
const CANONICAL_PRIVACY =
  /<link (?=[^>]*rel="canonical")(?=[^>]*href="http:\/\/localhost:5173\/privacy")[^>]*>/;

async function page(
  path: string,
  locale: string
): Promise<{ body: string; response: Response }> {
  const response = await exports.default.fetch(`${ORIGIN}${path}`, {
    headers: { cookie: `locale=${locale}` },
  });
  return { body: await response.text(), response };
}

describe("/privacy and /terms (spec §9, inventory P-07, P-08, R-16)", () => {
  it.each([
    [
      "nl",
      "Privacybeleid",
      "Verwerkingsverantwoordelijke",
      "Laatst bijgewerkt op 29 september 2026",
    ],
    [
      "en",
      "Privacy policy",
      "Data controller",
      "Last updated on 29 September 2026",
    ],
    [
      "fr",
      "Politique de confidentialité",
      "Responsable du traitement",
      "Dernière mise à jour le 29 septembre 2026",
    ],
  ])(
    "renders the privacy policy in %s",
    async (locale, title, section, updated) => {
      const { body, response } = await page("/privacy", locale);
      expect(response.status).toBe(200);
      expect(body).toContain(`<html lang="${locale}"`);
      expect(body).toMatch(new RegExp(`<h1[^>]*>${title}</h1>`));
      expect(body).toContain(section);
      expect(body).toContain(updated);
      expect(body).toContain('id="rights"');
      expect(body).toContain('href="mailto:info@smog.vlaanderen"');
      expect(body).toContain(`<title>${title} · SMOG &amp; Co</title>`);
      expect(body).toMatch(CANONICAL_PRIVACY);
    }
  );

  it.each([
    ["nl", "Servicevoorwaarden", "Toepasselijk recht en geschillen"],
    ["en", "Terms of service", "Applicable law and disputes"],
    ["fr", "Conditions d&#x27;utilisation", "Droit applicable et litiges"],
  ])("renders the terms in %s", async (locale, title, section) => {
    const { body, response } = await page("/terms", locale);
    expect(response.status).toBe(200);
    expect(body).toMatch(new RegExp(`<h1[^>]*>${title}</h1>`));
    expect(body).toContain(section);
    expect(body).toContain('href="/privacy"');
  });

  it("flags en and fr as translations; Dutch prevails", async () => {
    const nl = await page("/privacy", "nl");
    expect(nl.body).not.toContain(NOTICE);
    const en = await page("/terms", "en");
    expect(en.body).toContain(NOTICE);
    expect(en.body).toContain(
      "This translation is provided for convenience; the Dutch version prevails."
    );
    const fr = await page("/privacy", "fr");
    expect(fr.body).toContain(NOTICE);
    expect(fr.body).toContain("la version néerlandaise prévaut");
  });

  it("puts the analytics switch in the cookies section", async () => {
    const { body } = await page("/privacy", "en");
    expect(body).toContain('aria-label="Your statistics choice"');
    expect(body).toContain('role="switch"');
  });
});
