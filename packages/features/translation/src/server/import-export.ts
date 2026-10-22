/**
 * Import and export of the interface strings (phase 10b task 4): JSON and
 * CSV, one language or all, and the dry-run planner that checks every row
 * (known key, enabled language, plural form in use, placeholders, length)
 * before anything is written. Pure: no D1, the overrides come in as data.
 *
 * Files:
 * - JSON, one language: `{ "auth.errors.generic": "..." }` or the nested
 *   shape of the shipped catalogue; the language is the request's `locale`.
 * - JSON, all languages: `{ "nl": { ... }, "fr": { ... } }`.
 * - CSV: a `key` column and one column per language code; a `source`
 *   column (the default language's text, in a single-language export) is
 *   context and ignored. With a `locale` only that column is read.
 * A blank value is "no translation", never a revert.
 */
import {
  flattenMessages,
  type MessageTree,
  validateTranslation,
} from "@smog/i18n";
import {
  IMPORT_LIST_MAX,
  type ImportChange,
  type ImportPlan,
  type ImportProblemRow,
  type StringFormat,
  type StringsExportResult,
} from "../schema";
import { BOM, CsvError, fromCsvCell, parseCsv, toCsvCell } from "./csv";
import {
  catalogueKeys,
  cellOf,
  isApplicable,
  type KeyInfo,
  type ModelLanguage,
  type Overrides,
  sourceHash,
  sourceOf,
} from "./model";

export type ImportFileProblem =
  /** Not valid JSON, or not an object. */
  | "invalidJson"
  /** A CSV that does not parse (an unclosed quote). */
  | "invalidCsv"
  /** CSV without a `key` column. */
  | "noKeyColumn"
  /** CSV without a column for the chosen language, or with no language column. */
  | "noLanguageColumn"
  /** A column or a JSON section for a language that is not enabled. */
  | "unknownLanguage"
  /** A JSON file whose values are neither text nor a nested object. */
  | "unsupportedShape"
  /** A JSON file that is not one language's texts was sent without saying which language it is for. */
  | "needsLanguage";

/** A file that cannot be read at all (the procedure answers `VALIDATION` with this code). */
export class ImportFileError extends Error {
  readonly code: ImportFileProblem;

  constructor(code: ImportFileProblem, options?: { cause: unknown }) {
    super(`[translation] The import file is not usable: ${code}`, options);
    this.code = code;
    this.name = "ImportFileError";
  }
}

/** One text of a file. */
export interface ImportEntry {
  key: string;
  locale: string;
  value: string;
}

interface Column {
  index: number;
  locale: string;
}

/** The language columns of a CSV header (`key` and `source` are not languages). */
function languageColumns(
  names: readonly string[],
  locale: string | undefined,
  enabled: ReadonlySet<string>
): Column[] {
  const columns: Column[] = [];
  for (const [index, name] of names.entries()) {
    if (name === "key" || name === "source" || name === "") {
      continue;
    }
    if (locale !== undefined && name !== locale) {
      continue;
    }
    if (!enabled.has(name)) {
      throw new ImportFileError("unknownLanguage");
    }
    columns.push({ index, locale: name });
  }
  if (columns.length === 0) {
    throw new ImportFileError("noLanguageColumn");
  }
  return columns;
}

function csvEntries(
  content: string,
  locale: string | undefined,
  enabled: ReadonlySet<string>
): ImportEntry[] {
  let table: string[][];
  try {
    table = parseCsv(content);
  } catch (error) {
    if (error instanceof CsvError) {
      throw new ImportFileError("invalidCsv", { cause: error });
    }
    throw error;
  }
  const [header, ...rows] = table;
  const names = (header ?? []).map((name) => name.trim());
  const keyColumn = names.indexOf("key");
  if (keyColumn === -1) {
    throw new ImportFileError("noKeyColumn");
  }
  const columns = languageColumns(names, locale, enabled);
  return rows.flatMap((row) => {
    const key = (row[keyColumn] ?? "").trim();
    return key === ""
      ? []
      : columns.map((column) => ({
          key,
          locale: column.locale,
          value: fromCsvCell(row[column.index] ?? ""),
        }));
  });
}

function isTree(value: unknown): value is MessageTree {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Throws unless every leaf of `node` is text. */
function assertStrings(node: unknown): void {
  if (typeof node === "string") {
    return;
  }
  if (!isTree(node)) {
    throw new ImportFileError("unsupportedShape");
  }
  for (const value of Object.values(node)) {
    assertStrings(value);
  }
}

function treeEntries(tree: MessageTree, locale: string): ImportEntry[] {
  assertStrings(tree);
  return Object.entries(flattenMessages(tree)).map(([key, value]) => ({
    key,
    locale,
    value,
  }));
}

function parseJson(content: string): MessageTree {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new ImportFileError("invalidJson", { cause: error });
  }
  if (!isTree(parsed)) {
    throw new ImportFileError("invalidJson");
  }
  return parsed;
}

function jsonEntries(
  content: string,
  locale: string | undefined,
  enabled: ReadonlySet<string>
): ImportEntry[] {
  const parsed = parseJson(content);
  if (locale) {
    return treeEntries(parsed, locale);
  }
  // Without a language the top level must be language sections.
  const sections = Object.entries(parsed).filter(
    (section): section is [string, MessageTree] => isTree(section[1])
  );
  if (sections.length === 0 || sections.length !== Object.keys(parsed).length) {
    throw new ImportFileError("needsLanguage");
  }
  return sections.flatMap(([code, section]) => {
    if (!enabled.has(code)) {
      throw new ImportFileError("unknownLanguage");
    }
    return treeEntries(section, code);
  });
}

/** The entries of an import file. Throws `ImportFileError` for a file that cannot be read. */
export function parseImport(
  format: StringFormat,
  content: string,
  locale: string | undefined,
  enabled: ReadonlySet<string>
): ImportEntry[] {
  if (locale && !enabled.has(locale)) {
    throw new ImportFileError("unknownLanguage");
  }
  return format === "csv"
    ? csvEntries(content, locale, enabled)
    : jsonEntries(content, locale, enabled);
}

/** A write the plan holds: the row to upsert. */
export interface PlannedWrite {
  key: string;
  locale: string;
  sourceHash: string | null;
  value: string;
}

export interface ImportContext {
  defaultCode: string;
  languages: readonly ModelLanguage[];
  overrides: Overrides;
}

type Verdict =
  | { problem: ImportProblemRow["problem"]; kind: "problem" }
  | { kind: "empty" }
  | { kind: "unchanged" }
  | { before: string | null; kind: "write"; write: PlannedWrite };

/** What one entry of a file comes to, given the catalogue and the stored texts. */
function judge(
  entry: ImportEntry,
  language: ModelLanguage | undefined,
  info: KeyInfo | undefined,
  { defaultCode, overrides }: ImportContext
): Verdict {
  if (!language) {
    return { kind: "problem", problem: "unknownLanguage" };
  }
  if (!info) {
    return { kind: "problem", problem: "unknownKey" };
  }
  if (!isApplicable(info, entry.locale)) {
    return { kind: "problem", problem: "notApplicable" };
  }
  if (entry.value.trim() === "") {
    return { kind: "empty" };
  }
  const source = sourceOf(overrides, defaultCode, info);
  const [issue] = validateTranslation(
    language.isDefault ? entry.value : source,
    entry.value
  ).issues;
  if (issue) {
    return {
      kind: "problem",
      problem: issue.code === "tooLong" ? "tooLong" : "placeholders",
    };
  }
  const before = cellOf(overrides, language, info, source).value;
  if (before === entry.value) {
    return { kind: "unchanged" };
  }
  return {
    before,
    kind: "write",
    write: {
      key: entry.key,
      locale: entry.locale,
      sourceHash: language.isDefault ? null : sourceHash(source),
      value: entry.value,
    },
  };
}

/**
 * Checks every entry against the catalogue and the stored texts. The plan
 * (for the preview) and the writes (for the apply) come from the same pass,
 * so what the preview shows is what the apply writes. A key and language
 * twice in the file count once (the first), the rest are `duplicate`.
 */
export function planImport(
  entries: readonly ImportEntry[],
  context: ImportContext
): { plan: ImportPlan; skipped: number; writes: PlannedWrite[] } {
  const byCode = new Map(
    context.languages.map((language) => [language.code, language])
  );
  const keys = new Map<string, KeyInfo>(
    catalogueKeys(context.languages.map((language) => language.code)).map(
      (info) => [info.key, info]
    )
  );
  const seen = new Set<string>();
  const changes: ImportChange[] = [];
  const problems: ImportProblemRow[] = [];
  const writes: PlannedWrite[] = [];
  const codes = new Set<string>();
  const counts = { added: 0, changed: 0, problems: 0, unchanged: 0 };

  for (const entry of entries) {
    const id = `${entry.locale}\u0000${entry.key}`;
    const duplicate = seen.has(id);
    seen.add(id);
    const verdict: Verdict = duplicate
      ? { kind: "problem", problem: "duplicate" }
      : judge(entry, byCode.get(entry.locale), keys.get(entry.key), context);
    if (byCode.has(entry.locale)) {
      codes.add(entry.locale);
    }
    if (verdict.kind === "problem") {
      counts.problems += 1;
      if (problems.length < IMPORT_LIST_MAX) {
        problems.push({
          key: entry.key,
          locale: entry.locale,
          problem: verdict.problem,
        });
      }
    } else if (verdict.kind === "unchanged") {
      counts.unchanged += 1;
    } else if (verdict.kind === "write") {
      counts[verdict.before === null ? "added" : "changed"] += 1;
      writes.push(verdict.write);
      if (changes.length < IMPORT_LIST_MAX) {
        changes.push({
          after: entry.value,
          before: verdict.before,
          key: entry.key,
          locale: entry.locale,
        });
      }
    }
  }
  return {
    plan: {
      added: counts.added,
      changed: counts.changed,
      changes,
      languages: [...codes],
      problemCount: counts.problems,
      problems,
      unchanged: counts.unchanged,
    },
    skipped: counts.problems,
    writes,
  };
}

interface Texts {
  code: string;
  texts: [string, string][];
}

/** The texts one language shows now, in key order. */
function textsOf(
  language: ModelLanguage,
  keys: readonly KeyInfo[],
  { defaultCode, overrides }: ImportContext
): Texts {
  const texts: [string, string][] = [];
  for (const info of keys) {
    if (!isApplicable(info, language.code)) {
      continue;
    }
    const source = sourceOf(overrides, defaultCode, info);
    const { value } = cellOf(overrides, language, info, source);
    if (value !== null) {
      texts.push([info.key, value]);
    }
  }
  return { code: language.code, texts };
}

function jsonExport(
  locale: string | undefined,
  perLanguage: readonly Texts[]
): StringsExportResult["content"] {
  const body = locale
    ? Object.fromEntries(perLanguage[0]?.texts ?? [])
    : Object.fromEntries(
        perLanguage.map((item) => [item.code, Object.fromEntries(item.texts)])
      );
  return `${JSON.stringify(body, null, 2)}\n`;
}

function csvExport(
  locale: string | undefined,
  perLanguage: readonly Texts[],
  keys: readonly KeyInfo[],
  context: ImportContext
): StringsExportResult["content"] {
  // One language other than the default: its text beside the source for context.
  const single = locale !== undefined && locale !== context.defaultCode;
  const columns = single
    ? ["source", locale]
    : perLanguage.map((item) => item.code);
  const lookups = perLanguage.map((item) => new Map(item.texts));
  const lines: string[][] = [["key", ...columns]];
  for (const info of keys) {
    const cells = lookups.map((lookup) => lookup.get(info.key) ?? "");
    if (single) {
      lines.push([
        info.key,
        sourceOf(context.overrides, context.defaultCode, info),
        ...cells,
      ]);
    } else if (cells.some((cell) => cell !== "")) {
      lines.push([info.key, ...cells]);
    }
  }
  const body = lines.map((line) => line.map(toCsvCell).join(",")).join("\r\n");
  return `${BOM}${body}\r\n`;
}

/** The file of an export: the texts each language shows now. */
export function buildExport(
  format: StringFormat,
  locale: string | undefined,
  context: ImportContext
): StringsExportResult {
  const chosen = locale
    ? context.languages.filter((language) => language.code === locale)
    : context.languages;
  const keys = catalogueKeys(
    context.languages.map((language) => language.code)
  );
  const perLanguage = chosen.map((language) =>
    textsOf(language, keys, context)
  );
  const rows = perLanguage.reduce((sum, item) => sum + item.texts.length, 0);
  const name = locale ?? "all";
  return format === "json"
    ? {
        content: jsonExport(locale, perLanguage),
        contentType: "application/json; charset=utf-8",
        filename: `smog-strings-${name}.json`,
        rows,
      }
    : {
        content: csvExport(locale, perLanguage, keys, context),
        contentType: "text/csv; charset=utf-8",
        filename: `smog-strings-${name}.csv`,
        rows,
      };
}
