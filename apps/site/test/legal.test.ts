import { env, exports } from "cloudflare:workers";
import { bumpI18nVersion } from "@smog/i18n/server";
import { describe, expect, it } from "vitest";

if (!(env.DB && env.KV)) {
  throw new Error("[test] The DB or KV binding is missing");
}
const d1: D1Database = env.DB;
const kv: KVNamespace = env.KV;

const ORIGIN = "http://localhost:5173";
const NOTICE = 'role="note"';
const EDITED_H1 = /<h1[^>]*>Edited terms<\/h1>/;
const LANG_NL_ARTICLE = /<article[^>]*lang="nl"[^>]*>/;
const DUTCH_ARTICLE =
  /<article[^>]*lang="nl"[^>]*>[\s\S]*<h1[^>]*>Privacybeleid<\/h1>/;
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
      "Laatst bijgewerkt op 30 september 2026",
    ],
    [
      "en",
      "Privacy policy",
      "Data controller",
      "Last updated on 30 September 2026",
    ],
    [
      "fr",
      "Politique de confidentialité",
      "Responsable du traitement",
      "Dernière mise à jour le 30 septembre 2026",
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

  it("shows the Dutch text in place for ?lang=nl, changing no setting (review I2)", async () => {
    const en = await page("/terms", "en");
    expect(en.body).toContain('href="/terms?lang=nl"');
    const { body, response } = await page("/privacy?lang=nl", "en");
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    // The site stays English; only the legal text is Dutch.
    expect(body).toContain('<html lang="en"');
    expect(body).toMatch(DUTCH_ARTICLE);
    expect(body).toContain(
      "You are reading the Dutch version, which prevails."
    );
    expect(body).toContain('href="/privacy"');
    // Dutch readers never see the switch.
    const nl = await page("/privacy?lang=nl", "nl");
    expect(nl.body).not.toContain(NOTICE);
  });

  it("puts the analytics switch in the cookies section", async () => {
    const { body } = await page("/privacy", "en");
    expect(body).toContain('aria-label="Your statistics choice"');
    expect(body).toContain('role="switch"');
  });
});

/** A published `legal_text` row inserted the way a publish does it (the test then bumps the i18n version). */
async function publishRow(
  kind: string,
  locale: string,
  version: number,
  content: unknown,
  effectiveDate: string
): Promise<void> {
  await d1
    .prepare(
      "INSERT INTO legal_text (id, kind, locale, version, content, effective_date, status, updated_at, published_at) VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?)"
    )
    .bind(
      crypto.randomUUID(),
      kind,
      locale,
      version,
      JSON.stringify(content),
      effectiveDate,
      Date.now(),
      Date.now()
    )
    .run();
  await bumpI18nVersion(kv);
}

async function removeRows(kind: string, locale: string): Promise<void> {
  await d1
    .prepare(
      "DELETE FROM legal_text WHERE kind = ? AND locale = ? AND version > 1"
    )
    .bind(kind, locale)
    .run();
  await bumpI18nVersion(kv);
}

describe("legal texts from D1 (phase 10b task 7)", () => {
  const edited = {
    sections: [
      {
        blocks: ["Edited in the admin, **no deploy**."],
        id: "scope",
        title: "Edited scope",
      },
    ],
    title: "Edited terms",
  };

  it("shows a published edit at once, with its effective date, and the shipped text again without it", async () => {
    try {
      await publishRow("terms", "en", 2, edited, "2026-11-15");
      const { body } = await page("/terms", "en");
      expect(body).toMatch(EDITED_H1);
      expect(body).toContain("Edited scope");
      expect(body).toContain("<strong");
      expect(body).toContain("Last updated on 15 November 2026");
      expect(body).toContain(NOTICE);
      expect(body).toContain("<title>Edited terms · SMOG &amp; Co</title>");
      // The other language and the other text are untouched.
      expect((await page("/terms", "nl")).body).toContain(
        "Toepasselijk recht en geschillen"
      );
    } finally {
      await removeRows("terms", "en");
    }
    expect((await page("/terms", "en")).body).toContain(
      "Applicable law and disputes"
    );
  });

  it("an edit of the Dutch text shows for ?lang=nl on another language's page", async () => {
    try {
      await publishRow("terms", "nl", 2, edited, "2026-11-16");
      const { body } = await page("/terms?lang=nl", "en");
      expect(body).toMatch(LANG_NL_ARTICLE);
      expect(body).toMatch(EDITED_H1);
      expect(body).toContain("Laatst bijgewerkt op 16 november 2026");
    } finally {
      await removeRows("terms", "nl");
    }
  });

  it("a published row that does not validate never breaks the page: the shipped text shows", async () => {
    try {
      await publishRow("terms", "fr", 2, { title: "broken" }, "2026-11-17");
      const { body, response } = await page("/terms", "fr");
      expect(response.status).toBe(200);
      expect(body).toContain("Droit applicable et litiges");
      expect(body).toContain("Dernière mise à jour le 30 septembre 2026");
    } finally {
      await removeRows("terms", "fr");
    }
  });
});
