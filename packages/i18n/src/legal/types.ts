/** The two legal pages (`/privacy`, `/terms`). */
export type LegalKind = "privacy" | "terms";

/**
 * One block of a section:
 * - a string is a paragraph;
 * - `list` is a bulleted list (each item is inline text);
 * - `lines` is an address (one line each);
 * - `consentControl` is where the page puts the analytics switch.
 *
 * Inline text may hold `**bold**` and `[text](href)` (see `parseLegalInline`).
 */
export type LegalBlock =
  | string
  | { list: readonly string[] }
  | { lines: readonly string[] }
  | { consentControl: true };

export interface LegalSection {
  blocks: readonly LegalBlock[];
  /** A stable anchor, the same in every language (`/privacy#rights`). */
  id: string;
  title: string;
}

export interface LegalDocument {
  sections: readonly LegalSection[];
  title: string;
}

/** One language's legal texts: its single source. */
export type LegalTexts = Readonly<Record<LegalKind, LegalDocument>>;
