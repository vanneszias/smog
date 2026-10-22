/** `translation.languages.*` and `translation.coverage` (phase 10b task 4). */
import { language } from "@smog/db";
import type { Db } from "@smog/db/client";
import { bumpI18nVersion } from "@smog/i18n/server";
import { markUnchanged } from "@smog/rpc/audit";
import { eq, sql } from "drizzle-orm";
import type { LanguageRow, LanguageUpdateInput } from "../schema";
import { auditStatement } from "./audit";
import { coverageOf } from "./model";
import { adminOnlyProcedure, translatorProcedure } from "./procedure";
import {
  defaultCodeOf,
  enabledOf,
  readLanguages,
  readOverrides,
  type StoredLanguage,
} from "./store";

const UNIQUE_VIOLATION = /UNIQUE constraint failed/i;

function invalid(field: string, code: string) {
  return {
    data: { fieldErrors: { [field]: [code] }, formErrors: [] as string[] },
  };
}

/** The canonical form of a BCP-47 tag, or `null` when it is not one. */
function canonicalTag(tag: string): string | null {
  try {
    return Intl.getCanonicalLocales(tag)[0] ?? null;
  } catch {
    return null;
  }
}

function toRow(row: StoredLanguage): LanguageRow {
  return {
    code: row.code,
    enabled: row.enabled,
    intlTag: row.intlTag,
    isDefault: row.isDefault,
    name: row.name,
    sortOrder: row.sortOrder,
  };
}

async function readOne(db: Db, code: string): Promise<LanguageRow | null> {
  const found = (await readLanguages(db)).find((item) => item.code === code);
  return found ? toRow(found) : null;
}

type LanguagePatch = Partial<
  Pick<LanguageRow, "enabled" | "intlTag" | "name" | "sortOrder">
>;

type Diff =
  | { kind: "defaultDisabled" }
  | { kind: "empty" }
  | { kind: "invalidTag" }
  | { kind: "patch"; patch: LanguagePatch };

/** What an update changes, or why it cannot. */
function diffLanguage(input: LanguageUpdateInput, current: LanguageRow): Diff {
  const { enabled, intlTag, name, sortOrder } = input;
  if (
    enabled === undefined &&
    intlTag === undefined &&
    name === undefined &&
    sortOrder === undefined
  ) {
    return { kind: "empty" };
  }
  const tag = intlTag === undefined ? current.intlTag : canonicalTag(intlTag);
  if (tag === null) {
    return { kind: "invalidTag" };
  }
  if (enabled === false && current.isDefault) {
    return { kind: "defaultDisabled" };
  }
  const patch: LanguagePatch = {};
  if (name !== undefined && name !== current.name) {
    patch.name = name;
  }
  if (tag !== current.intlTag) {
    patch.intlTag = tag;
  }
  if (sortOrder !== undefined && sortOrder !== current.sortOrder) {
    patch.sortOrder = sortOrder;
  }
  if (enabled !== undefined && enabled !== current.enabled) {
    patch.enabled = enabled;
  }
  return { kind: "patch", patch };
}

/** The `languages` and `coverage` parts of the translation router. */
export function languagesRoutes() {
  return {
    coverage: translatorProcedure.coverage.handler(async ({ context }) => {
      const languages = await readLanguages(context.db);
      return {
        languages: coverageOf(
          await readOverrides(context.db),
          enabledOf(languages),
          defaultCodeOf(languages)
        ),
      };
    }),
    languages: {
      create: adminOnlyProcedure.languages.create.handler(
        async ({ context, errors, input }) => {
          const { db } = context;
          const { code } = input;
          if (canonicalTag(code) !== code) {
            throw errors.VALIDATION(invalid("code", "invalid"));
          }
          const intlTag = canonicalTag(input.intlTag);
          if (!intlTag) {
            throw errors.VALIDATION(invalid("intlTag", "invalid"));
          }
          if (await readOne(db, code)) {
            throw errors.CONFLICT({ data: { reason: "exists" } });
          }
          try {
            await db.batch([
              db.insert(language).values({
                code,
                enabled: input.enabled,
                intlTag,
                isDefault: false,
                name: input.name,
                sortOrder:
                  input.sortOrder ??
                  sql<number>`(SELECT coalesce(max(${language.sortOrder}), 0) + 1 FROM ${language})`,
              }),
              auditStatement(db, {
                action: "language.create",
                actorId: context.user.id,
                data: {
                  code,
                  enabled: input.enabled,
                  intlTag,
                  name: input.name,
                },
                targetId: code,
                targetType: "language",
              }),
            ]);
          } catch (error) {
            if (UNIQUE_VIOLATION.test(String(error))) {
              throw errors.CONFLICT({ data: { reason: "exists" } });
            }
            console.error("[translation] Failed to create a language:", error);
            throw error;
          }
          await bumpI18nVersion(context.kv);
          const created = await readOne(db, code);
          if (!created) {
            throw new Error(
              `[translation] Failed to read back the language ${code}`
            );
          }
          return created;
        }
      ),
      list: translatorProcedure.languages.list.handler(async ({ context }) => ({
        items: (await readLanguages(context.db)).map(toRow),
      })),
      update: adminOnlyProcedure.languages.update.handler(
        async ({ context, errors, input }) => {
          const { db } = context;
          const current = await readOne(db, input.code);
          if (!current) {
            throw errors.NOT_FOUND();
          }
          const diff = diffLanguage(input, current);
          if (diff.kind === "empty") {
            throw errors.VALIDATION(invalid("code", "emptyPatch"));
          }
          if (diff.kind === "invalidTag") {
            throw errors.VALIDATION(invalid("intlTag", "invalid"));
          }
          if (diff.kind === "defaultDisabled") {
            throw errors.INVALID_STATE({ data: { reason: "defaultLanguage" } });
          }
          const [first, ...rest] = Object.keys(
            diff.patch
          ) as (keyof LanguagePatch)[];
          if (!first) {
            markUnchanged(db);
            return current;
          }
          try {
            await db.batch([
              db
                .update(language)
                .set(diff.patch)
                .where(eq(language.code, input.code)),
              auditStatement(db, {
                action: "language.update",
                actorId: context.user.id,
                data: { fields: [first, ...rest] },
                targetId: input.code,
                targetType: "language",
              }),
            ]);
          } catch (error) {
            console.error("[translation] Failed to update a language:", error);
            throw error;
          }
          await bumpI18nVersion(context.kv);
          const updated = await readOne(db, input.code);
          if (!updated) {
            throw new Error(
              `[translation] Failed to read back the language ${input.code}`
            );
          }
          return updated;
        }
      ),
    },
  };
}
