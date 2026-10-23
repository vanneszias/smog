// biome-ignore-all lint/performance/noBarrelFile: the `@smog/i18n/legal/markup` entry point: everything about legal texts except the shipped texts themselves, so a client bundle (the legal page, the editor) never pulls the ~21 kB gzip of text in.
import type { Locale } from "@smog/config/constants";
import type { LegalKind } from "./types";

export {
  type LegalInline,
  parseLegalInline,
} from "./inline";
export type {
  LegalBlock,
  LegalDocument,
  LegalKind,
  LegalSection,
  LegalTexts,
} from "./types";
export {
  LEGAL_LIMITS,
  type LegalIssue,
  type LegalIssueCode,
  type LegalValidation,
  validateLegalDocument,
} from "./validate";

export const LEGAL_KINDS = [
  "privacy",
  "terms",
] as const satisfies readonly LegalKind[];

/** The Dutch text prevails; the pages flag the others as translations. */
export const LEGAL_CANONICAL_LOCALE: Locale = "nl";
