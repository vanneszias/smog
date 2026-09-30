import { CONSENT_POLICY_VERSION, type Locale } from "@smog/config/constants";
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
 * When each text last changed (ISO date). The privacy policy's date is the
 * policy version a consent decision refers to, so a change there that
 * affects analytics comes with a new `CONSENT_POLICY_VERSION`.
 */
export const LEGAL_UPDATED: Readonly<Record<LegalKind, string>> = {
  privacy: CONSENT_POLICY_VERSION,
  terms: "2026-09-29",
};

const TEXTS: Readonly<Record<Locale, LegalTexts>> = { en, fr, nl };

export function legalDocument(locale: Locale, kind: LegalKind): LegalDocument {
  return TEXTS[locale][kind];
}

export type LegalInline =
  | { text: string; type: "strong" | "text" }
  | { href: string; text: string; type: "link" };

/** `**bold**` or `[text](href)`. */
const MARK = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
/** Links go to a site path, a web page or an email address. */
const SAFE_HREF = /^(?:\/(?![/\\])|https:\/\/|mailto:)/;

/** Splits inline legal text into plain, bold and link parts. */
export function parseLegalInline(text: string): LegalInline[] {
  const parts: LegalInline[] = [];
  let last = 0;
  const push = (plain: string): void => {
    if (plain) {
      const previous = parts.at(-1);
      if (previous?.type === "text") {
        previous.text += plain;
      } else {
        parts.push({ text: plain, type: "text" });
      }
    }
  };
  for (const match of text.matchAll(MARK)) {
    const [whole, strong, label, href] = match;
    push(text.slice(last, match.index));
    if (strong !== undefined) {
      parts.push({ text: strong, type: "strong" });
    } else if (
      label !== undefined &&
      href !== undefined &&
      SAFE_HREF.test(href)
    ) {
      parts.push({ href, text: label, type: "link" });
    } else {
      push(whole);
    }
    last = match.index + whole.length;
  }
  push(text.slice(last));
  return parts;
}
