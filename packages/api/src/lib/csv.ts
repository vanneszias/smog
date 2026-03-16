/**
 * CSV serialization utilities
 * Generates CSV strings from arrays of objects without external dependencies
 */

export function buildCsvString(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) {
    return "";
  }

  const firstRow = rows[0];
  if (!firstRow) {
    return "";
  }

  const headers = Object.keys(firstRow);
  const escapeField = (v: unknown) =>
    `"${String(v ?? "").replace(/"/g, '""')}"`;

  return [
    headers.map(escapeField).join(","),
    ...rows.map((row) => headers.map((h) => escapeField(row[h])).join(",")),
  ].join("\n");
}
