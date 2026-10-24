/**
 * Reading lessons (phase 10c task 4): one lesson with its sections and
 * gestures in order, and the list page. Used by `lessons.get`, by the
 * `CONFLICT` answer of an update (the other editor's version) and by
 * duplicate and delete, which start from the stored state.
 */
import {
  defaultLanguageCode,
  gesture,
  gestureDrawing,
  gestureTranslation,
  inList,
  lesson,
  lessonItem,
  lessonSection,
  lessonSectionTranslation,
  lessonTranslation,
  user,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import { and, asc, desc, eq, type SQL, sql } from "drizzle-orm";
import {
  LESSON_LIST_PAGE,
  type LessonCursor,
  type LessonDetail,
  type LessonItem,
  type LessonList,
  type LessonListInput,
} from "../schema";

/** The default language when none is flagged (never in a migrated database). */
const FALLBACK_DEFAULT = "nl";

/** Who is asking: the account and whether it holds the admin role. */
export interface Viewer {
  id: string;
  isAdmin: boolean;
}

/** The author or an admin edits and deletes. */
export function mayEdit(viewer: Viewer, authorId: string | null): boolean {
  return viewer.isAdmin || (authorId !== null && authorId === viewer.id);
}

/** One bound list per chunk: D1 binds at most 100 values per statement (`inList` binds one). */
async function gestureItems(
  db: Db,
  gestureIds: readonly string[],
  locale: string
): Promise<Map<string, LessonItem>> {
  const items = new Map<string, LessonItem>();
  if (gestureIds.length === 0) {
    return items;
  }
  const [rows, names, drawings] = await Promise.all([
    db
      .select({
        id: gesture.id,
        name: gesture.name,
        playbackId: gesture.playbackId,
        publishedAt: gesture.publishedAt,
        slug: gesture.slug,
      })
      .from(gesture)
      .where(inList(gesture.id, gestureIds)),
    db
      .select({
        gestureId: gestureTranslation.gestureId,
        name: gestureTranslation.name,
      })
      .from(gestureTranslation)
      .where(
        and(
          inList(gestureTranslation.gestureId, gestureIds),
          eq(gestureTranslation.locale, locale)
        )
      ),
    db
      .selectDistinct({ gestureId: gestureDrawing.gestureId })
      .from(gestureDrawing)
      .where(inList(gestureDrawing.gestureId, gestureIds)),
  ]);
  const translated = new Map(names.map((row) => [row.gestureId, row.name]));
  const drawn = new Set(drawings.map((row) => row.gestureId));
  for (const row of rows) {
    items.set(row.id, {
      hasDrawing: drawn.has(row.id),
      id: row.id,
      name: translated.get(row.id) ?? row.name,
      playbackId: row.playbackId,
      published: row.publishedAt !== null,
      slug: row.slug,
    });
  }
  return items;
}

/** The lesson as stored, with gesture names in `locale`; `null` for an unknown id. */
export async function readLesson(
  db: Db,
  id: string,
  locale: string,
  viewer: Viewer
): Promise<LessonDetail | null> {
  const [head] = await db
    .select({
      authorId: lesson.authorId,
      authorName: user.name,
      createdAt: lesson.createdAt,
      id: lesson.id,
      number: lesson.number,
      updatedAt: lesson.updatedAt,
      version: lesson.version,
    })
    .from(lesson)
    .leftJoin(user, eq(user.id, lesson.authorId))
    .where(eq(lesson.id, id))
    .limit(1);
  if (!head) {
    return null;
  }
  const [texts, sections, sectionTexts, items] = await Promise.all([
    db
      .select()
      .from(lessonTranslation)
      .where(eq(lessonTranslation.lessonId, id)),
    db
      .select()
      .from(lessonSection)
      .where(eq(lessonSection.lessonId, id))
      .orderBy(asc(lessonSection.position), asc(lessonSection.id)),
    db
      .select({
        locale: lessonSectionTranslation.locale,
        sectionId: lessonSectionTranslation.sectionId,
        title: lessonSectionTranslation.title,
      })
      .from(lessonSectionTranslation)
      .innerJoin(
        lessonSection,
        eq(lessonSection.id, lessonSectionTranslation.sectionId)
      )
      .where(eq(lessonSection.lessonId, id)),
    db
      .select()
      .from(lessonItem)
      .where(eq(lessonItem.lessonId, id))
      .orderBy(asc(lessonItem.sectionId), asc(lessonItem.position)),
  ]);
  const byGesture = await gestureItems(
    db,
    items.map((row) => row.gestureId),
    locale
  );
  const place = (gestureId: string): LessonItem[] => {
    const found = byGesture.get(gestureId);
    return found ? [found] : [];
  };
  const titles = new Map<string, Record<string, string>>();
  for (const row of sectionTexts) {
    titles.set(row.sectionId, {
      ...titles.get(row.sectionId),
      [row.locale]: row.title,
    });
  }
  return {
    authorId: head.authorId,
    authorName: head.authorName,
    canEdit: mayEdit(viewer, head.authorId),
    createdAt: head.createdAt.getTime(),
    id: head.id,
    number: head.number,
    sections: sections.map((section) => ({
      id: section.id,
      items: items
        .filter((row) => row.sectionId === section.id)
        .flatMap((row) => place(row.gestureId)),
      titles: titles.get(section.id) ?? {},
    })),
    translations: Object.fromEntries(
      texts.map((row) => [row.locale, { notes: row.notes, title: row.title }])
    ),
    ungrouped: items
      .filter((row) => row.sectionId === null)
      .flatMap((row) => place(row.gestureId)),
    updatedAt: head.updatedAt.getTime(),
    version: head.version,
  };
}

/** A LIKE pattern matching `text` anywhere, with `%`, `_` and `\` literal (`ESCAPE '\'`). */
function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** The list: newest change first, a keyset page, optionally "mine" and a title search. */
export async function listLessons(
  db: Db,
  input: LessonListInput,
  locale: string,
  viewer: Viewer
): Promise<LessonList> {
  const conditions: SQL[] = [];
  if (input.mine) {
    conditions.push(eq(lesson.authorId, viewer.id));
  }
  if (input.query) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM lesson_translation AS lt WHERE lt.lesson_id = ${lesson.id} AND lt.title LIKE ${containsPattern(input.query)} ESCAPE '\\')`
    );
  }
  if (input.cursor) {
    conditions.push(
      sql`(${lesson.updatedAt}, ${lesson.id}) < (${input.cursor.updatedAt}, ${input.cursor.id})`
    );
  }
  const rows = await db
    .select({
      authorId: lesson.authorId,
      authorName: user.name,
      gestureCount: sql<number>`(SELECT count(*) FROM lesson_item AS li WHERE li.lesson_id = ${lesson.id})`,
      id: lesson.id,
      number: lesson.number,
      updatedAt: lesson.updatedAt,
      version: lesson.version,
    })
    .from(lesson)
    .leftJoin(user, eq(user.id, lesson.authorId))
    .where(and(...conditions))
    .orderBy(desc(lesson.updatedAt), desc(lesson.id))
    .limit(LESSON_LIST_PAGE + 1);
  const page = rows.slice(0, LESSON_LIST_PAGE);
  const [defaultLocale, texts] = await Promise.all([
    defaultLanguageCode(db),
    page.length === 0
      ? Promise.resolve([])
      : db
          .select({
            lessonId: lessonTranslation.lessonId,
            locale: lessonTranslation.locale,
            title: lessonTranslation.title,
          })
          .from(lessonTranslation)
          .where(
            inList(
              lessonTranslation.lessonId,
              page.map((row) => row.id)
            )
          )
          .orderBy(asc(lessonTranslation.locale)),
  ]);
  const fallback = defaultLocale ?? FALLBACK_DEFAULT;
  const last = page.at(-1);
  const cursor: LessonCursor | null =
    rows.length > LESSON_LIST_PAGE && last
      ? { id: last.id, updatedAt: last.updatedAt.getTime() }
      : null;
  return {
    items: page.map((row) => {
      const own = texts.filter((text) => text.lessonId === row.id);
      const chosen =
        own.find((text) => text.locale === locale) ??
        own.find((text) => text.locale === fallback) ??
        own[0];
      return {
        authorName: row.authorName,
        canEdit: mayEdit(viewer, row.authorId),
        gestureCount: row.gestureCount,
        id: row.id,
        mine: row.authorId === viewer.id,
        number: row.number,
        title: chosen?.title ?? "",
        titleLocale: chosen?.locale ?? fallback,
        updatedAt: row.updatedAt.getTime(),
        version: row.version,
      };
    }),
    nextCursor: cursor,
  };
}
