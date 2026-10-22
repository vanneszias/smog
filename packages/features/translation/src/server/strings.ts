/** `translation.strings.*` (phase 10b task 4): the strings table, a save, the import and the export. */
import { jsonList, type Statement, uiString } from "@smog/db";
import type { Db } from "@smog/db/client";
import { bumpI18nVersion } from "@smog/i18n/server";
import { markUnchanged } from "@smog/rpc/audit";
import { sql } from "drizzle-orm";
import type { StringRow, StringsListQuery, StringsPage } from "../schema";
import { auditStatement } from "./audit";
import {
  buildExport,
  type ImportContext,
  ImportFileError,
  type PlannedWrite,
  parseImport,
  planImport,
} from "./import-export";
import { catalogueKeys, fold, hasStatus, rowMatches, rowOf } from "./model";
import { translatorProcedure } from "./procedure";
import { saveString } from "./save";
import {
  defaultCodeOf,
  enabledOf,
  readLanguages,
  readOverrides,
} from "./store";

/** Rows per `INSERT ... SELECT json_each` statement (one bound parameter of about 60 KB). */
const IMPORT_CHUNK = 400;

function invalid(field: string, code: string) {
  return {
    data: { fieldErrors: { [field]: [code] }, formErrors: [] as string[] },
  };
}

/** What the import and export read: the enabled languages, the default one and every stored text. */
async function readContext(db: Db): Promise<ImportContext> {
  const languages = await readLanguages(db);
  return {
    defaultCode: defaultCodeOf(languages),
    languages: enabledOf(languages),
    overrides: await readOverrides(db),
  };
}

/** The strings table: filter, then page (the model is built once per call). */
async function listStrings(
  db: Db,
  query: StringsListQuery
): Promise<StringsPage> {
  const { defaultCode, languages, overrides } = await readContext(db);
  const codes = languages.map((item) => item.code);
  const keys = catalogueKeys(codes);
  const needle = query.search ? fold(query.search) : null;
  const matching: StringRow[] = [];
  for (const info of keys) {
    if (query.namespace && info.namespace !== query.namespace) {
      continue;
    }
    const row = rowOf(overrides, languages, defaultCode, info);
    const statusOk =
      !query.status || hasStatus(row, query.status, query.locale);
    if (statusOk && (needle === null || rowMatches(row, needle))) {
      matching.push(row);
    }
  }
  return {
    items: matching.slice(query.offset, query.offset + query.limit),
    languages: codes,
    namespaces: [...new Set(keys.map((info) => info.namespace))],
    offset: query.offset,
    total: matching.length,
  };
}

/** The upserts of an import: chunks of one `json_each` statement each (D1 binds at most 100 parameters). */
function importStatements(
  db: Db,
  writes: readonly PlannedWrite[],
  actorId: string,
  now: Date
) {
  const statements: Statement[] = [];
  for (let start = 0; start < writes.length; start += IMPORT_CHUNK) {
    const chunk = writes.slice(start, start + IMPORT_CHUNK).map((write) => ({
      h: write.sourceHash,
      k: write.key,
      l: write.locale,
      v: write.value,
    }));
    statements.push(
      db
        .insert(uiString)
        // `WHERE true`: SQLite would read `ON CONFLICT` as a join constraint.
        .select(
          sql`SELECT json_extract(j.value, '$.l'), json_extract(j.value, '$.k'), json_extract(j.value, '$.v'), json_extract(j.value, '$.h'), ${actorId}, ${now.getTime()} FROM json_each(${jsonList(chunk)}) AS j WHERE true`
        )
        .onConflictDoUpdate({
          set: {
            sourceHash: sql`excluded.source_hash`,
            updatedAt: sql`excluded.updated_at`,
            updatedBy: sql`excluded.updated_by`,
            value: sql`excluded.value`,
          },
          target: [uiString.locale, uiString.key],
        })
    );
  }
  return statements;
}

/** The `strings` slice of the translation router. */
export function stringsRoutes() {
  return {
    export: translatorProcedure.strings.export.handler(
      async ({ context, errors, input }) => {
        const read = await readContext(context.db);
        if (
          input.locale &&
          !read.languages.some((item) => item.code === input.locale)
        ) {
          throw errors.NOT_FOUND();
        }
        return buildExport(input.format, input.locale, read);
      }
    ),
    import: translatorProcedure.strings.import.handler(
      async ({ context, errors, input }) => {
        const { db } = context;
        const read = await readContext(db);
        let planned: ReturnType<typeof planImport>;
        try {
          planned = planImport(
            parseImport(
              input.format,
              input.content,
              input.locale,
              new Set(read.languages.map((item) => item.code))
            ),
            read
          );
        } catch (error) {
          if (error instanceof ImportFileError) {
            throw errors.VALIDATION(invalid("content", error.code));
          }
          throw error;
        }
        const { skipped, writes } = planned;
        if (writes.length === 0) {
          markUnchanged(db);
          return { applied: 0, skipped };
        }
        const touched = [...new Set(writes.map((write) => write.locale))];
        const audit = auditStatement(db, {
          action: "translation.string_import",
          actorId: context.user.id,
          data: { applied: writes.length, format: input.format, skipped },
          targetId: touched.length === 1 ? (touched[0] ?? null) : null,
          targetType: "ui_string",
        });
        try {
          await db.batch([
            audit,
            ...importStatements(db, writes, context.user.id, new Date()),
          ]);
        } catch (error) {
          console.error("[translation] Failed to apply an import:", error);
          throw error;
        }
        await bumpI18nVersion(context.kv);
        return { applied: writes.length, skipped };
      }
    ),
    list: translatorProcedure.strings.list.handler(({ context, input }) =>
      listStrings(context.db, input)
    ),
    preview: translatorProcedure.strings.preview.handler(
      async ({ context, errors, input }) => {
        const read = await readContext(context.db);
        try {
          return planImport(
            parseImport(
              input.format,
              input.content,
              input.locale,
              new Set(read.languages.map((item) => item.code))
            ),
            read
          ).plan;
        } catch (error) {
          if (error instanceof ImportFileError) {
            throw errors.VALIDATION(invalid("content", error.code));
          }
          throw error;
        }
      }
    ),
    save: translatorProcedure.strings.save.handler(
      async ({ context, errors, input }) => {
        const outcome = await saveString(
          { actorId: context.user.id, db: context.db },
          input
        );
        switch (outcome.kind) {
          case "notFound":
            throw errors.NOT_FOUND();
          case "invalid":
            throw errors.VALIDATION(invalid("value", outcome.code));
          case "conflict":
            throw errors.CONFLICT({
              data: { current: outcome.current, reason: "stale" },
            });
          case "unchanged":
            return { cell: outcome.cell, key: input.key, locale: input.locale };
          default:
            await bumpI18nVersion(context.kv);
            return { cell: outcome.cell, key: input.key, locale: input.locale };
        }
      }
    ),
  };
}
