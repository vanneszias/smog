/** Saving or reverting one interface string (phase 10b task 4), with the `CONFLICT` rule. */
import {
  failWhen,
  ref,
  type Statement,
  toGuardFailure,
  uiString,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import { validateTranslation } from "@smog/i18n";
import { markUnchanged } from "@smog/rpc/audit";
import { and, eq, type SQL, sql } from "drizzle-orm";
import type { StringCell, StringSaveInput } from "../schema";
import { auditStatement } from "./audit";
import {
  catalogueKeys,
  cellOf,
  isApplicable,
  placeholderBase,
  sourceHash,
  sourceOf,
} from "./model";
import {
  defaultCodeOf,
  enabledOf,
  readLanguages,
  readOverrides,
} from "./store";

/** One key in one language as stored now, with what a save needs to know about it. */
interface CurrentCell {
  /** The text whose placeholders a value keeps (`placeholderBase`); `null`: free text. */
  base: string | null;
  cell: StringCell;
  isDefault: boolean;
  source: string;
}

/** The cell of one key and language as stored now; `null` for an unknown key, a language that is not enabled or a plural form it does not use. */
async function currentCell(
  db: Db,
  locale: string,
  key: string
): Promise<CurrentCell | null> {
  const languages = await readLanguages(db);
  const enabled = enabledOf(languages);
  const language = enabled.find((item) => item.code === locale);
  const info = catalogueKeys(enabled.map((item) => item.code)).find(
    (item) => item.key === key
  );
  if (!(language && info && isApplicable(info, locale))) {
    return null;
  }
  const defaultCode = defaultCodeOf(languages);
  const overrides = await readOverrides(db, {
    keys: [info.key, `${info.base}_other`],
    locales: [...new Set([locale, defaultCode])],
  });
  const source = sourceOf(overrides, defaultCode, info);
  return {
    base: placeholderBase(language, info, source),
    cell: cellOf(overrides, language, info, source),
    isDefault: language.isDefault,
    source,
  };
}

/** The guard that stops the batch when the row of (locale, key) is no longer the one the editor saw. */
function staleWhen(
  locale: string,
  key: string,
  expectedUpdatedAt: number | null
): SQL {
  const row = sql`SELECT 1 FROM ${uiString} AS s WHERE ${ref("s", uiString.locale)} = ${locale} AND ${ref("s", uiString.key)} = ${key}`;
  return expectedUpdatedAt === null
    ? sql`EXISTS (${row})`
    : sql`NOT EXISTS (${row} AND ${ref("s", uiString.updatedAt)} = ${expectedUpdatedAt})`;
}

export type SaveOutcome =
  | { cell: StringCell; kind: "saved" }
  | { cell: StringCell; kind: "unchanged" }
  | { current: StringCell; kind: "conflict" }
  | { code: "empty" | "placeholders" | "tooLong"; kind: "invalid" }
  | { kind: "notFound" };

function firstProblem(
  current: CurrentCell,
  value: string
): "empty" | "placeholders" | "tooLong" | null {
  return (
    validateTranslation(current.base ?? value, value).issues[0]?.code ?? null
  );
}

/** Runs the save's batch; `false` when the stale guard stopped it (somebody saved first). */
async function runSave(
  db: Db,
  statements: Parameters<Db["batch"]>[0]
): Promise<boolean> {
  try {
    await db.batch(statements);
    return true;
  } catch (error) {
    if (toGuardFailure(error)?.guard === "string-stale") {
      return false;
    }
    console.error("[translation] Failed to save a string:", error);
    throw error;
  }
}

interface SaveContext {
  actorId: string;
  db: Db;
}

/**
 * The text is stored already: this is a retry of a save whose
 * `i18n:version` bump failed after the commit (it answered an error).
 * Nothing to write, but the text must be published: one audited
 * "republished" entry, and the caller bumps like after a `saved`.
 */
async function republish(
  { actorId, db }: SaveContext,
  { key, locale }: StringSaveInput,
  guard: Statement
): Promise<SaveOutcome> {
  const done = await runSave(db, [
    guard,
    auditStatement(db, {
      action: "translation.string_save",
      actorId,
      data: { key, locale, republished: true },
      targetId: `${locale}:${key}`,
      targetType: "ui_string",
    }),
  ]);
  const latest = await currentCell(db, locale, key);
  if (!latest) {
    throw new Error(
      `[translation] Failed to read back the string ${locale}:${key}`
    );
  }
  return done
    ? { cell: latest.cell, kind: "saved" }
    : { current: latest.cell, kind: "conflict" };
}

/**
 * Saves (or, with `value: null`, reverts) one text. The batch holds the
 * stale guard, the write and the audit entry, so a lost race changes and
 * audits nothing. The caller bumps `i18n:version` after a `saved`.
 */
export async function saveString(
  { actorId, db }: SaveContext,
  input: StringSaveInput
): Promise<SaveOutcome> {
  const { expectedUpdatedAt, key, locale, value } = input;
  const current = await currentCell(db, locale, key);
  if (!current) {
    return { kind: "notFound" };
  }
  if (current.cell.updatedAt !== expectedUpdatedAt) {
    return { current: current.cell, kind: "conflict" };
  }
  const guard = failWhen(
    db,
    "string-stale",
    staleWhen(locale, key, expectedUpdatedAt)
  );
  const audit = { actorId, targetId: `${locale}:${key}` } as const;
  let saved: boolean;
  if (value === null) {
    if (!current.cell.overridden) {
      markUnchanged(db);
      return { cell: current.cell, kind: "unchanged" };
    }
    saved = await runSave(db, [
      guard,
      db
        .delete(uiString)
        .where(and(eq(uiString.locale, locale), eq(uiString.key, key))),
      auditStatement(db, {
        ...audit,
        action: "translation.string_save",
        data: { key, locale, reverted: true },
        targetType: "ui_string",
      }),
    ]);
  } else {
    const code = firstProblem(current, value);
    if (code) {
      return { code, kind: "invalid" };
    }
    // The text is what the language shows and no source change is pending.
    if (
      current.cell.value === value &&
      !(current.cell.overridden && current.cell.stale)
    ) {
      if (current.cell.overridden) {
        return await republish({ actorId, db }, input, guard);
      }
      markUnchanged(db);
      return { cell: current.cell, kind: "unchanged" };
    }
    const row = {
      sourceHash: current.isDefault ? null : sourceHash(current.source),
      updatedAt: new Date(),
      updatedBy: actorId,
      value,
    };
    saved = await runSave(db, [
      guard,
      db
        .insert(uiString)
        .values({ key, locale, ...row })
        .onConflictDoUpdate({
          set: row,
          target: [uiString.locale, uiString.key],
        }),
      auditStatement(db, {
        ...audit,
        action: "translation.string_save",
        data: { key, locale },
        targetType: "ui_string",
      }),
    ]);
  }
  const latest = await currentCell(db, locale, key);
  if (!latest) {
    throw new Error(
      `[translation] Failed to read back the string ${locale}:${key}`
    );
  }
  return saved
    ? { cell: latest.cell, kind: "saved" }
    : { current: latest.cell, kind: "conflict" };
}
