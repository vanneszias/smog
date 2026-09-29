/**
 * Search text normalisation (spec §7.1 step 1), shared by the FTS query and
 * the TS ranking so both see the same words: `normalizeText` (lowercase, no
 * diacritics, collapsed whitespace), then split into letter/digit runs, the
 * way FTS5's `unicode61` tokenizer splits (`remove_diacritics 2`).
 */
import { normalizeText } from "@smog/utils";

/** Everything that is not a letter or a digit separates tokens. */
const SEPARATORS = /[^\p{L}\p{N}]+/u;

/** The words of `text`: `"Café-au-lait!"` → `["cafe", "au", "lait"]`. */
export function searchTokens(text: string): string[] {
  return normalizeText(text)
    .split(SEPARATORS)
    .filter((token) => token !== "");
}

/**
 * The comparable form of a query or a field value: its tokens joined by one
 * space, so a word boundary is always the start or a space. Empty when
 * nothing searchable is left (whitespace and punctuation only).
 */
export function normalizeQuery(text: string): string {
  return searchTokens(text).join(" ");
}

/**
 * The FTS5 `MATCH` expression for a query: every token as a quoted prefix
 * term (`"tok"*`), joined by `AND`. Tokens hold only letters and digits and
 * are quoted, so FTS syntax in the input (`"`, `*`, `-`, `(`, `OR`, `NEAR`,
 * `col:`) never reaches FTS5 as syntax. `null` when there is no token.
 */
export function buildFtsQuery(q: string): string | null {
  const tokens = searchTokens(q);
  if (tokens.length === 0) {
    return null;
  }
  return tokens
    .map((token) => `"${token.replaceAll('"', '""')}"*`)
    .join(" AND ");
}
