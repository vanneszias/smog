import type { Locale } from "@smog/config/constants";
import { en } from "./en";
import { fr } from "./fr";
import { nl } from "./nl";
import type { LegalDocument, LegalKind, LegalTexts } from "./types";

export type {
  LegalBlock,
  LegalDocument,
  LegalKind,
  LegalSection,
  LegalTexts,
} from "./types";

export const LEGAL_KINDS = [
  "privacy",
  "terms",
] as const satisfies readonly LegalKind[];

/** The Dutch text prevails; the pages flag the others as translations. */
export const LEGAL_CANONICAL_LOCALE: Locale = "nl";

/**
 * The date both texts take effect (ISO date), shown as "last updated". The
 * owner sets it at cutover (docs/LEGAL-SIGNOFF.md). It is independent of
 * `CONSENT_POLICY_VERSION`, so correcting it never asks for consent again;
 * a test keeps the consent version no later than it (review M2).
 */
export const LEGAL_EFFECTIVE_DATE = "2026-09-30";

const TEXTS: Readonly<Record<string, LegalTexts>> = { en, fr, nl };

export function legalDocument(locale: Locale, kind: LegalKind): LegalDocument {
  // A language without a shipped text reads the Dutch one (the canonical text).
  return (TEXTS[locale] ?? nl)[kind];
}

// biome-ignore lint/performance/noBarrelFile: the `@smog/i18n/legal` entry point re-exports the inline parser and the validator.
export {
  type LegalInline,
  parseLegalInline,
} from "./inline";
export {
  LEGAL_LIMITS,
  type LegalIssue,
  type LegalIssueCode,
  type LegalValidation,
  validateLegalDocument,
} from "./validate";
