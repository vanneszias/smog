/** CSV for the strings export and import (RFC 4180: quotes, doubled quotes, CRLF or LF, a BOM). Pure. */

/** The byte order mark Excel wants at the start of a UTF-8 CSV. */
export const BOM = String.fromCodePoint(0xfe_ff);

/** A CSV that does not parse (an unclosed quote, text after a closing quote). */
export class CsvError extends Error {
  constructor(message: string) {
    super(`[translation] The CSV is not valid: ${message}`);
    this.name = "CsvError";
  }
}

const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;
const SEPARATORS = new Set([",", "\r", "\n"]);

/**
 * One cell of a written CSV. A cell a spreadsheet would run as a formula
 * (`=`, `+`, `-`, `@`, tab, CR first) gets a leading apostrophe, which
 * `fromCsvCell` takes off again.
 */
export function toCsvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** A cell as read: CRLF inside it becomes LF and the formula apostrophe goes. */
export function fromCsvCell(value: string): string {
  const text = value.replaceAll("\r\n", "\n");
  return text.startsWith("'") && FORMULA_START.test(text.slice(1))
    ? text.slice(1)
    : text;
}

/** The text of a quoted cell starting after its opening quote, and where it ended. */
function readQuoted(
  text: string,
  start: number
): { next: number; value: string } {
  let value = "";
  let index = start;
  while (index < text.length) {
    const char = text.charAt(index);
    if (char === '"') {
      if (text.charAt(index + 1) !== '"') {
        return { next: index + 1, value };
      }
      value += '"';
      index += 2;
    } else {
      value += char;
      index += 1;
    }
  }
  throw new CsvError("a quote is not closed");
}

/** The text of a plain cell and where it ended (at a separator or the end). */
function readPlain(
  text: string,
  start: number
): { next: number; value: string } {
  let end = start;
  while (end < text.length && !SEPARATORS.has(text.charAt(end))) {
    end += 1;
  }
  return { next: end, value: text.slice(start, end) };
}

/** Parses CSV into rows of cells; blank lines are skipped. */
export function parseCsv(content: string): string[][] {
  const text = content.startsWith(BOM) ? content.slice(1) : content;
  const rows: string[][] = [];
  let row: string[] = [];
  let index = 0;
  while (index < text.length) {
    const cell =
      text.charAt(index) === '"'
        ? readQuoted(text, index + 1)
        : readPlain(text, index);
    row.push(cell.value);
    index = cell.next;
    const separator = text.charAt(index);
    if (separator === ",") {
      index += 1;
      if (index >= text.length) {
        row.push("");
      }
      continue;
    }
    if (separator !== "" && !SEPARATORS.has(separator)) {
      throw new CsvError("text follows a closing quote");
    }
    index += separator === "\r" && text.charAt(index + 1) === "\n" ? 2 : 1;
    if (row.some((value) => value !== "")) {
      rows.push(row);
    }
    row = [];
  }
  if (row.some((value) => value !== "")) {
    rows.push(row);
  }
  return rows;
}
