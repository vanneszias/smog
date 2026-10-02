const ESCAPES: Record<string, string> = {
  "'": "&#39;",
  '"': "&quot;",
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};
const ESCAPED = /[&<>"']/g;

/**
 * Text for an HTML (or XML) text node or quoted attribute value: `&`, `<`,
 * `>`, `"` and `'` become entities. Never for script, style or URL
 * contexts (a `javascript:` URL stays a URL).
 */
export function escapeHtml(value: string): string {
  return value.replace(ESCAPED, (char) => ESCAPES[char] ?? char);
}
