/**
 * `@smog/translation/contract` (phase 10b task 4): the translation screens'
 * procedures, mounted as `translation` in `@smog/api`'s `appContract`.
 *
 * Who may call what (`packages/api/test/authz.test.ts` lists each):
 * - the strings, the language list and the coverage need the `translator`
 *   role (an `admin` passes: `UNAUTHORIZED` for guests, `FORBIDDEN` for
 *   everybody else, the roles read from D1 on every request);
 * - creating or changing a language needs the `admin` role.
 * Every mutation writes its audit entry in the same D1 batch as the change
 * and then bumps `i18n:version` (the runtime catalogue's cache key), so an
 * edit shows without a deploy.
 */
import type { AdminProcedures } from "@smog/admin/contract";
import { baseContract } from "@smog/rpc/contract";
import {
  audioDeleteInputSchema,
  audioDeleteResultSchema,
  audioFinalizeInputSchema,
  audioListInputSchema,
  audioListSchema,
  audioRowSchema,
  audioUploadInputSchema,
  audioUploadResultSchema,
  coverageSchema,
  importPlanSchema,
  languageConflictDataSchema,
  languageCreateInputSchema,
  languageInvalidStateDataSchema,
  languageRowSchema,
  languagesListSchema,
  languageUpdateInputSchema,
  stringConflictDataSchema,
  stringSaveInputSchema,
  stringSaveResultSchema,
  stringsExportInputSchema,
  stringsExportResultSchema,
  stringsImportInputSchema,
  stringsImportResultSchema,
  stringsListInputSchema,
  stringsPageSchema,
} from "../schema";

const saveContract = baseContract.errors({
  CONFLICT: { data: stringConflictDataSchema, status: 409 },
});

const languageCreateContract = baseContract.errors({
  CONFLICT: { data: languageConflictDataSchema, status: 409 },
});

const languageUpdateContract = baseContract.errors({
  INVALID_STATE: { data: languageInvalidStateDataSchema, status: 409 },
});

export const translationSlice = {
  /** Translation coverage per enabled language (translator or admin). */
  coverage: baseContract.output(coverageSchema),
  /**
   * A gesture's spoken name, one clip per language (translator or admin;
   * phase 10b ruling 6): `uploadAudio` issues the presigned PUT (`NOT_FOUND`
   * for an unknown gesture or a language that is not enabled), the browser
   * uploads, `finalizeAudio` reads the object and records it. A refused
   * object is deleted: `VALIDATION`, field `file`: `missing`, `tooLarge`,
   * `format` (not an MP3 or M4A by its bytes), `duration` (over 10 s),
   * `key`. The previous clip of the language is removed.
   */
  deleteAudio: baseContract
    .input(audioDeleteInputSchema)
    .output(audioDeleteResultSchema),
  finalizeAudio: baseContract
    .input(audioFinalizeInputSchema)
    .output(audioRowSchema),
  languages: {
    /** Admin only. `CONFLICT exists` for a taken code. A new language shows the default language's text until translated. */
    create: languageCreateContract
      .input(languageCreateInputSchema)
      .output(languageRowSchema),
    /** Every language, enabled or not, in menu order (translator or admin). */
    list: baseContract.output(languagesListSchema),
    /**
     * Admin only. `NOT_FOUND` for an unknown code, `INVALID_STATE
     * defaultLanguage` for disabling the default language, `VALIDATION`
     * for an empty patch.
     */
    update: languageUpdateContract
      .input(languageUpdateInputSchema)
      .output(languageRowSchema),
  },
  listAudio: baseContract.input(audioListInputSchema).output(audioListSchema),
  strings: {
    /** The catalogue as a file, for one language or all enabled ones (read). */
    export: baseContract
      .input(stringsExportInputSchema)
      .output(stringsExportResultSchema),
    /**
     * Writes an import file: only the rows the preview marks as changes
     * (an invalid row is skipped, and counted). `VALIDATION` for a file
     * that cannot be read. One audit entry with the row count.
     */
    import: baseContract
      .input(stringsImportInputSchema)
      .output(stringsImportResultSchema),
    /** One page of the strings table with its filters. */
    list: baseContract.input(stringsListInputSchema).output(stringsPageSchema),
    /**
     * Dry run of an import: what it would add, change and refuse, writes
     * nothing. `VALIDATION` for a file that cannot be read.
     */
    preview: baseContract
      .input(stringsImportInputSchema)
      .output(importPlanSchema),
    /**
     * Saves one text (or, with `value: null`, removes the override).
     * `NOT_FOUND` for an unknown key, a language that is not enabled or a
     * plural form it does not use; `VALIDATION` (field `value`: `empty`,
     * `tooLong`, `placeholders`); `CONFLICT stale` when the text changed
     * since `expectedUpdatedAt`, with the stored cell.
     */
    save: saveContract
      .input(stringSaveInputSchema)
      .output(stringSaveResultSchema),
  },
  uploadAudio: baseContract
    .input(audioUploadInputSchema)
    .output(audioUploadResultSchema),
};

export type TranslationContract = typeof translationSlice;

/** Every procedure with its kind (reads write nothing, mutations build their audit entry). */
const KINDS = {
  coverage: "read",
  deleteAudio: {
    audit: "translation.audio_delete",
    noop: "deleting a clip that is not there changes nothing",
  },
  finalizeAudio: { audit: "translation.audio_upload" },
  "languages.create": { audit: "language.create" },
  "languages.list": "read",
  "languages.update": {
    audit: "language.update",
    noop: "asking for what is stored changes nothing",
  },
  listAudio: "read",
  "strings.export": "read",
  "strings.import": {
    audit: "translation.string_import",
    noop: "a file with nothing to change writes nothing",
  },
  "strings.list": "read",
  "strings.preview": "read",
  "strings.save": {
    audit: "translation.string_save",
    noop: "saving the stored text again changes nothing",
  },
  uploadAudio: "read",
} as const satisfies AdminProcedures<TranslationContract>;

/** The kinds by full path (`translation.strings.save`), as `adminGuard` looks them up. */
export const TRANSLATION_PROCEDURE_KINDS: Readonly<
  Record<string, AdminProcedures<TranslationContract>[keyof typeof KINDS]>
> = Object.fromEntries(
  Object.entries(KINDS).map(([path, kind]) => [`translation.${path}`, kind])
);
