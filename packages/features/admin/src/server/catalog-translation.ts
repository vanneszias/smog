/**
 * Phase 10b task 5: the gesture and category translations
 * (`catalogTranslation.*`). A translator (or an admin) writes the name,
 * description and keywords of a gesture and the name of a category in one
 * non-default language; the default language's text stays with the admin
 * catalogue editors. Every write is one D1 batch: a stale-lock guard, the
 * translation, the language's keyword rows, the full-text rows of every
 * language of the affected gestures and the audit entry; then a new catalog
 * version, so the per-language projections reload.
 */
import {
  category,
  categoryTranslation,
  DEFAULT_LANGUAGE_SQL,
  failWhen,
  GuardFailedError,
  gesture,
  gestureKeyword,
  gestureNeedsTranslationSql,
  gestureTranslation,
  jsonList,
  language,
  rebuildCategoryGesturesFtsSql,
  rebuildGestureFtsSql,
  ref,
  type Statement,
  type TranslationReport,
  translationReport,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import { implementRpc, requireRole } from "@smog/rpc";
import {
  decodeCursorAs,
  encodeCursor,
  InvalidCursorError,
  normalizeText,
} from "@smog/utils";
import { and, asc, eq, type SQL, sql } from "drizzle-orm";
import {
  CATALOG_TRANSLATION_PROCEDURES,
  catalogTranslationContract,
} from "../contract/catalog-translation";
import { auditStatement } from "./audit-writer";
import { bumpCatalog, nextUpdatedAt, runCatalogBatch } from "./catalog-writes";
import { adminGuard, markUnchanged } from "./guard";
import type { AdminDeps } from "./procedure";

/**
 * The guard kinds under their full path (`catalogTranslation.gestures.save`),
 * which is what the audit guard reads.
 */
const KINDS = Object.fromEntries(
  Object.entries(CATALOG_TRANSLATION_PROCEDURES).map(([path, kind]) => [
    `catalogTranslation.${path}`,
    kind,
  ])
);

/**
 * The one builder of every translation procedure: the contract with the rpc
 * context, `requireRole("translator")` (`UNAUTHORIZED` for guests,
 * `FORBIDDEN` for a user or a teacher; an admin passes) and the admin audit
 * guard (a read cannot write, a write builds its audit entry).
 */
const translatorProcedure = implementRpc(catalogTranslationContract)
  .use(requireRole("translator"))
  .use(adminGuard(KINDS));

function validation(field: string, message: string) {
  return { data: { fieldErrors: { [field]: [message] }, formErrors: [] } };
}

const G = "gesture";
const C = "category";

// --- Languages ------------------------------------------------------------

/** The enabled languages that are not the default one, in menu order. */
async function translatableLanguages(db: Db): Promise<string[]> {
  const rows = await db
    .select({ code: language.code })
    .from(language)
    .where(and(eq(language.enabled, true), eq(language.isDefault, false)))
    .orderBy(asc(language.sortOrder), asc(language.code));
  return rows.map((row) => row.code);
}

/** Whether `locale` may be written: an enabled language other than the default. */
async function isTranslatable(db: Db, locale: string): Promise<boolean> {
  const [row] = await db
    .select({ code: language.code })
    .from(language)
    .where(
      and(
        eq(language.code, locale),
        eq(language.enabled, true),
        eq(language.isDefault, false)
      )
    );
  return row !== undefined;
}

// --- Gestures: reads ------------------------------------------------------

function parseKeywords(value: unknown): string[] {
  return JSON.parse(String(value)) as string[];
}

/** A gesture's keywords in one language (a literal or a subquery), in the editor's order. */
function keywordsIn(locale: SQL | string): SQL<string[]> {
  return sql`(SELECT json_group_array(o.keyword) FROM (SELECT ${ref("k", gestureKeyword.keyword)} AS keyword FROM ${gestureKeyword} AS k WHERE ${ref("k", gestureKeyword.gestureId)} = ${ref(G, gesture.id)} AND ${ref("k", gestureKeyword.locale)} = ${locale} ORDER BY ${ref("k", gestureKeyword.position)}) AS o)`.mapWith(
    parseKeywords
  );
}

function keywordCountIn(locale: SQL | string): SQL<number> {
  return sql<number>`(SELECT count(*) FROM ${gestureKeyword} AS k WHERE ${ref("k", gestureKeyword.gestureId)} = ${ref(G, gesture.id)} AND ${ref("k", gestureKeyword.locale)} = ${locale})`.mapWith(
    Number
  );
}

/** The gesture's `gesture_translation` row in `locale`, one field of it. */
function translationField(column: string, locale: string): SQL {
  return sql`(SELECT ${sql.raw(`t.${column}`)} FROM gesture_translation AS t WHERE t.gesture_id = ${ref(G, gesture.id)} AND t.locale = ${locale})`;
}

interface ListPosition {
  id: string;
  sortName: string;
}

function parseCursor(cursor: string): ListPosition {
  return decodeCursorAs(cursor, (key) => {
    const [sortName, id] = key;
    return key.length === 2 &&
      typeof sortName === "string" &&
      typeof id === "string"
      ? { id, sortName }
      : null;
  });
}

/** After the position in `(sort_name, id)` order, as a range on the first key. */
function after(position: ListPosition): SQL {
  const key = sql`${gesture.sortName}`;
  return sql`${key} >= ${position.sortName} AND (${key} > ${position.sortName} OR ${gesture.id} > ${position.id})`;
}

async function listGestures(
  db: Db,
  input: {
    cursor?: string | undefined;
    limit: number;
    locale: string;
    q?: string | undefined;
    status: "all" | "needs";
  }
) {
  const position =
    input.cursor === undefined ? null : parseCursor(input.cursor);
  const needle = normalizeText(input.q ?? "");
  const { locale } = input;
  const [rows, report] = await Promise.all([
    db
      .select({
        id: gesture.id,
        keywordCount: keywordCountIn(DEFAULT_LANGUAGE_SQL),
        name: gesture.name,
        needs: sql<number>`${gestureNeedsTranslationSql(locale)}`.mapWith(
          Boolean
        ),
        publishedAt: gesture.publishedAt,
        slug: gesture.slug,
        sortName: gesture.sortName,
        tDescription: sql<
          string | null
        >`${translationField("description", locale)}`,
        tKeywordCount: keywordCountIn(locale),
        tName: sql<string | null>`${translationField("name", locale)}`,
        tUpdatedAt: sql<
          number | null
        >`${translationField("updated_at", locale)}`,
      })
      .from(gesture)
      .where(
        and(
          input.status === "needs"
            ? gestureNeedsTranslationSql(locale)
            : undefined,
          needle === ""
            ? undefined
            : sql`instr(${gesture.sortName}, ${needle}) > 0`,
          position ? after(position) : undefined
        )
      )
      .orderBy(sql`${gesture.sortName}`, sql`${gesture.id}`)
      .limit(input.limit + 1),
    translationReport(db, locale),
  ]);
  const page = rows.slice(0, input.limit);
  const last = page.at(-1);
  return {
    items: page.map((row) => ({
      id: row.id,
      keywordCount: row.keywordCount,
      name: row.name,
      needsTranslation: row.needs,
      published: row.publishedAt !== null,
      slug: row.slug,
      translation:
        row.tName === null || row.tUpdatedAt === null
          ? null
          : {
              description: row.tDescription ?? "",
              keywordCount: row.tKeywordCount,
              name: row.tName,
              updatedAt: Number(row.tUpdatedAt),
            },
    })),
    nextCursor:
      rows.length > input.limit && last
        ? encodeCursor([last.sortName, last.id])
        : null,
    report,
  };
}

async function getGesture(db: Db, id: string) {
  const [row] = await db
    .select({
      description: gesture.description,
      id: gesture.id,
      keywords: keywordsIn(DEFAULT_LANGUAGE_SQL),
      name: gesture.name,
      publishedAt: gesture.publishedAt,
      slug: gesture.slug,
    })
    .from(gesture)
    .where(eq(gesture.id, id));
  if (!row) {
    return null;
  }
  const [translations, keywordRows] = await db.batch([
    db
      .select({
        description: gestureTranslation.description,
        locale: gestureTranslation.locale,
        name: gestureTranslation.name,
        updatedAt: gestureTranslation.updatedAt,
      })
      .from(gestureTranslation)
      .where(eq(gestureTranslation.gestureId, id)),
    db
      .select({
        keyword: gestureKeyword.keyword,
        locale: gestureKeyword.locale,
      })
      .from(gestureKeyword)
      .where(eq(gestureKeyword.gestureId, id))
      .orderBy(gestureKeyword.locale, gestureKeyword.position),
  ]);
  const keywordsBy = new Map<string, string[]>();
  for (const { keyword, locale } of keywordRows) {
    keywordsBy.set(locale, [...(keywordsBy.get(locale) ?? []), keyword]);
  }
  return {
    id: row.id,
    published: row.publishedAt !== null,
    slug: row.slug,
    source: {
      description: row.description,
      keywords: row.keywords,
      name: row.name,
    },
    translations: Object.fromEntries(
      translations.map((translation) => [
        translation.locale,
        {
          description: translation.description,
          keywords: keywordsBy.get(translation.locale) ?? [],
          name: translation.name,
          updatedAt: translation.updatedAt.getTime(),
        },
      ])
    ),
  };
}

// --- Gestures: write ------------------------------------------------------

interface StoredTranslation {
  description: string;
  keywords: string[];
  name: string;
  updatedAt: Date;
}

async function storedTranslation(
  db: Db,
  id: string,
  locale: string
): Promise<StoredTranslation | null> {
  const [[row], keywords] = await db.batch([
    db
      .select({
        description: gestureTranslation.description,
        name: gestureTranslation.name,
        updatedAt: gestureTranslation.updatedAt,
      })
      .from(gestureTranslation)
      .where(
        and(
          eq(gestureTranslation.gestureId, id),
          eq(gestureTranslation.locale, locale)
        )
      ),
    db
      .select({ keyword: gestureKeyword.keyword })
      .from(gestureKeyword)
      .where(
        and(eq(gestureKeyword.gestureId, id), eq(gestureKeyword.locale, locale))
      )
      .orderBy(gestureKeyword.position),
  ]);
  return row
    ? { ...row, keywords: keywords.map((item) => item.keyword) }
    : null;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

type SaveFields = "description" | "keywords" | "name";

/**
 * The guard that the translation is still the one the editor read: no row
 * when it read none, else a row with its `updated_at`.
 */
function staleGuard(
  db: Db,
  table: "category_translation" | "gesture_translation",
  idColumn: "category_id" | "gesture_id",
  id: string,
  locale: string,
  expected: number | null
): Statement {
  return failWhen(
    db,
    "stale",
    expected === null
      ? sql`EXISTS (SELECT 1 FROM ${sql.raw(table)} AS t WHERE ${sql.raw(`t.${idColumn}`)} = ${id} AND t.locale = ${locale})`
      : sql`NOT EXISTS (SELECT 1 FROM ${sql.raw(table)} AS t WHERE ${sql.raw(`t.${idColumn}`)} = ${id} AND t.locale = ${locale} AND t.updated_at = ${expected})`
  );
}

interface SaveInput {
  description: string;
  expectedUpdatedAt: number | null;
  id: string;
  keywords: string[];
  locale: string;
  name: string;
}

/**
 * The parts of a gesture translation a save changes, or `null` when it
 * changes nothing (then nothing is written and no entry made).
 */
function changedFields(
  existing: StoredTranslation | null,
  input: SaveInput
): [SaveFields, ...SaveFields[]] | null {
  const changed: SaveFields[] = [];
  if (existing?.name !== input.name) {
    changed.push("name");
  }
  if ((existing?.description ?? "") !== input.description) {
    changed.push("description");
  }
  if (!sameList(existing?.keywords ?? [], input.keywords)) {
    changed.push("keywords");
  }
  const [first, ...rest] = changed;
  return first === undefined ? null : [first, ...rest];
}

/**
 * One gesture translation save as a batch: the stale guard, the
 * translation, this language's keywords (replaced, no other language's
 * touched), the full-text rows of every language of the gesture and the
 * audit entry.
 */
function gestureSaveStatements({
  actorId,
  changed,
  created,
  db,
  input,
  row,
  updatedAt,
}: {
  actorId: string;
  changed: [SaveFields, ...SaveFields[]];
  created: boolean;
  db: Db;
  input: SaveInput;
  row: { name: string; slug: string };
  updatedAt: Date;
}): Statement[] {
  const statements: Statement[] = [
    staleGuard(
      db,
      "gesture_translation",
      "gesture_id",
      input.id,
      input.locale,
      input.expectedUpdatedAt
    ),
    db
      .insert(gestureTranslation)
      .values({
        description: input.description,
        gestureId: input.id,
        locale: input.locale,
        name: input.name,
        updatedAt,
        updatedBy: actorId,
      })
      .onConflictDoUpdate({
        set: {
          description: input.description,
          name: input.name,
          updatedAt,
          updatedBy: actorId,
        },
        target: [gestureTranslation.gestureId, gestureTranslation.locale],
      }),
    db
      .delete(gestureKeyword)
      .where(
        and(
          eq(gestureKeyword.gestureId, input.id),
          eq(gestureKeyword.locale, input.locale)
        )
      ),
  ];
  if (input.keywords.length > 0) {
    // One bound list (D1 binds at most 100 values per statement).
    statements.push(
      db
        .insert(gestureKeyword)
        .select(
          sql`SELECT ${input.id}, ${input.locale}, j.value, j.key FROM json_each(${jsonList(input.keywords)}) AS j WHERE true`
        )
    );
  }
  statements.push(
    ...rebuildGestureFtsSql(input.id).map((statement) => db.run(statement)),
    auditStatement(db, {
      action: "translation.gesture_save",
      actorId,
      data: {
        created,
        fields: changed,
        locale: input.locale,
        name: row.name,
        slug: row.slug,
      },
      targetId: input.id,
      targetType: "gesture",
    })
  );
  return statements;
}

// --- Categories -----------------------------------------------------------

async function listCategories(
  db: Db,
  input: { locale: string; status: "all" | "needs" }
) {
  const { locale } = input;
  const [rows, report] = await Promise.all([
    db
      .select({
        id: category.id,
        name: category.name,
        publishedAt: category.publishedAt,
        slug: category.slug,
        tName: sql<
          string | null
        >`(SELECT t.name FROM category_translation AS t WHERE t.category_id = ${ref(C, category.id)} AND t.locale = ${locale})`,
        tUpdatedAt: sql<
          number | null
        >`(SELECT t.updated_at FROM category_translation AS t WHERE t.category_id = ${ref(C, category.id)} AND t.locale = ${locale})`,
      })
      .from(category)
      .orderBy(category.sortOrder, sql`${category.name} COLLATE NOCASE`)
      .limit(200),
    translationReport(db, locale),
  ]);
  const items = rows.map((row) => ({
    id: row.id,
    name: row.name,
    needsTranslation: row.tName === null,
    published: row.publishedAt !== null,
    slug: row.slug,
    translation:
      row.tName === null || row.tUpdatedAt === null
        ? null
        : { name: row.tName, updatedAt: Number(row.tUpdatedAt) },
  }));
  return {
    items:
      input.status === "needs"
        ? items.filter((item) => item.needsTranslation)
        : items,
    report,
  };
}

/** The `catalogTranslation` router (see the contract). */
export function createCatalogTranslationRouter(deps: AdminDeps) {
  return translatorProcedure.router({
    categories: {
      list: translatorProcedure.categories.list.handler(
        async ({ context, errors, input }) => {
          if (!(await isTranslatable(context.db, input.locale))) {
            throw errors.VALIDATION(validation("locale", "not translatable"));
          }
          return await listCategories(context.db, input);
        }
      ),
      save: translatorProcedure.categories.save.handler(
        async ({ context, errors, input }) => {
          const { db } = context;
          if (!(await isTranslatable(db, input.locale))) {
            throw errors.VALIDATION(validation("locale", "not translatable"));
          }
          const [row] = await db
            .select({
              name: category.name,
              slug: category.slug,
            })
            .from(category)
            .where(eq(category.id, input.id));
          if (!row) {
            throw errors.NOT_FOUND();
          }
          const [existing] = await db
            .select({
              name: categoryTranslation.name,
              updatedAt: categoryTranslation.updatedAt,
            })
            .from(categoryTranslation)
            .where(
              and(
                eq(categoryTranslation.categoryId, input.id),
                eq(categoryTranslation.locale, input.locale)
              )
            );
          if (
            (existing?.updatedAt.getTime() ?? null) !== input.expectedUpdatedAt
          ) {
            throw errors.CONFLICT({ data: { reason: "stale" } });
          }
          if (existing?.name === input.name) {
            // Nothing differs: write nothing, make no entry.
            markUnchanged(db);
            return { updatedAt: existing.updatedAt.getTime() };
          }
          const updatedAt = nextUpdatedAt(existing?.updatedAt ?? 0);
          const statements: Statement[] = [
            staleGuard(
              db,
              "category_translation",
              "category_id",
              input.id,
              input.locale,
              input.expectedUpdatedAt
            ),
            db
              .insert(categoryTranslation)
              .values({
                categoryId: input.id,
                locale: input.locale,
                name: input.name,
                updatedAt,
                updatedBy: context.user.id,
              })
              .onConflictDoUpdate({
                set: {
                  name: input.name,
                  updatedAt,
                  updatedBy: context.user.id,
                },
                target: [
                  categoryTranslation.categoryId,
                  categoryTranslation.locale,
                ],
              }),
            ...rebuildCategoryGesturesFtsSql(input.id).map((statement) =>
              db.run(statement)
            ),
            auditStatement(db, {
              action: "translation.category_save",
              actorId: context.user.id,
              data: {
                created: existing === undefined,
                locale: input.locale,
                name: row.name,
                slug: row.slug,
              },
              targetId: input.id,
              targetType: "category",
            }),
          ];
          try {
            await runCatalogBatch(
              db,
              statements,
              "save a category translation"
            );
          } catch (error) {
            if (error instanceof GuardFailedError) {
              throw errors.CONFLICT({ data: { reason: "stale" } });
            }
            throw error;
          }
          await bumpCatalog(deps, context.kv, "a category translation");
          return { updatedAt: updatedAt.getTime() };
        }
      ),
    },
    gestures: {
      get: translatorProcedure.gestures.get.handler(
        async ({ context, errors, input }) => {
          const found = await getGesture(context.db, input.id);
          if (!found) {
            throw errors.NOT_FOUND();
          }
          return found;
        }
      ),
      list: translatorProcedure.gestures.list.handler(
        async ({ context, errors, input }) => {
          if (!(await isTranslatable(context.db, input.locale))) {
            throw errors.VALIDATION(validation("locale", "not translatable"));
          }
          try {
            return await listGestures(context.db, input);
          } catch (error) {
            if (error instanceof InvalidCursorError) {
              throw errors.VALIDATION(validation("cursor", "invalid"));
            }
            throw error;
          }
        }
      ),
      save: translatorProcedure.gestures.save.handler(
        async ({ context, errors, input }) => {
          const { db } = context;
          if (!(await isTranslatable(db, input.locale))) {
            throw errors.VALIDATION(validation("locale", "not translatable"));
          }
          const [row] = await db
            .select({ name: gesture.name, slug: gesture.slug })
            .from(gesture)
            .where(eq(gesture.id, input.id));
          if (!row) {
            throw errors.NOT_FOUND();
          }
          const existing = await storedTranslation(db, input.id, input.locale);
          if (
            (existing?.updatedAt.getTime() ?? null) !== input.expectedUpdatedAt
          ) {
            throw errors.CONFLICT({ data: { reason: "stale" } });
          }
          const changed = changedFields(existing, input);
          if (changed === null) {
            // Nothing differs: answer with what is stored, write nothing.
            markUnchanged(db);
            return { updatedAt: existing?.updatedAt.getTime() ?? 0 };
          }
          const updatedAt = nextUpdatedAt(existing?.updatedAt ?? 0);
          const statements = gestureSaveStatements({
            actorId: context.user.id,
            changed,
            created: existing === null,
            db,
            input,
            row,
            updatedAt,
          });
          try {
            await runCatalogBatch(db, statements, "save a gesture translation");
          } catch (error) {
            if (error instanceof GuardFailedError) {
              throw errors.CONFLICT({ data: { reason: "stale" } });
            }
            throw error;
          }
          await bumpCatalog(deps, context.kv, "a gesture translation");
          return { updatedAt: updatedAt.getTime() };
        }
      ),
    },
    reports: translatorProcedure.reports.handler(async ({ context }) => {
      const locales = await translatableLanguages(context.db);
      const reports: TranslationReport[] = await Promise.all(
        locales.map((locale) => translationReport(context.db, locale))
      );
      return reports;
    }),
  });
}

export type CatalogTranslationRouter = ReturnType<
  typeof createCatalogTranslationRouter
>;
