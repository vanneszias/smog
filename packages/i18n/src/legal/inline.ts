export type LegalInline =
  | { text: string; type: "strong" | "text" }
  | { href: string; text: string; type: "link" };

/** Links go to a site path, a web page or an email address. */
export const SAFE_HREF = /^(?:\/(?![/\\])|https:\/\/|mailto:)/;

/** Cache the next delimiter so failed openers never rescan the same suffix. */
function forwardSearch(
  text: string,
  pattern: RegExp
): (from: number) => number {
  let next = -1;
  return (from) => {
    if (next < from) {
      pattern.lastIndex = from;
      next = pattern.exec(text)?.index ?? text.length;
    }
    return next;
  };
}

interface LegalMark {
  end: number;
  href?: string;
  index: number;
  text: string;
}

/** Linear scan of the restricted markup; validation also checks blank/spaced hrefs. */
export function* legalMarks(
  text: string,
  linksOnly = false
): Generator<LegalMark> {
  const boldEnd = forwardSearch(text, /\*\*/g);
  const lineEnd = forwardSearch(text, /[\r\n\u2028\u2029]/g);
  const labelEnd = forwardSearch(text, /\]/g);
  const hrefEnd = forwardSearch(text, /\)/g);
  const space = forwardSearch(text, /\s/g);
  for (let index = 0; index < text.length; index += 1) {
    if (!linksOnly && text.startsWith("**", index)) {
      // .+? requires at least one character, even if that character is '*'.
      const end = boldEnd(index + 3);
      if (end < text.length && lineEnd(index + 2) >= end) {
        yield { end: end + 2, index, text: text.slice(index + 2, end) };
        index = end + 1;
        continue;
      }
    }
    if (text[index] !== "[") {
      continue;
    }
    const label = labelEnd(index + 1);
    if (label === index + 1 || text[label + 1] !== "(") {
      continue;
    }
    const from = label + 2;
    const end = hrefEnd(from);
    if (
      end === text.length ||
      (!linksOnly && (end === from || space(from) < end))
    ) {
      continue;
    }
    yield {
      end: end + 1,
      href: text.slice(from, end),
      index,
      text: text.slice(index + 1, label),
    };
    index = end;
  }
}

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
  for (const match of legalMarks(text)) {
    push(text.slice(last, match.index));
    if (match.href === undefined) {
      parts.push({ text: match.text, type: "strong" });
    } else if (SAFE_HREF.test(match.href)) {
      parts.push({ href: match.href, text: match.text, type: "link" });
    } else {
      push(text.slice(match.index, match.end));
    }
    last = match.end;
  }
  push(text.slice(last));
  return parts;
}
