import {
  category,
  gesture,
  gestureCategory,
  gestureKeyword,
  gestureSortName,
  inList,
  jsonList,
  rebuildGestureFtsSql,
  rebuildGesturesFtsSql,
  ref,
  sponsorship,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import {
  decodeCursorAs,
  encodeCursor,
  InvalidCursorError,
  newId,
  normalizeText,
} from "@smog/utils";
import { and, eq, isNotNull, isNull, ne, type SQL, sql } from "drizzle-orm";
import {
  type AdminGestureCategory,
  type AdminGestureDetail,
  type AdminGestureListQuery,
  type AdminGesturePage,
  type AdminGestureRow,
  GESTURE_PATCH_FIELDS,
  type GesturePatch,
  type GesturePatchField,
} from "../schema";
import { auditStatement } from "./audit-writer";
import {
  bumpCatalog,
  failWhen,
  GuardFailedError,
  nextUpdatedAt,
  runCatalogBatch,
  type Statement,
  withFreeSlug,
} from "./catalog-writes";
import { type AdminDeps, adminProcedure } from "./procedure";

// --- Reads -----------------------------------------------------------------

const G = "gesture";

function parseJson<T>(value: unknown): T {
  return JSON.parse(String(value)) as T;
}

interface StoredCategory {
  id: string;
  name: string;
  published: 0 | 1;
  slug: string;
}

/** Every category of the gesture (published or not), in category order. */
const categoriesColumn =
  sql`(SELECT json_group_array(json_object('id', o.id, 'name', o.name, 'slug', o.slug, 'published', o.published)) FROM (SELECT ${ref("c", category.id)} AS id, ${ref("c", category.name)} AS name, ${ref("c", category.slug)} AS slug, ${ref("c", category.publishedAt)} IS NOT NULL AS published FROM ${gestureCategory} AS gc JOIN ${category} AS c ON ${ref("c", category.id)} = ${ref("gc", gestureCategory.categoryId)} WHERE ${ref("gc", gestureCategory.gestureId)} = ${ref(G, gesture.id)} ORDER BY ${ref("c", category.sortOrder)}, ${ref("c", category.name)} COLLATE NOCASE) AS o)`.mapWith(
    (value): AdminGestureCategory[] =>
      parseJson<StoredCategory[]>(value).map((item) => ({
        id: item.id,
        name: item.name,
        published: item.published === 1,
        slug: item.slug,
      }))
  );

/** Keywords in the editor's order. */
const keywordsColumn =
  sql`(SELECT json_group_array(o.keyword) FROM (SELECT ${ref("k", gestureKeyword.keyword)} AS keyword FROM ${gestureKeyword} AS k WHERE ${ref("k", gestureKeyword.gestureId)} = ${ref(G, gesture.id)} ORDER BY ${ref("k", gestureKeyword.position)}) AS o)`.mapWith(
    parseJson<string[]>
  );

const rowColumns = {
  categories: categoriesColumn,
  description: gesture.description,
  id: gesture.id,
  keywords: keywordsColumn,
  muxAssetId: gesture.muxAssetId,
  name: gesture.name,
  playbackId: gesture.playbackId,
  publishedAt: gesture.publishedAt,
  slug: gesture.slug,
  updatedAt: gesture.updatedAt,
};

const detailColumns = {
  ...rowColumns,
  createdAt: gesture.createdAt,
};

interface StoredRow {
  categories: AdminGestureCategory[];
  description: string;
  id: string;
  keywords: string[];
  muxAssetId: string | null;
  name: string;
  playbackId: string;
  publishedAt: Date | null;
  slug: string;
  updatedAt: Date;
}

function toRow(row: StoredRow): AdminGestureRow {
  return {
    categories: row.categories,
    description: row.description,
    id: row.id,
    keywords: row.keywords,
    muxAssetId: row.muxAssetId,
    name: row.name,
    playbackId: row.playbackId,
    publishedAt: row.publishedAt?.getTime() ?? null,
    slug: row.slug,
    updatedAt: row.updatedAt.getTime(),
  };
}

function toDetail(row: StoredRow & { createdAt: Date }): AdminGestureDetail {
  return { ...toRow(row), createdAt: row.createdAt.getTime() };
}

/** The keyset position of a page's last row. */
interface ListPosition {
  id: string;
  sortName: string;
}

function parseListCursor(cursor: string): ListPosition {
  return decodeCursorAs(cursor, (key) => {
    const [sortName, id] = key;
    return key.length === 2 &&
      typeof sortName === "string" &&
      typeof id === "string"
      ? { id, sortName }
      : null;
  });
}

/**
 * After the position in `(sort_name, id)` order, as a range on the first
 * key, so SQLite seeks `gesture_sort_name_idx` (migration 0006).
 */
function after(position: ListPosition): SQL {
  const key = sql`${gesture.sortName}`;
  return sql`${key} >= ${position.sortName} AND (${key} > ${position.sortName} OR ${gesture.id} > ${position.id})`;
}

/**
 * The ids of the gestures with a keyword containing `needle`
 * (`normalizeText`). SQLite cannot strip accents, so the keywords are read
 * and compared here: one read of `gesture_keyword` (a few thousand short
 * rows at SMOG's size; DECISIONS).
 */
async function keywordMatches(db: Db, needle: string): Promise<string[]> {
  const rows = await db
    .select({
      gestureId: gestureKeyword.gestureId,
      keyword: gestureKeyword.keyword,
    })
    .from(gestureKeyword);
  const ids = new Set<string>();
  for (const row of rows) {
    if (normalizeText(row.keyword).includes(needle)) {
      ids.add(row.gestureId);
    }
  }
  return [...ids];
}

/** The `q` and `category` filters (the counts ignore `status`). */
function listFilters(
  query: AdminGestureListQuery,
  needle: string,
  keywordIds: readonly string[]
): SQL | undefined {
  return and(
    needle === ""
      ? undefined
      : sql`(instr(${gesture.sortName}, ${needle}) > 0 OR ${gesture.id} IN (SELECT value FROM json_each(${jsonList(keywordIds)})))`,
    query.category && query.category.length > 0
      ? sql`${gesture.id} IN (SELECT ${ref("gc", gestureCategory.gestureId)} FROM ${gestureCategory} AS gc WHERE ${ref("gc", gestureCategory.categoryId)} IN (SELECT value FROM json_each(${jsonList(query.category)})))`
      : undefined
  );
}

function statusFilter(
  status: AdminGestureListQuery["status"]
): SQL | undefined {
  if (status === "published") {
    return isNotNull(gesture.publishedAt);
  }
  return status === "unpublished" ? isNull(gesture.publishedAt) : undefined;
}

/** The page query: `limit + 1` rows in `sort_name, id` order. */
export function adminGesturesQuery(
  db: Db,
  filters: SQL | undefined,
  status: AdminGestureListQuery["status"],
  position: ListPosition | null,
  limit: number
) {
  return db
    .select({ ...rowColumns, sortName: gesture.sortName })
    .from(gesture)
    .where(
      and(filters, statusFilter(status), position ? after(position) : undefined)
    )
    .orderBy(sql`${gesture.sortName}`, sql`${gesture.id}`)
    .limit(limit + 1);
}

/** A page of every gesture (`InvalidCursorError` for a foreign cursor). */
async function listAdminGestures(
  db: Db,
  query: AdminGestureListQuery
): Promise<AdminGesturePage> {
  const position =
    query.cursor === undefined ? null : parseListCursor(query.cursor);
  const needle = normalizeText(query.q ?? "");
  try {
    const keywordIds = needle === "" ? [] : await keywordMatches(db, needle);
    const filters = listFilters(query, needle, keywordIds);
    const [rows, [counts]] = await db.batch([
      adminGesturesQuery(db, filters, query.status, position, query.limit),
      db
        .select({
          published: sql<number>`count(${gesture.publishedAt})`.mapWith(Number),
          total: sql<number>`count(*)`.mapWith(Number),
        })
        .from(gesture)
        .where(filters),
    ]);
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    const total = counts?.total ?? 0;
    const published = counts?.published ?? 0;
    return {
      counts: { published, total, unpublished: total - published },
      items: page.map(toRow),
      nextCursor:
        rows.length > query.limit && last
          ? encodeCursor([last.sortName, last.id])
          : null,
    };
  } catch (error) {
    console.error("[admin] Failed to list gestures:", error);
    throw error;
  }
}

/** One gesture's detail, or `null`. */
async function findAdminGesture(
  db: Db,
  id: string
): Promise<AdminGestureDetail | null> {
  const [row] = await db
    .select(detailColumns)
    .from(gesture)
    .where(eq(gesture.id, id));
  return row ? toDetail(row) : null;
}

/** Rows by id, in the order given (unknown ids dropped). */
async function findAdminGestureRows(
  db: Db,
  ids: readonly string[]
): Promise<AdminGestureRow[]> {
  const rows = await db
    .select(rowColumns)
    .from(gesture)
    .where(inList(gesture.id, ids));
  const byId = new Map(rows.map((row) => [row.id, toRow(row)]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

// --- Writes -----------------------------------------------------------------

/** What a write needs from a gesture before it changes it. */
interface Current {
  id: string;
  name: string;
  publishedAt: Date | null;
  slug: string;
  updatedAt: Date;
}

async function currentGestures(
  db: Db,
  ids: readonly string[]
): Promise<Map<string, Current>> {
  const rows = await db
    .select({
      id: gesture.id,
      name: gesture.name,
      publishedAt: gesture.publishedAt,
      slug: gesture.slug,
      updatedAt: gesture.updatedAt,
    })
    .from(gesture)
    .where(inList(gesture.id, ids));
  return new Map(rows.map((row) => [row.id, row]));
}

/** The ids among `ids` that are not categories. */
async function unknownCategories(
  db: Db,
  ids: readonly string[]
): Promise<string[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = await db
    .select({ id: category.id })
    .from(category)
    .where(inList(category.id, ids));
  const known = new Set(rows.map((row) => row.id));
  return ids.filter((id) => !known.has(id));
}

/** The keyword rows for a gesture, in order (already trimmed and de-duplicated). */
function keywordRows(gestureId: string, keywords: readonly string[]) {
  return keywords.map((keyword, position) => ({
    gestureId,
    keyword,
    position,
  }));
}

/** The statements that apply `patch` to one gesture (no guards, FTS or audit). */
function patchStatements(
  db: Db,
  id: string,
  patch: GesturePatch,
  updatedAt: Date
): Statement[] {
  const statements: Statement[] = [
    db
      .update(gesture)
      .set({
        ...(patch.name === undefined
          ? {}
          : { name: patch.name, sortName: gestureSortName(patch.name) }),
        ...(patch.description === undefined
          ? {}
          : { description: patch.description }),
        ...(patch.playbackId === undefined
          ? {}
          : { playbackId: patch.playbackId }),
        ...(patch.muxAssetId === undefined
          ? {}
          : { muxAssetId: patch.muxAssetId }),
        updatedAt,
      })
      .where(eq(gesture.id, id)),
  ];
  if (patch.keywords !== undefined) {
    statements.push(
      db.delete(gestureKeyword).where(eq(gestureKeyword.gestureId, id))
    );
    if (patch.keywords.length > 0) {
      statements.push(
        db.insert(gestureKeyword).values(keywordRows(id, patch.keywords))
      );
    }
  }
  if (patch.categoryIds !== undefined) {
    statements.push(
      db.delete(gestureCategory).where(eq(gestureCategory.gestureId, id)),
      db
        .insert(gestureCategory)
        .values(
          patch.categoryIds.map((categoryId) => ({ categoryId, gestureId: id }))
        )
    );
  }
  return statements;
}

function patchFields(patch: GesturePatch): GesturePatchField[] {
  return GESTURE_PATCH_FIELDS.filter((field) => patch[field] !== undefined);
}

/** `db.run` for each raw FTS statement. */
function fts(db: Db, statements: readonly SQL[]): Statement[] {
  return statements.map((statement) => db.run(statement));
}

interface PatchItem {
  expectedUpdatedAt: number;
  id: string;
  patch: GesturePatch;
}

type PatchOutcome =
  | { ok: true }
  | { ids: string[]; reason: "stale" }
  | { ids: string[]; reason: "missing" }
  | { field: "categoryIds" | "patch"; reason: "invalid" };

/**
 * Applies every patch in one batch, all or nothing: a guard first checks
 * that every row still has its `expectedUpdatedAt` (the batch rolls back
 * otherwise), then the changes, the FTS rows and one `gesture.update`
 * entry per gesture.
 */
async function applyPatches(
  db: Db,
  actorId: string,
  items: readonly PatchItem[]
): Promise<PatchOutcome> {
  if (items.some((item) => patchFields(item.patch).length === 0)) {
    return { field: "patch", reason: "invalid" };
  }
  const ids = items.map((item) => item.id);
  const current = await currentGestures(db, ids);
  const missing = ids.filter((id) => !current.has(id));
  if (missing.length > 0) {
    return { ids: missing, reason: "missing" };
  }
  const stale = items.filter(
    (item) =>
      current.get(item.id)?.updatedAt.getTime() !== item.expectedUpdatedAt
  );
  if (stale.length > 0) {
    return { ids: stale.map((item) => item.id), reason: "stale" };
  }
  const categoryIds = [
    ...new Set(items.flatMap((item) => item.patch.categoryIds ?? [])),
  ];
  if ((await unknownCategories(db, categoryIds)).length > 0) {
    return { field: "categoryIds", reason: "invalid" };
  }
  const expected = jsonList(
    items.map((item) => [item.id, item.expectedUpdatedAt])
  );
  const statements: Statement[] = [
    failWhen(
      db,
      "stale",
      sql`(SELECT count(*) FROM ${gesture} AS g JOIN json_each(${expected}) AS e ON ${ref("g", gesture.id)} = json_extract(e.value, '$[0]') AND ${ref("g", gesture.updatedAt)} = json_extract(e.value, '$[1]')) <> ${items.length}`
    ),
  ];
  for (const item of items) {
    const row = current.get(item.id) as Current;
    const name = item.patch.name ?? row.name;
    statements.push(
      ...patchStatements(
        db,
        item.id,
        item.patch,
        nextUpdatedAt(item.expectedUpdatedAt)
      )
    );
    statements.push(
      auditStatement(db, {
        action: "gesture.update",
        actorId,
        data: {
          fields: patchFields(item.patch),
          name,
          slug: row.slug,
          ...(item.patch.name !== undefined && item.patch.name !== row.name
            ? { previousName: row.name }
            : {}),
        },
        targetId: item.id,
        targetType: "gesture",
      })
    );
  }
  statements.push(...fts(db, rebuildGesturesFtsSql(ids)));
  try {
    await runCatalogBatch(db, statements, "update gestures");
  } catch (error) {
    if (error instanceof GuardFailedError) {
      // Another save landed between the read and the batch.
      const now = await currentGestures(db, ids);
      return {
        ids: items
          .filter(
            (item) =>
              now.get(item.id)?.updatedAt.getTime() !== item.expectedUpdatedAt
          )
          .map((item) => item.id),
        reason: "stale",
      };
    }
    throw error;
  }
  return { ok: true };
}

/**
 * What a delete needs: the name and slug for the audit entry, and why it
 * is refused (a published or a sponsored gesture; the sponsorship FK is
 * RESTRICT and its records belong to the sponsor).
 */
async function deletable(
  db: Db,
  id: string
): Promise<{
  blocked: "published" | "sponsored" | null;
  name: string;
  slug: string;
} | null> {
  const [row] = await db
    .select({
      name: gesture.name,
      published: sql<number>`${gesture.publishedAt} IS NOT NULL`.mapWith(
        Number
      ),
      slug: gesture.slug,
      sponsored:
        sql<number>`EXISTS (SELECT 1 FROM ${sponsorship} AS s WHERE ${ref("s", sponsorship.gestureId)} = ${ref(G, gesture.id)})`.mapWith(
          Number
        ),
    })
    .from(gesture)
    .where(eq(gesture.id, id));
  if (!row) {
    return null;
  }
  let blocked: "published" | "sponsored" | null = null;
  if (row.published) {
    blocked = "published";
  } else if (row.sponsored) {
    blocked = "sponsored";
  }
  return { blocked, name: row.name, slug: row.slug };
}

interface BulkPatch {
  add: string[];
  published: boolean | undefined;
  remove: string[];
}

/** Whether removing `remove` (and adding nothing) leaves a gesture without a category. */
async function wouldLeaveUncategorised(
  db: Db,
  ids: readonly string[],
  add: readonly string[],
  remove: readonly string[]
): Promise<boolean> {
  if (add.length > 0) {
    return false;
  }
  const links = await db
    .select({
      categoryId: gestureCategory.categoryId,
      gestureId: gestureCategory.gestureId,
    })
    .from(gestureCategory)
    .where(inList(gestureCategory.gestureId, ids));
  return ids.some(
    (id) =>
      !links.some(
        (link) => link.gestureId === id && !remove.includes(link.categoryId)
      )
  );
}

/**
 * The bulk update's batch: the publish change and `updated_at`, the
 * category removals and additions, a guard that no gesture was left
 * without a category (after the changes), the FTS rows and one
 * `gesture.bulk_update` entry.
 */
function bulkStatements(
  db: Db,
  actorId: string,
  gestureIds: string[],
  patch: BulkPatch
): Statement[] {
  const ids = jsonList(gestureIds);
  const now = Date.now();
  const statements: Statement[] = [
    db
      .update(gesture)
      .set({
        ...(patch.published === undefined
          ? {}
          : {
              publishedAt: patch.published
                ? sql`coalesce(${gesture.publishedAt}, ${now})`
                : null,
            }),
        updatedAt: sql`max(${now}, ${gesture.updatedAt} + 1)`,
      })
      .where(inList(gesture.id, gestureIds)),
  ];
  if (patch.remove.length > 0) {
    statements.push(
      db
        .delete(gestureCategory)
        .where(
          and(
            inList(gestureCategory.gestureId, gestureIds),
            inList(gestureCategory.categoryId, patch.remove)
          )
        )
    );
  }
  if (patch.add.length > 0) {
    statements.push(
      db
        .insert(gestureCategory)
        // `WHERE true`: SQLite would read `ON CONFLICT` as a join constraint.
        .select(
          sql`SELECT g.value, c.value FROM json_each(${ids}) AS g, json_each(${jsonList(patch.add)}) AS c WHERE true`
        )
        .onConflictDoNothing()
    );
  }
  statements.push(
    failWhen(
      db,
      "uncategorised",
      sql`EXISTS (SELECT 1 FROM json_each(${ids}) AS g WHERE NOT EXISTS (SELECT 1 FROM ${gestureCategory} AS gc WHERE ${ref("gc", gestureCategory.gestureId)} = g.value))`
    ),
    ...fts(db, rebuildGesturesFtsSql(gestureIds)),
    auditStatement(db, {
      action: "gesture.bulk_update",
      actorId,
      data: {
        ids: gestureIds,
        patch: {
          ...(patch.add.length > 0 ? { addCategoryIds: patch.add } : {}),
          ...(patch.published === undefined
            ? {}
            : { published: patch.published }),
          ...(patch.remove.length > 0
            ? { removeCategoryIds: patch.remove }
            : {}),
        },
      },
      targetId: null,
      targetType: "gesture",
    })
  );
  return statements;
}

function validation(field: string, message: string) {
  return { data: { fieldErrors: { [field]: [message] }, formErrors: [] } };
}

/** The `gestures` slice of the admin router (A-16–A-21). */
export function gesturesRoutes(deps: AdminDeps) {
  return {
    gestures: {
      bulkUpdate: adminProcedure.gestures.bulkUpdate.handler(
        async ({ context, errors, input }) => {
          const add = [...new Set(input.addCategoryIds ?? [])];
          const remove = [...new Set(input.removeCategoryIds ?? [])];
          if (
            input.published === undefined &&
            add.length === 0 &&
            remove.length === 0
          ) {
            throw errors.VALIDATION(
              validation("published", "nothing to change")
            );
          }
          if (add.some((id) => remove.includes(id))) {
            throw errors.VALIDATION(
              validation("removeCategoryIds", "also added")
            );
          }
          const { db } = context;
          const current = await currentGestures(db, input.ids);
          if (current.size !== input.ids.length) {
            throw errors.NOT_FOUND();
          }
          if ((await unknownCategories(db, add)).length > 0) {
            throw errors.VALIDATION(
              validation("addCategoryIds", "unknown category")
            );
          }
          if (await wouldLeaveUncategorised(db, input.ids, add, remove)) {
            throw errors.INVALID_STATE();
          }
          const statements = bulkStatements(db, context.user.id, input.ids, {
            add,
            published: input.published,
            remove,
          });
          try {
            await runCatalogBatch(db, statements, "bulk update gestures");
          } catch (error) {
            if (error instanceof GuardFailedError) {
              throw errors.INVALID_STATE();
            }
            throw error;
          }
          await bumpCatalog(deps, context.kv, "a gesture bulk update");
          return { updated: input.ids.length };
        }
      ),
      checkName: adminProcedure.gestures.checkName.handler(
        async ({ context, input }) => {
          const duplicates = await context.db
            .select({ id: gesture.id, name: gesture.name, slug: gesture.slug })
            .from(gesture)
            .where(
              and(
                eq(gesture.sortName, gestureSortName(input.name)),
                input.excludeId === undefined
                  ? undefined
                  : ne(gesture.id, input.excludeId)
              )
            )
            .orderBy(gesture.slug)
            .limit(20);
          return { duplicates };
        }
      ),
      create: adminProcedure.gestures.create.handler(
        async ({ context, errors, input }) => {
          const { db } = context;
          if ((await unknownCategories(db, input.categoryIds)).length > 0) {
            throw errors.VALIDATION(
              validation("categoryIds", "unknown category")
            );
          }
          const id = newId();
          const now = new Date();
          await withFreeSlug(db, gesture, input.name, async (slug) => {
            const statements: Statement[] = [
              db.insert(gesture).values({
                createdAt: now,
                description: input.description,
                id,
                muxAssetId: input.muxAssetId ?? null,
                name: input.name,
                playbackId: input.playbackId,
                publishedAt: input.published ? now : null,
                slug,
                sortName: gestureSortName(input.name),
                updatedAt: now,
              }),
              db.insert(gestureCategory).values(
                input.categoryIds.map((categoryId) => ({
                  categoryId,
                  gestureId: id,
                }))
              ),
            ];
            if (input.keywords.length > 0) {
              statements.push(
                db
                  .insert(gestureKeyword)
                  .values(keywordRows(id, input.keywords))
              );
            }
            statements.push(
              ...fts(db, rebuildGestureFtsSql(id)),
              auditStatement(db, {
                action: "gesture.create",
                actorId: context.user.id,
                data: { name: input.name, published: input.published, slug },
                targetId: id,
                targetType: "gesture",
              })
            );
            await runCatalogBatch(db, statements, "create a gesture");
          });
          await bumpCatalog(deps, context.kv, "a gesture create");
          const created = await findAdminGesture(db, id);
          if (!created) {
            throw new Error(
              `[admin] Failed to read back the new gesture ${id}`
            );
          }
          return created;
        }
      ),
      delete: adminProcedure.gestures.delete.handler(
        async ({ context, errors, input }) => {
          const { db } = context;
          const row = await deletable(db, input.id);
          if (!row) {
            throw errors.NOT_FOUND();
          }
          if (input.confirmName !== row.name.trim()) {
            throw errors.VALIDATION(
              validation("confirmName", "does not match")
            );
          }
          if (row.blocked) {
            throw errors.CONFLICT({ data: { reason: row.blocked } });
          }
          try {
            await runCatalogBatch(
              db,
              [
                failWhen(
                  db,
                  "undeletable",
                  sql`EXISTS (SELECT 1 FROM ${gesture} AS g WHERE ${ref("g", gesture.id)} = ${input.id} AND ${ref("g", gesture.publishedAt)} IS NOT NULL) OR EXISTS (SELECT 1 FROM ${sponsorship} AS s WHERE ${ref("s", sponsorship.gestureId)} = ${input.id})`
                ),
                db.delete(gesture).where(eq(gesture.id, input.id)),
                ...fts(db, rebuildGestureFtsSql(input.id)),
                auditStatement(db, {
                  action: "gesture.delete",
                  actorId: context.user.id,
                  data: { name: row.name, slug: row.slug },
                  targetId: input.id,
                  targetType: "gesture",
                }),
              ],
              "delete a gesture"
            );
          } catch (error) {
            if (error instanceof GuardFailedError) {
              // Published or sponsored since the read.
              const now = await deletable(db, input.id);
              throw errors.CONFLICT({
                data: { reason: now?.blocked ?? "published" },
              });
            }
            throw error;
          }
          await bumpCatalog(deps, context.kv, "a gesture delete");
          return { id: input.id };
        }
      ),
      get: adminProcedure.gestures.get.handler(
        async ({ context, errors, input }) => {
          const found = await findAdminGesture(context.db, input.id);
          if (!found) {
            throw errors.NOT_FOUND();
          }
          return found;
        }
      ),
      list: adminProcedure.gestures.list.handler(
        async ({ context, errors, input }) => {
          try {
            return await listAdminGestures(context.db, input);
          } catch (error) {
            if (error instanceof InvalidCursorError) {
              throw errors.VALIDATION(validation("cursor", "invalid"));
            }
            throw error;
          }
        }
      ),
      saveMany: adminProcedure.gestures.saveMany.handler(
        async ({ context, errors, input }) => {
          const outcome = await applyPatches(
            context.db,
            context.user.id,
            input.items
          );
          if (!("ok" in outcome)) {
            if (outcome.reason === "stale") {
              throw errors.CONFLICT({
                data: { ids: outcome.ids, reason: "stale" },
              });
            }
            if (outcome.reason === "missing") {
              throw errors.NOT_FOUND();
            }
            throw errors.VALIDATION(validation(outcome.field, "invalid"));
          }
          await bumpCatalog(deps, context.kv, "a gesture table save");
          return {
            items: await findAdminGestureRows(
              context.db,
              input.items.map((item) => item.id)
            ),
          };
        }
      ),
      setPublished: adminProcedure.gestures.setPublished.handler(
        async ({ context, errors, input }) => {
          const { db } = context;
          const row = (await currentGestures(db, [input.id])).get(input.id);
          if (!row) {
            throw errors.NOT_FOUND();
          }
          if ((row.publishedAt !== null) === input.published) {
            throw errors.INVALID_STATE();
          }
          try {
            await runCatalogBatch(
              db,
              [
                // Another admin changed the state meanwhile: nothing to do.
                failWhen(
                  db,
                  "unchanged",
                  sql`NOT EXISTS (SELECT 1 FROM ${gesture} AS g WHERE ${ref("g", gesture.id)} = ${input.id} AND ${ref("g", gesture.publishedAt)} ${input.published ? sql`IS NULL` : sql`IS NOT NULL`})`
                ),
                db
                  .update(gesture)
                  .set({
                    publishedAt: input.published ? new Date() : null,
                    updatedAt: nextUpdatedAt(row.updatedAt),
                  })
                  .where(eq(gesture.id, input.id)),
                ...fts(db, rebuildGestureFtsSql(input.id)),
                auditStatement(db, {
                  action: input.published
                    ? "gesture.publish"
                    : "gesture.unpublish",
                  actorId: context.user.id,
                  data: { name: row.name, slug: row.slug },
                  targetId: input.id,
                  targetType: "gesture",
                }),
              ],
              input.published ? "publish a gesture" : "unpublish a gesture"
            );
          } catch (error) {
            if (error instanceof GuardFailedError) {
              throw errors.INVALID_STATE();
            }
            throw error;
          }
          await bumpCatalog(deps, context.kv, "a gesture publish change");
          return (await findAdminGesture(db, input.id)) as AdminGestureDetail;
        }
      ),
      update: adminProcedure.gestures.update.handler(
        async ({ context, errors, input }) => {
          const { expectedUpdatedAt, id, ...patch } = input;
          const outcome = await applyPatches(context.db, context.user.id, [
            { expectedUpdatedAt, id, patch },
          ]);
          if (!("ok" in outcome)) {
            if (outcome.reason === "stale") {
              throw errors.CONFLICT({
                data: { ids: outcome.ids, reason: "stale" },
              });
            }
            if (outcome.reason === "missing") {
              throw errors.NOT_FOUND();
            }
            throw errors.VALIDATION(validation(outcome.field, "invalid"));
          }
          await bumpCatalog(deps, context.kv, "a gesture update");
          return (await findAdminGesture(context.db, id)) as AdminGestureDetail;
        }
      ),
    },
  };
}
