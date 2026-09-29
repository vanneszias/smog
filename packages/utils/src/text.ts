const COMBINING_MARKS = /\p{M}/gu;
const WHITESPACE = /\s+/g;
const NON_ALPHANUMERIC = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-+|-+$/g;
const MAX_SLUG_LENGTH = 80;

/**
 * Text for comparing and searching: accents removed (NFD, combining marks
 * stripped), lowercase, runs of whitespace collapsed to one space, trimmed.
 */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(WHITESPACE, " ")
    .trim();
}

/** A URL slug: normalized, non-alphanumerics become `-`, at most 80 chars. */
export function slugify(s: string): string {
  return normalizeText(s)
    .replace(NON_ALPHANUMERIC, "-")
    .replace(EDGE_DASHES, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(EDGE_DASHES, "");
}
