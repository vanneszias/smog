export type LegalInline =
  | { text: string; type: "strong" | "text" }
  | { href: string; text: string; type: "link" };

/** `**bold**` or `[text](href)`. */
const MARK = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
/** Links go to a site path, a web page or an email address. */
export const SAFE_HREF = /^(?:\/(?![/\\])|https:\/\/|mailto:)/;

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
