/**
 * `teacher.getInfo` and `teacher.saveInfo` (phase 10c task 2): a gesture's
 * private teaching text per language (`gesture_teacher_info`). A save is one
 * D1 batch: a stale-lock guard on `version`, the upsert (which bumps the
 * version: the editor's lock and part of the PDF cache fingerprint) and the
 * audit entry, which carries the language, the field names and the new
 * version, never a text.
 */
import {
  defaultLanguageCode,
  failWhen,
  GuardFailedError,
  gesture,
  gestureKeyword,
  gestureTeacherInfo,
  isEnabledLanguage,
  type Statement,
  toGuardFailure,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import { markUnchanged } from "@smog/rpc/audit";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  EMPTY_TEACHER_INFO,
  TEACHER_INFO_FIELDS,
  type TeacherInfoDetail,
  type TeacherInfoField,
  type TeacherInfoFields,
  type TeacherInfoRow,
} from "../schema";
import { auditStatement } from "./audit";
import { mayAuthor, teachingProcedure } from "./procedure";

/** The default language when none is flagged (never in a migrated database). */
const FALLBACK_DEFAULT = "nl";

type StoredRow = typeof gestureTeacherInfo.$inferSelect;

function toRow(row: StoredRow): TeacherInfoRow {
  return {
    bw: row.bw,
    cNote: row.cNote,
    gestureId: row.gestureId,
    hc: row.hc,
    locale: row.locale,
    note: row.note,
    or: row.or_,
    pl: row.pl,
    summary: row.summary,
    updatedAt: row.updatedAt.getTime(),
    version: row.version,
  };
}

async function readGesture(db: Db, id: string) {
  const [row] = await db
    .select({
      id: gesture.id,
      name: gesture.name,
      publishedAt: gesture.publishedAt,
      slug: gesture.slug,
    })
    .from(gesture)
    .where(eq(gesture.id, id))
    .limit(1);
  return row ?? null;
}

async function readRow(
  db: Db,
  gestureId: string,
  locale: string
): Promise<TeacherInfoRow | null> {
  const [row] = await db
    .select()
    .from(gestureTeacherInfo)
    .where(
      and(
        eq(gestureTeacherInfo.gestureId, gestureId),
        eq(gestureTeacherInfo.locale, locale)
      )
    )
    .limit(1);
  return row ? toRow(row) : null;
}

/** Every language's row and public C keywords of one gesture. */
async function readDetail(
  db: Db,
  found: NonNullable<Awaited<ReturnType<typeof readGesture>>>
): Promise<TeacherInfoDetail> {
  const [defaultLocale, rows, keywordRows] = await Promise.all([
    defaultLanguageCode(db),
    db
      .select()
      .from(gestureTeacherInfo)
      .where(eq(gestureTeacherInfo.gestureId, found.id)),
    db
      .select({
        keyword: gestureKeyword.keyword,
        locale: gestureKeyword.locale,
      })
      .from(gestureKeyword)
      .where(eq(gestureKeyword.gestureId, found.id))
      .orderBy(asc(gestureKeyword.locale), asc(gestureKeyword.position)),
  ]);
  const keywords: Record<string, string[]> = {};
  for (const { keyword, locale } of keywordRows) {
    keywords[locale] = [...(keywords[locale] ?? []), keyword];
  }
  return {
    defaultLocale: defaultLocale ?? FALLBACK_DEFAULT,
    gesture: {
      id: found.id,
      name: found.name,
      published: found.publishedAt !== null,
      slug: found.slug,
    },
    keywords,
    rows: Object.fromEntries(rows.map((row) => [row.locale, toRow(row)])),
  };
}

function fieldsOf(row: TeacherInfoRow | null): TeacherInfoFields {
  return row
    ? {
        bw: row.bw,
        cNote: row.cNote,
        hc: row.hc,
        note: row.note,
        or: row.or,
        pl: row.pl,
        summary: row.summary,
      }
    : EMPTY_TEACHER_INFO;
}

/** The fields whose text differs from what is stored (an absent row stores empty texts). */
function changedFields(
  stored: TeacherInfoRow | null,
  next: TeacherInfoFields
): [TeacherInfoField, ...TeacherInfoField[]] | null {
  const before = fieldsOf(stored);
  const changed = TEACHER_INFO_FIELDS.filter(
    (field) => before[field] !== next[field]
  );
  const [first, ...rest] = changed;
  return first === undefined ? null : [first, ...rest];
}

/** The guard that the row is still the one the editor read: none when it read none, else that version. */
function staleGuard(
  db: Db,
  gestureId: string,
  locale: string,
  expected: number | null
): Statement {
  const where = sql`t.gesture_id = ${gestureId} AND t.locale = ${locale}`;
  return failWhen(
    db,
    "stale",
    expected === null
      ? sql`EXISTS (SELECT 1 FROM gesture_teacher_info AS t WHERE ${where})`
      : sql`NOT EXISTS (SELECT 1 FROM gesture_teacher_info AS t WHERE ${where} AND t.version = ${expected})`
  );
}

function validation(field: string, code: string) {
  return { data: { fieldErrors: { [field]: [code] }, formErrors: [] } };
}

export function infoRoutes() {
  return {
    getInfo: teachingProcedure.getInfo.handler(
      async ({ context, errors, input }) => {
        const found = await readGesture(context.db, input.gestureId);
        if (!found) {
          throw errors.NOT_FOUND();
        }
        return await readDetail(context.db, found);
      }
    ),
    saveInfo: teachingProcedure.saveInfo.handler(
      async ({ context, errors, input }) => {
        const { db } = context;
        const defaultLocale =
          (await defaultLanguageCode(db)) ?? FALLBACK_DEFAULT;
        // A translator translates: the default language is authored by a
        // teacher or an admin.
        if (input.locale === defaultLocale && !mayAuthor(context.user.roles)) {
          throw errors.FORBIDDEN();
        }
        if (!(await isEnabledLanguage(db, input.locale))) {
          throw errors.VALIDATION(validation("locale", "notEnabled"));
        }
        if (!(await readGesture(db, input.gestureId))) {
          throw errors.NOT_FOUND();
        }
        const stored = await readRow(db, input.gestureId, input.locale);
        if ((stored?.version ?? null) !== input.expectedVersion) {
          throw errors.CONFLICT({ data: { current: stored, reason: "stale" } });
        }
        const changed = changedFields(stored, input.fields);
        if (changed === null) {
          // Nothing differs: write nothing, make no entry.
          markUnchanged(db);
          return { version: stored?.version ?? null };
        }
        const version = (stored?.version ?? 0) + 1;
        const now = new Date();
        const f = input.fields;
        const statements: Statement[] = [
          staleGuard(db, input.gestureId, input.locale, input.expectedVersion),
          db
            .insert(gestureTeacherInfo)
            .values({
              bw: f.bw,
              cNote: f.cNote,
              gestureId: input.gestureId,
              hc: f.hc,
              locale: input.locale,
              note: f.note,
              or_: f.or,
              pl: f.pl,
              summary: f.summary,
              updatedAt: now,
              updatedBy: context.user.id,
              version: 1,
            })
            .onConflictDoUpdate({
              set: {
                bw: f.bw,
                cNote: f.cNote,
                hc: f.hc,
                note: f.note,
                or_: f.or,
                pl: f.pl,
                summary: f.summary,
                updatedAt: now,
                updatedBy: context.user.id,
                version: sql`${gestureTeacherInfo.version} + 1`,
              },
              target: [gestureTeacherInfo.gestureId, gestureTeacherInfo.locale],
            }),
          auditStatement(db, {
            action: "teacher.info_save",
            actorId: context.user.id,
            data: { fields: changed, locale: input.locale, version },
            targetId: `${input.gestureId}:${input.locale}`,
            targetType: "gesture_teacher_info",
          }),
        ];
        const [first, ...rest] = statements;
        try {
          await db.batch([first as Statement, ...rest]);
        } catch (error) {
          const failure = toGuardFailure(error);
          if (failure instanceof GuardFailedError) {
            const current = await readRow(db, input.gestureId, input.locale);
            throw errors.CONFLICT({ data: { current, reason: "stale" } });
          }
          console.error("[lessons] Failed to save the teacher info:", error);
          throw error;
        }
        return { version };
      }
    ),
  };
}
