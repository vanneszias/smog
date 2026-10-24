/**
 * What a lesson PDF will contain, resolved from D1 (phase 10c task 5b, spec
 * 5.4): the default-language fallback per field, the unpublished gestures
 * left out (listed, never silently), the C keywords of the language, the
 * drawings' object keys. No R2 and no PDF here: the export dialog's preview
 * reads this plan, and the route builds the document and the cache key from
 * it. **Private material** (teacher text, drawing keys): only the guarded
 * export route and `lessons.exportPreview` call it.
 */
import {
  defaultLanguageCode,
  gesture,
  gestureDrawing,
  gestureKeyword,
  gestureTeacherInfo,
  gestureTranslation,
  inList,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import { and, asc, eq } from "drizzle-orm";
import {
  LESSON_PDF_LIMITS,
  type LessonTemplate,
  TEACHER_INFO_FIELDS,
  type TeacherInfoFields,
} from "../schema";
import { readLesson } from "./lesson-read";

/** Bump when the engine's layout or this module's mapping changes: it is part of every cache key, so an old file is never served after a deploy that would print differently. */
export const LESSON_PDF_LAYOUT_VERSION = 1;

/** The default language when none is flagged (never in a migrated database). */
const FALLBACK_DEFAULT = "nl";

/** The fields a template prints (the participants' sheet prints the summary, or HC when there is none). */
const PRINTED: Record<LessonTemplate, readonly (keyof TeacherInfoFields)[]> = {
  participants: ["summary", "hc"],
  teachers: ["hc", "pl", "or", "bw", "cNote", "note"],
};

interface PlannedDrawing {
  contentType: string;
  credit: string;
  key: string;
  step: 1 | 2;
  updatedAt: number;
}

interface PlannedRow {
  drawings: PlannedDrawing[];
  /** Printed text came (partly) from the default language. */
  fallback: boolean;
  fields: TeacherInfoFields;
  id: string;
  keywords: string[];
  /** Nothing to print for this gesture in either language (the name apart). */
  missing: boolean;
  /** Only the part of the fingerprint that is not in the fields: row versions and stamps. */
  stamp: string;
  word: string;
}

interface PlannedSection {
  rows: PlannedRow[];
  title: string | null;
}

export interface ExportPlan {
  /** The language the lesson's own texts were taken from (the export language, else the default, else any). */
  defaultLocale: string;
  lesson: {
    id: string;
    notes: string;
    number: number | null;
    title: string;
    version: number;
  };
  /** Rows in the PDF. */
  rowCount: number;
  sections: PlannedSection[];
  /** Unpublished gestures left out of the PDF, by name. */
  skipped: { id: string; name: string }[];
}

const NO_VIEWER = { id: "", isAdmin: false };

type Row<T> = T extends readonly (infer R)[] ? R : never;

function emptyFields(): TeacherInfoFields {
  return { bw: "", cNote: "", hc: "", note: "", or: "", pl: "", summary: "" };
}

interface InfoRow extends TeacherInfoFields {
  locale: string;
  version: number;
}

function toInfoRow(row: {
  bw: string;
  cNote: string;
  hc: string;
  locale: string;
  note: string;
  or_: string;
  pl: string;
  summary: string;
  version: number;
}): InfoRow {
  const { or_, ...rest } = row;
  return { ...rest, or: or_ };
}

/** Teacher text, per field: the language's own, else the default language's. */
function resolveFields(
  own: InfoRow | undefined,
  base: InfoRow | undefined
): { fallbackFields: Set<keyof TeacherInfoFields>; fields: TeacherInfoFields } {
  const fields = emptyFields();
  const fallbackFields = new Set<keyof TeacherInfoFields>();
  for (const field of TEACHER_INFO_FIELDS) {
    const mine = own?.[field].trim() ?? "";
    const theirs = base?.[field].trim() ?? "";
    if (mine !== "") {
      fields[field] = mine;
    } else if (theirs !== "") {
      fields[field] = theirs;
      fallbackFields.add(field);
    }
  }
  return { fallbackFields, fields };
}

/** Whether a field is the default language's by the time it is printed: HC prints on the participants' sheet only without a summary. */
function printedFallback(
  template: LessonTemplate,
  fields: TeacherInfoFields,
  fallbackFields: ReadonlySet<keyof TeacherInfoFields>
): boolean {
  return PRINTED[template].some((field) => {
    if (
      template === "participants" &&
      field === "hc" &&
      fields.summary !== ""
    ) {
      return false;
    }
    return fallbackFields.has(field);
  });
}

function hasPrintable(
  template: LessonTemplate,
  fields: TeacherInfoFields,
  keywords: readonly string[]
): boolean {
  return (
    keywords.length > 0 ||
    PRINTED[template].some((field) => fields[field] !== "")
  );
}

function groupBy<T>(
  rows: readonly T[],
  key: (row: T) => string
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const list = grouped.get(key(row)) ?? [];
    list.push(row);
    grouped.set(key(row), list);
  }
  return grouped;
}

type GestureRow = Row<Awaited<ReturnType<typeof gestureRows>>>;

async function gestureRows(db: Db, ids: readonly string[], locale: string) {
  const [gestures, translations, info, keywords, drawings] = await Promise.all([
    db
      .select({
        id: gesture.id,
        name: gesture.name,
        updatedAt: gesture.updatedAt,
      })
      .from(gesture)
      .where(inList(gesture.id, ids)),
    db
      .select({
        gestureId: gestureTranslation.gestureId,
        name: gestureTranslation.name,
        updatedAt: gestureTranslation.updatedAt,
      })
      .from(gestureTranslation)
      .where(
        and(
          inList(gestureTranslation.gestureId, ids),
          eq(gestureTranslation.locale, locale)
        )
      ),
    db
      .select({
        bw: gestureTeacherInfo.bw,
        cNote: gestureTeacherInfo.cNote,
        gestureId: gestureTeacherInfo.gestureId,
        hc: gestureTeacherInfo.hc,
        locale: gestureTeacherInfo.locale,
        note: gestureTeacherInfo.note,
        or_: gestureTeacherInfo.or_,
        pl: gestureTeacherInfo.pl,
        summary: gestureTeacherInfo.summary,
        version: gestureTeacherInfo.version,
      })
      .from(gestureTeacherInfo)
      .where(inList(gestureTeacherInfo.gestureId, ids)),
    db
      .select({
        gestureId: gestureKeyword.gestureId,
        keyword: gestureKeyword.keyword,
        locale: gestureKeyword.locale,
      })
      .from(gestureKeyword)
      .where(inList(gestureKeyword.gestureId, ids))
      .orderBy(asc(gestureKeyword.position), asc(gestureKeyword.keyword)),
    db
      .select({
        contentType: gestureDrawing.contentType,
        credit: gestureDrawing.credit,
        gestureId: gestureDrawing.gestureId,
        key: gestureDrawing.r2Key,
        step: gestureDrawing.step,
        updatedAt: gestureDrawing.updatedAt,
      })
      .from(gestureDrawing)
      .where(inList(gestureDrawing.gestureId, ids))
      .orderBy(asc(gestureDrawing.step)),
  ]);
  return gestures.map((row) => ({
    drawings: drawings.filter((drawing) => drawing.gestureId === row.id),
    gesture: row,
    info: info.filter((entry) => entry.gestureId === row.id),
    keywords: keywords.filter((entry) => entry.gestureId === row.id),
    translation: translations.find((entry) => entry.gestureId === row.id),
  }));
}

function plannedRow(
  data: GestureRow,
  template: LessonTemplate,
  locale: string,
  defaultLocale: string
): PlannedRow {
  const infoRows = groupBy(data.info, (entry) => entry.locale);
  const own = infoRows.get(locale)?.[0];
  const base =
    locale === defaultLocale ? undefined : infoRows.get(defaultLocale)?.[0];
  const ownRow = own ? toInfoRow(own) : undefined;
  const baseRow = base ? toInfoRow(base) : undefined;
  const { fallbackFields, fields } = resolveFields(ownRow, baseRow);
  const keywordsOf = (code: string) =>
    data.keywords
      .filter((entry) => entry.locale === code)
      .map((entry) => entry.keyword);
  let keywords = keywordsOf(locale);
  let keywordsFallback = false;
  if (keywords.length === 0 && locale !== defaultLocale) {
    keywords = keywordsOf(defaultLocale);
    keywordsFallback = keywords.length > 0;
  }
  const wordFallback = locale !== defaultLocale && !data.translation;
  const drawings: PlannedDrawing[] =
    template === "participants"
      ? data.drawings.map((drawing) => ({
          contentType: drawing.contentType,
          credit: drawing.credit,
          key: drawing.key,
          step: drawing.step === 2 ? 2 : 1,
          updatedAt: drawing.updatedAt.getTime(),
        }))
      : [];
  const stamp = JSON.stringify([
    data.gesture.id,
    data.gesture.updatedAt.getTime(),
    data.translation?.updatedAt.getTime() ?? 0,
    own?.version ?? 0,
    base?.version ?? 0,
    drawings.map((drawing) => [drawing.key, drawing.updatedAt]),
    keywords,
  ]);
  return {
    drawings,
    fallback:
      wordFallback ||
      keywordsFallback ||
      printedFallback(template, fields, fallbackFields),
    fields,
    id: data.gesture.id,
    keywords,
    missing: !hasPrintable(template, fields, keywords),
    stamp,
    word: data.translation?.name ?? data.gesture.name,
  };
}

function pickText<T extends { locale: string }>(
  rows: readonly T[],
  locale: string,
  defaultLocale: string
): T | undefined {
  return (
    rows.find((row) => row.locale === locale) ??
    rows.find((row) => row.locale === defaultLocale) ??
    rows[0]
  );
}

/** Why a plan cannot be made into a PDF. */
export class LessonExportError extends Error {
  readonly code: "RATE_LIMITED" | "TIMEOUT" | "TOO_LARGE" | "TOO_MANY";
  /** `TOO_MANY`: the rows the lesson has and the template's cap. */
  readonly count: number | undefined;
  readonly limit: number | undefined;

  constructor(
    code: LessonExportError["code"],
    message: string,
    detail: { count?: number; limit?: number } = {}
  ) {
    super(message);
    this.name = "LessonExportError";
    this.code = code;
    this.count = detail.count;
    this.limit = detail.limit;
  }
}

/**
 * The lesson as the PDF will print it, or `null` for an unknown lesson.
 * `TOO_MANY` (with the limit) when the rows to print exceed the template's
 * cap: 150 for the teachers' sheet, 80 for the participants' (it embeds
 * drawings).
 */
export async function planLessonExport(
  db: Db,
  input: { lessonId: string; locale: string; template: LessonTemplate }
): Promise<ExportPlan | null> {
  const { lessonId, locale, template } = input;
  try {
    const stored = await readLesson(db, lessonId, locale, NO_VIEWER);
    if (!stored) {
      return null;
    }
    const defaultLocale = (await defaultLanguageCode(db)) ?? FALLBACK_DEFAULT;
    const all = [
      ...stored.ungrouped,
      ...stored.sections.flatMap((section) => section.items),
    ];
    const published = all.filter((item) => item.published);
    const limit = LESSON_PDF_LIMITS[template];
    if (published.length > limit) {
      throw new LessonExportError(
        "TOO_MANY",
        `[lessons] The lesson has ${published.length} gestures, over the ${limit} of the ${template} template`,
        { count: published.length, limit }
      );
    }
    const data =
      published.length === 0
        ? []
        : await gestureRows(
            db,
            published.map((item) => item.id),
            locale
          );
    const byId = new Map(data.map((row) => [row.gesture.id, row]));
    const rowsOf = (items: typeof all): PlannedRow[] =>
      items.flatMap((item) => {
        const row = item.published ? byId.get(item.id) : undefined;
        return row ? [plannedRow(row, template, locale, defaultLocale)] : [];
      });
    const texts = Object.entries(stored.translations).map(([code, entry]) => ({
      locale: code,
      ...entry,
    }));
    const text = pickText(texts, locale, defaultLocale);
    let notes = text?.notes ?? "";
    if (notes === "" && text?.locale !== defaultLocale) {
      notes = stored.translations[defaultLocale]?.notes ?? "";
    }
    const sections: PlannedSection[] = [
      { rows: rowsOf(stored.ungrouped), title: null },
      ...stored.sections.map((section) => ({
        rows: rowsOf(section.items),
        title:
          pickText(
            Object.entries(section.titles).map(([code, title]) => ({
              locale: code,
              title,
            })),
            locale,
            defaultLocale
          )?.title || null,
      })),
    ].filter((section) => section.rows.length > 0);
    return {
      defaultLocale,
      lesson: {
        id: stored.id,
        notes,
        number: stored.number,
        title: text?.title ?? "",
        version: stored.version,
      },
      rowCount: published.length,
      sections,
      skipped: all
        .filter((item) => !item.published)
        .map((item) => ({ id: item.id, name: item.name })),
    };
  } catch (error) {
    if (!(error instanceof LessonExportError)) {
      console.error("[lessons] Failed to plan the export:", error);
    }
    throw error;
  }
}
