import { legalPublishedSource } from "@smog/db";
import { createDb } from "@smog/db/client";
import {
  hasShippedLegal,
  LEGAL_CANONICAL_LOCALE,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_KINDS,
  type LegalDocument,
  type LegalKind,
  legalDocument,
} from "@smog/i18n/legal";
import { type LegalDeps, loadLegalText } from "@smog/i18n/server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { siteEnv } from "./auth";

/** One language's text for the page. */
export interface LegalText {
  document: LegalDocument;
  /** ISO date this version takes effect. */
  effectiveDate: string;
  /** The language the text is written in: the asked one, or the Dutch text for a language without its own. */
  locale: string;
  /** The published version; `null` for the text shipped in the bundle (D1 had no usable row). */
  version: number | null;
}

/** The texts the page asked for, by the language asked. */
export type LegalTexts = Readonly<Record<string, LegalText>>;

const inputSchema = z.object({
  kind: z.enum(LEGAL_KINDS),
  /** The site language and, when it differs, the Dutch text (`?lang=nl`, the translation notice). */
  locales: z.array(z.string().min(2).max(35)).min(1).max(2),
});

function legalDeps(): LegalDeps {
  const { db, kv } = siteEnv();
  return { kv, source: legalPublishedSource(createDb(db)) };
}

/**
 * The text of one language: the published row of D1 (the highest version,
 * cached with the i18n version), else the text shipped in the bundle, else,
 * for a language that has neither, the Dutch text (canonical).
 */
async function textFor(
  deps: LegalDeps,
  kind: LegalKind,
  locale: string
): Promise<LegalText> {
  const own = await loadLegalText(deps, kind, locale);
  if (own) {
    return { ...own, locale };
  }
  if (hasShippedLegal(locale)) {
    return {
      document: legalDocument(locale, kind),
      effectiveDate: LEGAL_EFFECTIVE_DATE,
      locale,
      version: null,
    };
  }
  // No text of its own yet: the Dutch one, flagged as Dutch.
  const dutch = await loadLegalText(deps, kind, LEGAL_CANONICAL_LOCALE);
  return dutch
    ? { ...dutch, locale: LEGAL_CANONICAL_LOCALE }
    : {
        document: legalDocument(LEGAL_CANONICAL_LOCALE, kind),
        effectiveDate: LEGAL_EFFECTIVE_DATE,
        locale: LEGAL_CANONICAL_LOCALE,
        version: null,
      };
}

/** The route loader of `/privacy` and `/terms`: the published texts, no deploy needed after an edit. */
export const getLegalTexts = createServerFn()
  .validator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<LegalTexts> => {
    try {
      const deps = legalDeps();
      const locales = [...new Set(data.locales)];
      const texts = await Promise.all(
        locales.map((locale) => textFor(deps, data.kind, locale))
      );
      return Object.fromEntries(
        locales.map((locale, index) => [locale, texts[index] as LegalText])
      );
    } catch (error) {
      console.error("[legal] Failed to load the legal texts:", error);
      throw error;
    }
  });
