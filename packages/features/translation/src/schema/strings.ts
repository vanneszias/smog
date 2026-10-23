/**
 * The interface strings screen's shapes (phase 10b task 4): the table rows
 * (key, source, one cell per enabled language), a save, the export and the
 * import with its dry-run diff. Client-safe.
 */
import { localeCodeSchema } from "@smog/config/locale";
import { UI_STRING_MAX_LENGTH } from "@smog/i18n";
import { z } from "zod";

export const STRINGS_PAGE_DEFAULT = 100;
export const STRINGS_PAGE_MAX = 200;
export const STRINGS_SEARCH_MAX = 100;
/** The longest dotted key (`ui_string.key`). */
export const STRING_KEY_MAX = 200;
/** An import file over this many characters is refused (the whole catalogue of every language is about 0.6 MB). */
export const IMPORT_MAX_CHARS = 2_000_000;
/** The problems and changes an import preview lists (the counts are always complete). */
export const IMPORT_LIST_MAX = 200;

export const STRING_FORMATS = ["json", "csv"] as const;
export type StringFormat = (typeof STRING_FORMATS)[number];

/** What is wrong with a value: `validateTranslation`'s issues. */
export const stringIssueSchema = z.discriminatedUnion("code", [
  z.object({ code: z.literal("empty") }),
  z.object({ code: z.literal("tooLong"), max: z.number().int() }),
  z.object({
    code: z.literal("placeholders"),
    extra: z.array(z.string()),
    missing: z.array(z.string()),
  }),
]);
export type StringIssue = z.infer<typeof stringIssueSchema>;

/** One language's text of a key. */
export const stringCellSchema = z.object({
  /** `false` for a plural form the language does not use (shown as a dash). */
  applicable: z.boolean(),
  issues: z.array(stringIssueSchema),
  missing: z.boolean(),
  /** A `ui_string` row exists (Revert is possible). */
  overridden: z.boolean(),
  /** The default-language source changed since this was translated. */
  stale: z.boolean(),
  /** Epoch ms of the row; the `CONFLICT` token of a save. `null` without a row. */
  updatedAt: z.number().int().nullable(),
  /** What the language shows now (the override, else the shipped text); `null` when missing. */
  value: z.string().nullable(),
});
export type StringCell = z.infer<typeof stringCellSchema>;

export const stringRowSchema = z.object({
  /** One cell per enabled language. */
  cells: z.record(z.string(), stringCellSchema),
  key: z.string(),
  namespace: z.string(),
  /** The default language's text (a plural form it lacks shows its `_other`). */
  source: z.string(),
});
export type StringRow = z.infer<typeof stringRowSchema>;

export const STRING_STATUSES = ["missing", "stale", "invalid"] as const;
export type StringStatus = (typeof STRING_STATUSES)[number];

export const stringsListInputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(STRINGS_PAGE_MAX)
    .default(STRINGS_PAGE_DEFAULT),
  /** With `status`: that language; without `locale`: any enabled language. */
  locale: localeCodeSchema.optional(),
  /** The first segment of the key (`auth`, `admin`, ...). */
  namespace: z.string().min(1).max(STRING_KEY_MAX).optional(),
  offset: z.number().int().min(0).default(0),
  /** A substring of the key or of any text, ignoring case and accents. */
  search: z.string().trim().min(1).max(STRINGS_SEARCH_MAX).optional(),
  status: z.enum(STRING_STATUSES).optional(),
});
export type StringsListInput = z.input<typeof stringsListInputSchema>;
export type StringsListQuery = z.output<typeof stringsListInputSchema>;

export const stringsPageSchema = z.object({
  items: z.array(stringRowSchema),
  /** The enabled language codes in menu order: the table's columns. */
  languages: z.array(z.string()),
  /** Every namespace of the catalogue (the filter's choices). */
  namespaces: z.array(z.string()),
  offset: z.number().int(),
  /** Rows matching the filters. */
  total: z.number().int(),
});
export type StringsPage = z.infer<typeof stringsPageSchema>;

/** Save one text; `value: null` removes the override (back to the shipped text). */
export const stringSaveInputSchema = z.object({
  /** The cell's `updatedAt` when it was read (`null`: no row); a different one is `CONFLICT`. */
  expectedUpdatedAt: z.number().int().nullable(),
  key: z.string().min(1).max(STRING_KEY_MAX),
  locale: localeCodeSchema,
  value: z
    .string()
    .max(UI_STRING_MAX_LENGTH * 2)
    .nullable(),
});
export type StringSaveInput = z.input<typeof stringSaveInputSchema>;

export const stringSaveResultSchema = z.object({
  cell: stringCellSchema,
  key: z.string(),
  locale: z.string(),
});
export type StringSaveResult = z.infer<typeof stringSaveResultSchema>;

/** `CONFLICT` of a save: somebody else saved this text first (`current` is what is stored now). */
export const stringConflictDataSchema = z.object({
  current: stringCellSchema,
  reason: z.literal("stale"),
});
export type StringConflictData = z.infer<typeof stringConflictDataSchema>;

/** An import that lost to a save: a text it would overwrite changed since it was read. */
export const stringImportConflictDataSchema = z.object({
  reason: z.literal("stale"),
});

export const stringsExportInputSchema = z.object({
  format: z.enum(STRING_FORMATS),
  /** One language; omitted: every enabled language. */
  locale: localeCodeSchema.optional(),
});
export type StringsExportInput = z.input<typeof stringsExportInputSchema>;

export const stringsExportResultSchema = z.object({
  content: z.string(),
  contentType: z.string(),
  filename: z.string(),
  /** Texts in the file. */
  rows: z.number().int(),
});
export type StringsExportResult = z.infer<typeof stringsExportResultSchema>;

export const stringsImportInputSchema = z.object({
  content: z.string().min(1).max(IMPORT_MAX_CHARS),
  format: z.enum(STRING_FORMATS),
  /** The language of a file that holds one (a JSON map or a CSV with one language column); omitted: the file names its languages. */
  locale: localeCodeSchema.optional(),
});
export type StringsImportInput = z.input<typeof stringsImportInputSchema>;

export const IMPORT_PROBLEMS = [
  /** The key is not in the catalogue. */
  "unknownKey",
  /** The language is not an enabled language. */
  "unknownLanguage",
  /** A plural form the language does not use. */
  "notApplicable",
  "placeholders",
  "tooLong",
  /** The same key and language twice in the file. */
  "duplicate",
] as const;
export type ImportProblem = (typeof IMPORT_PROBLEMS)[number];

export const importChangeSchema = z.object({
  after: z.string(),
  /** `null` when the language had no text. */
  before: z.string().nullable(),
  key: z.string(),
  locale: z.string(),
});
export type ImportChange = z.infer<typeof importChangeSchema>;

export const importProblemSchema = z.object({
  key: z.string(),
  locale: z.string(),
  problem: z.enum(IMPORT_PROBLEMS),
});
export type ImportProblemRow = z.infer<typeof importProblemSchema>;

/** What an import would do (the dry run), or did (apply). The lists are cut at `IMPORT_LIST_MAX`; the counts are complete. */
export const importPlanSchema = z.object({
  /** New texts (the language had none). */
  added: z.number().int(),
  changed: z.number().int(),
  changes: z.array(importChangeSchema),
  /** Languages in the file, in order. */
  languages: z.array(z.string()),
  problemCount: z.number().int(),
  problems: z.array(importProblemSchema),
  /** Texts of the file that equal what is stored. */
  unchanged: z.number().int(),
});
export type ImportPlan = z.infer<typeof importPlanSchema>;

export const stringsImportResultSchema = z.object({
  applied: z.number().int(),
  skipped: z.number().int(),
});
export type StringsImportResult = z.infer<typeof stringsImportResultSchema>;
