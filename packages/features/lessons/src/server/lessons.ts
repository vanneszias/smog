/**
 * The `lessons` procedures (phase 10c task 4, spec 5.3): list, read, create,
 * duplicate, delete and the stale-locked whole-lesson save. Teachers and
 * admins only (`lessonProcedure`); all of them read every lesson, the author
 * or an admin writes. Every write is one D1 batch with its audit entry (ids,
 * counts and part names, never a title or a note) and, for an update, a
 * guard on `lesson.version`, which the update bumps (the builder's lock and
 * part of the PDF cache fingerprint, plan ruling 3).
 */
import {
  failWhen,
  GuardFailedError,
  gesture,
  gestureDrawing,
  inList,
  isEnabledLanguage,
  language,
  lesson,
  lessonItem,
  lessonSection,
  lessonSectionTranslation,
  lessonTranslation,
  type Statement,
  toGuardFailure,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import { markUnchanged } from "@smog/rpc/audit";
import { eq, sql } from "drizzle-orm";
import {
  LESSON_MAX_GESTURES,
  type LessonDetail,
  type LessonUpdateInput,
} from "../schema";
import { auditStatement } from "./audit";
import { teacherInfoCoverage } from "./coverage";
import { previewLessonExport } from "./export-run";
import { listLessons, mayEdit, readLesson, type Viewer } from "./lesson-read";
import { lessonProcedure } from "./procedure";

/** Rows per multi-row insert: D1 binds at most 100 values per statement (four columns a row at most). */
const INSERT_CHUNK = 20;

function chunks<T>(rows: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let at = 0; at < rows.length; at += INSERT_CHUNK) {
    out.push(rows.slice(at, at + INSERT_CHUNK));
  }
  return out;
}

function validation(field: string, code: string) {
  return { data: { fieldErrors: { [field]: [code] }, formErrors: [] } };
}

type UpdatedPart = "items" | "notes" | "number" | "sections" | "title";

/** A lesson's texts and arrangement as stored or as sent. */
interface Layout {
  sections: {
    gestureIds: string[];
    id: string;
    titles: Record<string, string>;
  }[];
  texts: Record<string, { notes: string; title: string }>;
  ungrouped: string[];
}

function layoutOfStored(stored: LessonDetail): Layout {
  return {
    sections: stored.sections.map((section) => ({
      gestureIds: section.items.map((item) => item.id),
      id: section.id,
      titles: section.titles,
    })),
    texts: stored.translations,
    ungrouped: stored.ungrouped.map((item) => item.id),
  };
}

/** The input without empty rows: a language with no title and no notes is dropped, section titles likewise. */
function normalized(
  input: LessonUpdateInput
): { layout: Layout } | { error: ReturnType<typeof validation> } {
  const texts: Layout["texts"] = {};
  for (const [locale, text] of Object.entries(input.translations)) {
    if (text.title === "" && text.notes === "") {
      continue;
    }
    if (text.title === "") {
      // Notes without a title: the row needs one (the table requires it).
      return { error: validation("title", "required") };
    }
    texts[locale] = { notes: text.notes, title: text.title };
  }
  if (Object.keys(texts).length === 0) {
    return { error: validation("title", "required") };
  }
  return {
    layout: {
      sections: input.sections.map((section) => ({
        gestureIds: section.gestureIds,
        id: section.id,
        titles: Object.fromEntries(
          Object.entries(section.titles).filter(([, title]) => title !== "")
        ),
      })),
      texts,
      ungrouped: input.ungrouped,
    },
  };
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Sorted by key, so two equal maps compare equal whatever their insertion order. */
function sorted<V>(record: Record<string, V>): [string, V][] {
  return Object.entries(record).sort(([a], [b]) => a.localeCompare(b));
}

/** The parts of the lesson that differ between what is stored and what was sent. */
function changedParts(
  stored: LessonDetail,
  number: number | null,
  next: Layout
): [UpdatedPart, ...UpdatedPart[]] | null {
  const before = layoutOfStored(stored);
  const parts: UpdatedPart[] = [];
  const titlesOf = (texts: Layout["texts"]) =>
    sorted(texts).map(([locale, text]) => [locale, text.title]);
  const notesOf = (texts: Layout["texts"]) =>
    sorted(texts).map(([locale, text]) => [locale, text.notes]);
  if (!sameJson(titlesOf(before.texts), titlesOf(next.texts))) {
    parts.push("title");
  }
  if (!sameJson(notesOf(before.texts), notesOf(next.texts))) {
    parts.push("notes");
  }
  if (stored.number !== number) {
    parts.push("number");
  }
  const sectionShape = (layout: Layout) =>
    layout.sections.map((section) => [section.id, sorted(section.titles)]);
  if (!sameJson(sectionShape(before), sectionShape(next))) {
    parts.push("sections");
  }
  const itemShape = (layout: Layout) => [
    layout.ungrouped,
    ...layout.sections.map((section) => [section.id, section.gestureIds]),
  ];
  if (!sameJson(itemShape(before), itemShape(next))) {
    parts.push("items");
  }
  const [first, ...rest] = parts;
  return first === undefined ? null : [first, ...rest];
}

function viewerOf(context: {
  user: { id: string; roles: readonly string[] };
}): Viewer {
  return {
    id: context.user.id,
    isAdmin: context.user.roles.includes("admin"),
  };
}

/** Every gesture id of a layout, in order. */
function allGestureIds(layout: Layout): string[] {
  return [
    ...layout.ungrouped,
    ...layout.sections.flatMap((section) => section.gestureIds),
  ];
}

/** The insert statements of a layout under `lessonId` (sections, titles, items). */
function layoutStatements(
  db: Db,
  lessonId: string,
  layout: Layout,
  sectionIds: readonly string[]
): Statement[] {
  const statements: Statement[] = [];
  const sections = layout.sections.map((_, position) => ({
    id: sectionIds[position] as string,
    lessonId,
    position,
  }));
  for (const rows of chunks(sections)) {
    statements.push(db.insert(lessonSection).values(rows));
  }
  const titles = layout.sections.flatMap((section, at) =>
    Object.entries(section.titles).map(([locale, title]) => ({
      locale,
      sectionId: sectionIds[at] as string,
      title,
    }))
  );
  for (const rows of chunks(titles)) {
    statements.push(db.insert(lessonSectionTranslation).values(rows));
  }
  const items = [
    ...layout.ungrouped.map((gestureId, position) => ({
      gestureId,
      lessonId,
      position,
      sectionId: null,
    })),
    ...layout.sections.flatMap((section, at) =>
      section.gestureIds.map((gestureId, position) => ({
        gestureId,
        lessonId,
        position,
        sectionId: sectionIds[at] as string,
      }))
    ),
  ];
  for (const rows of chunks(items)) {
    statements.push(db.insert(lessonItem).values(rows));
  }
  return statements;
}

function textStatements(
  db: Db,
  lessonId: string,
  texts: Layout["texts"]
): Statement[] {
  return chunks(
    Object.entries(texts).map(([locale, text]) => ({
      lessonId,
      locale,
      notes: text.notes,
      title: text.title,
    }))
  ).map((rows) => db.insert(lessonTranslation).values(rows));
}

async function enabledLocales(db: Db): Promise<Set<string>> {
  const rows = await db
    .select({ code: language.code })
    .from(language)
    .where(eq(language.enabled, true));
  return new Set(rows.map((row) => row.code));
}

/** `db.batch` wants a first statement; the rest follow. */
function runBatch(db: Db, statements: Statement[]): Promise<unknown> {
  const [first, ...rest] = statements;
  return db.batch([first as Statement, ...rest]);
}

interface Refusal {
  code: string;
  field: string;
}

/**
 * What the layout may not be: more gestures than a PDF holds, a gesture twice,
 * an unknown gesture or one that is not published and not already in the
 * lesson, a section id taken by another lesson, a language that is neither
 * enabled nor already used by this lesson.
 */
async function refusal(
  db: Db,
  stored: LessonDetail,
  layout: Layout
): Promise<Refusal | null> {
  const ids = allGestureIds(layout);
  if (ids.length > LESSON_MAX_GESTURES) {
    return { code: "tooMany", field: "items" };
  }
  if (new Set(ids).size !== ids.length) {
    return { code: "duplicate", field: "items" };
  }
  const sectionIds = layout.sections.map((section) => section.id);
  if (new Set(sectionIds).size !== sectionIds.length) {
    return { code: "idTaken", field: "sections" };
  }
  const known = new Set(stored.sections.map((section) => section.id));
  const fresh = sectionIds.filter((id) => !known.has(id));
  if (fresh.length > 0) {
    const taken = await db
      .select({ id: lessonSection.id })
      .from(lessonSection)
      .where(inList(lessonSection.id, fresh))
      .limit(1);
    if (taken.length > 0) {
      return { code: "idTaken", field: "sections" };
    }
  }
  const held = new Set([
    ...stored.ungrouped.map((item) => item.id),
    ...stored.sections.flatMap((section) =>
      section.items.map((item) => item.id)
    ),
  ]);
  if (ids.length > 0) {
    const rows = await db
      .select({ id: gesture.id, publishedAt: gesture.publishedAt })
      .from(gesture)
      .where(inList(gesture.id, ids));
    const byId = new Map(rows.map((row) => [row.id, row.publishedAt]));
    for (const id of ids) {
      if (!byId.has(id)) {
        return { code: "unknown", field: "items" };
      }
      if (byId.get(id) === null && !held.has(id)) {
        return { code: "unpublished", field: "items" };
      }
    }
  }
  const used = new Set([
    ...Object.keys(stored.translations),
    ...stored.sections.flatMap((section) => Object.keys(section.titles)),
  ]);
  const wanted = new Set([
    ...Object.keys(layout.texts),
    ...layout.sections.flatMap((section) => Object.keys(section.titles)),
  ]);
  const enabled = await enabledLocales(db);
  for (const locale of wanted) {
    if (!(enabled.has(locale) || used.has(locale))) {
      return { code: "notEnabled", field: "locale" };
    }
  }
  return null;
}

interface UpdateArgs {
  actorId: string;
  input: LessonUpdateInput;
  layout: Layout;
  now: Date;
  parts: [UpdatedPart, ...UpdatedPart[]];
  version: number;
}

/** The one batch of an update: the version guard, the rewrite of the texts, sections and items, the audit entry. */
function updateStatements(
  db: Db,
  { actorId, input, layout, now, parts, version }: UpdateArgs
): Statement[] {
  const sectionIds = layout.sections.map((section) => section.id);
  return [
    failWhen(
      db,
      "stale",
      sql`NOT EXISTS (SELECT 1 FROM lesson AS l WHERE l.id = ${input.id} AND l.version = ${input.expectedVersion})`
    ),
    db
      .update(lesson)
      .set({
        number: input.number,
        updatedAt: now,
        version: sql`${lesson.version} + 1`,
      })
      .where(eq(lesson.id, input.id)),
    db
      .delete(lessonTranslation)
      .where(eq(lessonTranslation.lessonId, input.id)),
    ...textStatements(db, input.id, layout.texts),
    db.delete(lessonItem).where(eq(lessonItem.lessonId, input.id)),
    // The sections' titles go with them (cascade).
    db.delete(lessonSection).where(eq(lessonSection.lessonId, input.id)),
    ...layoutStatements(db, input.id, layout, sectionIds),
    auditStatement(db, {
      action: "lesson.update",
      actorId,
      data: { fields: parts, version },
      targetId: input.id,
      targetType: "lesson",
    }),
  ];
}

type UpdatePlan =
  | { error: ReturnType<typeof validation> }
  | { layout: Layout; parts: [UpdatedPart, ...UpdatedPart[]] | null };

/** What an update would write: the validated layout and the parts that differ (`null`: nothing), or the refusal. */
async function planUpdate(
  db: Db,
  stored: LessonDetail,
  input: LessonUpdateInput
): Promise<UpdatePlan> {
  const checked = normalized(input);
  if ("error" in checked) {
    return checked;
  }
  const refused = await refusal(db, stored, checked.layout);
  if (refused) {
    return { error: validation(refused.field, refused.code) };
  }
  return {
    layout: checked.layout,
    parts: changedParts(stored, input.number, checked.layout),
  };
}

/**
 * For a batch error: the lesson as stored now when the `stale` guard fired
 * (`"gone"` when it no longer exists), `null` for any other error.
 */
async function staleCurrent(
  error: unknown,
  read: () => Promise<LessonDetail | null>
): Promise<LessonDetail | "gone" | null> {
  if (!(toGuardFailure(error) instanceof GuardFailedError)) {
    return null;
  }
  return (await read()) ?? "gone";
}

export function lessonRoutes() {
  return {
    create: lessonProcedure.create.handler(
      async ({ context, errors, input }) => {
        const { db } = context;
        if (!(await isEnabledLanguage(db, input.locale))) {
          throw errors.VALIDATION(validation("locale", "notEnabled"));
        }
        const id = crypto.randomUUID();
        const number = input.number ?? null;
        const now = new Date();
        try {
          await runBatch(db, [
            db.insert(lesson).values({
              authorId: context.user.id,
              createdAt: now,
              id,
              number,
              updatedAt: now,
              version: 1,
            }),
            db.insert(lessonTranslation).values({
              lessonId: id,
              locale: input.locale,
              notes: "",
              title: input.title,
            }),
            auditStatement(db, {
              action: "lesson.create",
              actorId: context.user.id,
              data: { number },
              targetId: id,
              targetType: "lesson",
            }),
          ]);
        } catch (error) {
          console.error("[lessons] Failed to create a lesson:", error);
          throw error;
        }
        return { id, version: 1 };
      }
    ),
    delete: lessonProcedure.delete.handler(
      async ({ context, errors, input }) => {
        const { db } = context;
        const viewer = viewerOf(context);
        const stored = await readLesson(db, input.id, context.locale, viewer);
        if (!stored) {
          throw errors.NOT_FOUND();
        }
        if (!mayEdit(viewer, stored.authorId)) {
          throw errors.FORBIDDEN();
        }
        const gestures =
          stored.ungrouped.length +
          stored.sections.reduce((sum, s) => sum + s.items.length, 0);
        try {
          await runBatch(db, [
            // Deleted by someone else since the read: the entry would name nothing.
            failWhen(
              db,
              "gone",
              sql`NOT EXISTS (SELECT 1 FROM lesson AS l WHERE l.id = ${input.id})`
            ),
            // Items, sections and their titles, and the texts, go by cascade.
            db.delete(lesson).where(eq(lesson.id, input.id)),
            auditStatement(db, {
              action: "lesson.delete",
              actorId: context.user.id,
              data: { gestures, sections: stored.sections.length },
              targetId: input.id,
              targetType: "lesson",
            }),
          ]);
        } catch (error) {
          if (toGuardFailure(error) instanceof GuardFailedError) {
            throw errors.NOT_FOUND();
          }
          console.error("[lessons] Failed to delete a lesson:", error);
          throw error;
        }
        return { deleted: true as const };
      }
    ),
    duplicate: lessonProcedure.duplicate.handler(
      async ({ context, errors, input }) => {
        const { db } = context;
        const source = await readLesson(
          db,
          input.id,
          context.locale,
          viewerOf(context)
        );
        if (!source) {
          throw errors.NOT_FOUND();
        }
        const layout = layoutOfStored(source);
        const id = crypto.randomUUID();
        const sectionIds = layout.sections.map(() => crypto.randomUUID());
        const now = new Date();
        try {
          await runBatch(db, [
            failWhen(
              db,
              "gone",
              sql`NOT EXISTS (SELECT 1 FROM lesson AS l WHERE l.id = ${input.id})`
            ),
            db.insert(lesson).values({
              authorId: context.user.id,
              createdAt: now,
              id,
              number: source.number,
              updatedAt: now,
              version: 1,
            }),
            ...textStatements(db, id, layout.texts),
            ...layoutStatements(db, id, layout, sectionIds),
            auditStatement(db, {
              action: "lesson.duplicate",
              actorId: context.user.id,
              data: {
                gestures: allGestureIds(layout).length,
                sourceId: input.id,
              },
              targetId: id,
              targetType: "lesson",
            }),
          ]);
        } catch (error) {
          if (toGuardFailure(error) instanceof GuardFailedError) {
            throw errors.NOT_FOUND();
          }
          console.error("[lessons] Failed to duplicate a lesson:", error);
          throw error;
        }
        return { id, version: 1 };
      }
    ),
    exportPreview: lessonProcedure.exportPreview.handler(
      async ({ context, errors, input }) => {
        const { db } = context;
        if (!(await isEnabledLanguage(db, input.locale))) {
          throw errors.VALIDATION(validation("locale", "notEnabled"));
        }
        const preview = await previewLessonExport(db, {
          lessonId: input.id,
          locale: input.locale,
          template: input.template,
        });
        if (!preview) {
          throw errors.NOT_FOUND();
        }
        return preview;
      }
    ),
    gestureMarkers: lessonProcedure.gestureMarkers.handler(
      async ({ context, input }) => {
        if (input.gestureIds.length === 0) {
          return { withDrawing: [] };
        }
        const rows = await context.db
          .selectDistinct({ gestureId: gestureDrawing.gestureId })
          .from(gestureDrawing)
          .where(inList(gestureDrawing.gestureId, input.gestureIds));
        return { withDrawing: rows.map((row) => row.gestureId) };
      }
    ),
    get: lessonProcedure.get.handler(async ({ context, errors, input }) => {
      const found = await readLesson(
        context.db,
        input.id,
        context.locale,
        viewerOf(context)
      );
      if (!found) {
        throw errors.NOT_FOUND();
      }
      return found;
    }),
    list: lessonProcedure.list.handler(({ context, input }) =>
      listLessons(context.db, input, context.locale, viewerOf(context))
    ),
    readiness: lessonProcedure.readiness.handler(
      async ({ context, errors, input }) => {
        const { db } = context;
        if (!(await isEnabledLanguage(db, input.locale))) {
          throw errors.VALIDATION(validation("locale", "notEnabled"));
        }
        const stored = await readLesson(
          db,
          input.id,
          context.locale,
          viewerOf(context)
        );
        if (!stored) {
          throw errors.NOT_FOUND();
        }
        // Unpublished gestures are skipped in the PDF: they are not "missing".
        const ids = [
          ...stored.ungrouped,
          ...stored.sections.flatMap((section) => section.items),
        ]
          .filter((item) => item.published)
          .map((item) => item.id);
        const coverage = await teacherInfoCoverage(db, ids, input.locale);
        return { ...coverage, locale: input.locale, total: ids.length };
      }
    ),
    update: lessonProcedure.update.handler(
      async ({ context, errors, input }) => {
        const { db } = context;
        const viewer = viewerOf(context);
        const stored = await readLesson(db, input.id, context.locale, viewer);
        if (!stored) {
          throw errors.NOT_FOUND();
        }
        if (!stored.canEdit) {
          throw errors.FORBIDDEN();
        }
        if (stored.version !== input.expectedVersion) {
          throw errors.CONFLICT({ data: { current: stored, reason: "stale" } });
        }
        const plan = await planUpdate(db, stored, input);
        if ("error" in plan) {
          throw errors.VALIDATION(plan.error);
        }
        if (plan.parts === null) {
          markUnchanged(db);
          return {
            unchanged: true,
            updatedAt: stored.updatedAt,
            version: stored.version,
          };
        }
        const version = stored.version + 1;
        const now = new Date();
        try {
          await runBatch(
            db,
            updateStatements(db, {
              actorId: context.user.id,
              input,
              layout: plan.layout,
              now,
              parts: plan.parts,
              version,
            })
          );
        } catch (error) {
          // Another editor saved between the read and the batch: the guard fired.
          const current = await staleCurrent(error, () =>
            readLesson(db, input.id, context.locale, viewer)
          );
          if (current === "gone") {
            throw errors.NOT_FOUND();
          }
          if (current) {
            throw errors.CONFLICT({ data: { current, reason: "stale" } });
          }
          console.error("[lessons] Failed to save a lesson:", error);
          throw error;
        }
        return { unchanged: false, updatedAt: now.getTime(), version };
      }
    ),
  };
}
