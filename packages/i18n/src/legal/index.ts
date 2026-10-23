// biome-ignore-all lint/performance/noBarrelFile: the `@smog/i18n/legal` entry point: the shipped texts plus everything `./markup` exports.
import type { Locale } from "@smog/config/constants";
import { en } from "./en";
import { fr } from "./fr";
import { nl } from "./nl";
import type { LegalDocument, LegalKind, LegalTexts } from "./types";

export * from "./markup";

/**
 * The date both shipped texts take effect (ISO date), shown as "last
 * updated" while no published row exists (the migration seeds version 1 with
 * this date). The owner sets it at cutover (docs/LEGAL-SIGNOFF.md). It is
 * independent of `CONSENT_POLICY_VERSION`, so correcting it never asks for
 * consent again; a test keeps the consent version no later than it (review M2).
 */
export const LEGAL_EFFECTIVE_DATE = "2026-09-30";

const TEXTS: Readonly<Record<string, LegalTexts>> = { en, fr, nl };

/** The shipped text: the fallback of the D1 rows and the seed of version 1. */
export function legalDocument(locale: Locale, kind: LegalKind): LegalDocument {
  // A language without a shipped text reads the Dutch one (the canonical text).
  return (TEXTS[locale] ?? nl)[kind];
}

/** Whether a text is shipped for the language (the others read the Dutch one). */
export function hasShippedLegal(locale: Locale): boolean {
  return locale in TEXTS;
}
