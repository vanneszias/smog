/**
 * The plan's optional input files (phase 8 rulings 5, 8 and 10), parsed
 * from their text so the CLI only reads files:
 * - `--workos-users`: a WorkOS user export, JSON (an array, or a list
 *   response `{ "data": [...] }`) or CSV with the columns
 *   `id,email,first_name,last_name` (in any order; other columns are
 *   ignored);
 * - `--mux-map`: `mux-map.json`, `{ "<playbackId>": { "assetId": "…",
 *   "renditions": "<state>" } }` (`mux scan` writes it);
 * - `--overrides`: `overlay-overrides.json`, `{ "<sponsorship legacy id>":
 *   "<new display name, 1..35 characters>" }`, held to the wizard's own
 *   display name rule.
 *
 * A file that does not parse throws an `InputError` naming the file, the
 * line or key and the reason, never a value.
 */
import { displayNameSchema } from "@smog/sponsorships/schema";
import { z } from "zod";

export class InputError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`[migrate-convex] ${message}`, options);
    this.name = "InputError";
  }
}

function reason(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(file)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function parseJson(file: string, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new InputError(`${file} is not valid JSON.`, { cause: error });
  }
}

// --- WorkOS users ---------------------------------------------------------

export interface WorkosUser {
  readonly email: string | null;
  readonly firstName: string | null;
  readonly id: string;
  readonly lastName: string | null;
}

const optionalText = z
  .string()
  .nullish()
  .transform((value) => {
    const trimmed = value?.trim() ?? "";
    return trimmed.length > 0 ? trimmed : null;
  });

const workosUserSchema = z.looseObject({
  email: optionalText,
  first_name: optionalText,
  id: z.string().trim().min(1),
  last_name: optionalText,
});

const workosJsonSchema = z.union([
  z.array(workosUserSchema),
  z.looseObject({ data: z.array(workosUserSchema) }).transform((v) => v.data),
]);

const CSV_COLUMNS = ["id", "email", "first_name", "last_name"] as const;

/**
 * RFC 4180 CSV: quoted fields (with `""` for a quote), commas and line
 * breaks inside quotes, CRLF or LF rows, a UTF-8 BOM. Blank lines are
 * skipped.
 */
export function parseCsv(text: string): string[][] {
  const source = text.charCodeAt(0) === BOM ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let index = 0;
  while (index < source.length) {
    const field = readCsvField(source, index);
    row.push(field.value);
    index = field.end + 1;
    if (source[field.end] !== ",") {
      // A line break or the end of the text ends the row.
      if (!(row.length === 1 && row[0] === "")) {
        rows.push(row);
      }
      row = [];
    }
  }
  if (row.length > 0) {
    // The text ended right after a comma: the last field is empty.
    row.push("");
    rows.push(row);
  }
  return rows;
}

const BOM = 0xfe_ff;
const TRAILING_CR = /\r$/;

/** The index of the comma or line feed at or after `start`, or the text's length. */
function fieldEnd(source: string, start: number): number {
  let end = start;
  while (end < source.length && source[end] !== "," && source[end] !== "\n") {
    end += 1;
  }
  return end;
}

/**
 * The CSV field that starts at `start`: its value, and the index of the
 * comma, line feed or end of text after it (a CR before the LF is
 * dropped).
 */
function readCsvField(
  source: string,
  start: number
): { end: number; value: string } {
  if (source[start] !== '"') {
    const end = fieldEnd(source, start);
    return { end, value: source.slice(start, end).replace(TRAILING_CR, "") };
  }
  let value = "";
  let index = start + 1;
  for (;;) {
    const close = source.indexOf('"', index);
    if (close === -1) {
      throw new InputError("The CSV ends inside a quoted field.");
    }
    value += source.slice(index, close);
    if (source[close + 1] !== '"') {
      return { end: fieldEnd(source, close + 1), value };
    }
    value += '"';
    index = close + 2;
  }
}

function workosCsvRecords(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) {
    throw new InputError("The WorkOS users CSV is empty.");
  }
  const columns = header.map((name) => name.trim().toLowerCase());
  const missing = CSV_COLUMNS.filter((name) => !columns.includes(name));
  if (missing.length > 0) {
    throw new InputError(
      `The WorkOS users CSV lacks the column(s) ${missing.join(", ")} (it needs ${CSV_COLUMNS.join(",")}).`
    );
  }
  return rows.map((cells, index) => {
    if (cells.length !== columns.length) {
      throw new InputError(
        `The WorkOS users CSV row ${index + 2} has ${cells.length} fields, the header ${columns.length}.`
      );
    }
    return Object.fromEntries(
      columns.map((name, column) => [name, cells[column] ?? ""])
    );
  });
}

/** The WorkOS users of a JSON or CSV export (told apart by its first character). */
export function parseWorkosUsers(text: string): WorkosUser[] {
  // `trimStart` also drops a UTF-8 BOM (U+FEFF is white space to JS).
  const trimmed = text.trimStart();
  const json = trimmed.startsWith("[") || trimmed.startsWith("{");
  const parsed = json
    ? workosJsonSchema.safeParse(parseJson("The WorkOS users file", trimmed))
    : z.array(workosUserSchema).safeParse(workosCsvRecords(text));
  if (!parsed.success) {
    throw new InputError(
      `The WorkOS users file does not match the export format (${reason(parsed.error)}).`
    );
  }
  const seen = new Set<string>();
  return parsed.data.map((row) => {
    if (seen.has(row.id)) {
      throw new InputError(`The WorkOS users file repeats the id ${row.id}.`);
    }
    seen.add(row.id);
    return {
      email: row.email,
      firstName: row.first_name,
      id: row.id,
      lastName: row.last_name,
    };
  });
}

// --- The Mux map ------------------------------------------------------------

/** A Mux asset's static rendition state (phase 8 ruling 5). */
export const RENDITION_STATES = [
  "ready",
  "preparing",
  "absent",
  "errored",
  "legacy-mp4",
] as const;
export type RenditionState = (typeof RENDITION_STATES)[number];

export const muxMapEntrySchema = z.looseObject({
  assetId: z.string().trim().min(1),
  renditions: z.enum(RENDITION_STATES).optional(),
});
export type MuxMapEntry = z.infer<typeof muxMapEntrySchema>;

export const muxMapSchema = z.record(z.string().min(1), muxMapEntrySchema);
/** `playbackId → { assetId, renditions }`. */
export type MuxMap = ReadonlyMap<string, MuxMapEntry>;

export function parseMuxMap(text: string): MuxMap {
  const parsed = muxMapSchema.safeParse(parseJson("mux-map.json", text));
  if (!parsed.success) {
    throw new InputError(
      `mux-map.json does not match { "<playbackId>": { "assetId": "…" } } (${reason(parsed.error)}).`
    );
  }
  return new Map(
    Object.entries(parsed.data).sort(([a], [b]) => (a < b ? -1 : 1))
  );
}

// --- The overlay overrides ------------------------------------------------

export const overlayOverridesSchema = z.record(
  z.string().min(1),
  displayNameSchema
);
/** Sponsorship legacy id → the display name that replaces its `overlayText`. */
export type OverlayOverrides = ReadonlyMap<string, string>;

export function parseOverlayOverrides(text: string): OverlayOverrides {
  const parsed = overlayOverridesSchema.safeParse(
    parseJson("overlay-overrides.json", text)
  );
  if (!parsed.success) {
    throw new InputError(
      `overlay-overrides.json maps each sponsorship legacy id to a display name of 1..35 characters on one line (${reason(parsed.error)}).`
    );
  }
  return new Map(
    Object.entries(parsed.data).sort(([a], [b]) => (a < b ? -1 : 1))
  );
}
