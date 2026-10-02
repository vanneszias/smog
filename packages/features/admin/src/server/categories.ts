import {
  category,
  gesture,
  gestureCategory,
  rebuildCategoryGesturesFtsSql,
  ref,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import { newId, normalizeText } from "@smog/utils";
import { asc, eq, type SQL, sql } from "drizzle-orm";
import { ADMIN_CATEGORIES_MAX, type AdminCategory } from "../schema";
import { auditStatement } from "./audit-writer";
import {
  bumpCatalog,
  failWhen,
  GuardFailedError,
  jsonList,
  nextUpdatedAt,
  runCatalogBatch,
  type Statement,
  withFreeSlug,
} from "./catalog-writes";
import { type AdminDeps, adminProcedure } from "./procedure";

/** The outer row's name in the category queries. */
const C = "category";

/**
 * Every category with its counts, by `sort_order` then name (the public
 * order), read from D1: never the catalog snapshot (`gestures.categories`).
 */
function categoriesQuery(db: Db, where?: SQL) {
  return db
    .select({
      gestureCount:
        sql<number>`(SELECT count(*) FROM ${gestureCategory} AS gc WHERE ${ref("gc", gestureCategory.categoryId)} = ${ref(C, category.id)})`.mapWith(
          Number
        ),
      id: category.id,
      name: category.name,
      publishedAt: category.publishedAt,
      publishedGestureCount:
        sql<number>`(SELECT count(*) FROM ${gestureCategory} AS gc JOIN ${gesture} AS g ON ${ref("g", gesture.id)} = ${ref("gc", gestureCategory.gestureId)} WHERE ${ref("gc", gestureCategory.categoryId)} = ${ref(C, category.id)} AND ${ref("g", gesture.publishedAt)} IS NOT NULL)`.mapWith(
          Number
        ),
      slug: category.slug,
      sortOrder: category.sortOrder,
      updatedAt: category.updatedAt,
    })
    .from(category)
    .where(where)
    .orderBy(
      asc(category.sortOrder),
      sql`${category.name} COLLATE NOCASE`,
      asc(category.id)
    )
    .limit(ADMIN_CATEGORIES_MAX);
}

type CategoryRow = Awaited<ReturnType<typeof categoriesQuery>>[number];

function toCategory(row: CategoryRow): AdminCategory {
  return {
    gestureCount: row.gestureCount,
    id: row.id,
    name: row.name,
    publishedAt: row.publishedAt?.getTime() ?? null,
    publishedGestureCount: row.publishedGestureCount,
    slug: row.slug,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.getTime(),
  };
}

async function listAdminCategories(db: Db): Promise<AdminCategory[]> {
  try {
    return (await categoriesQuery(db)).map(toCategory);
  } catch (error) {
    console.error("[admin] Failed to list categories:", error);
    throw error;
  }
}

async function findCategory(db: Db, id: string): Promise<AdminCategory | null> {
  const [row] = await categoriesQuery(db, eq(category.id, id));
  return row ? toCategory(row) : null;
}

/**
 * Whether another category has a `normalizeText`-equal name (ruling 8).
 * SQLite cannot strip accents, so the names (tens of rows) are compared
 * here.
 */
async function nameTaken(
  db: Db,
  name: string,
  exceptId?: string
): Promise<boolean> {
  const wanted = normalizeText(name);
  const rows = await db
    .select({ id: category.id, name: category.name })
    .from(category);
  return rows.some(
    (row) => row.id !== exceptId && normalizeText(row.name) === wanted
  );
}

/** `CONFLICT` `inUse`: some gesture has the category. */
function inUse(id: string): SQL {
  return sql`EXISTS (SELECT 1 FROM ${gestureCategory} WHERE ${gestureCategory.categoryId} = ${id})`;
}

function fts(db: Db, statements: readonly SQL[]): Statement[] {
  return statements.map((statement) => db.run(statement));
}

/** The `categories` slice of the admin router (A-22). */
export function categoriesRoutes(deps: AdminDeps) {
  return {
    categories: {
      create: adminProcedure.categories.create.handler(
        async ({ context, errors, input }) => {
          const { db } = context;
          if (await nameTaken(db, input.name)) {
            throw errors.CONFLICT({ data: { reason: "duplicateName" } });
          }
          // `list` and `reorder` handle at most this many (the exact set).
          const full = sql`(SELECT count(*) FROM ${category}) >= ${ADMIN_CATEGORIES_MAX}`;
          const [{ isFull } = { isFull: 0 }] = await db
            .select({ isFull: sql<number>`${full}`.mapWith(Number) })
            .from(sql`(SELECT 1)`);
          if (isFull) {
            throw errors.INVALID_STATE();
          }
          const id = newId();
          const now = new Date();
          try {
            await withFreeSlug(db, category, input.name, async (slug) => {
              await runCatalogBatch(
                db,
                [
                  failWhen(db, "full", full),
                  db.insert(category).values({
                    createdAt: now,
                    id,
                    name: input.name,
                    publishedAt: input.published ? now : null,
                    slug,
                    // At the end of the order.
                    sortOrder: sql`(SELECT coalesce(max(${category.sortOrder}) + 1, 0) FROM ${category})`,
                    updatedAt: now,
                  }),
                  auditStatement(db, {
                    action: "category.create",
                    actorId: context.user.id,
                    data: {
                      name: input.name,
                      published: input.published,
                      slug,
                    },
                    targetId: id,
                    targetType: "category",
                  }),
                ],
                "create a category"
              );
            });
          } catch (error) {
            if (error instanceof GuardFailedError) {
              throw errors.INVALID_STATE();
            }
            throw error;
          }
          await bumpCatalog(deps, context.kv, "a category create");
          return (await findCategory(db, id)) as AdminCategory;
        }
      ),
      delete: adminProcedure.categories.delete.handler(
        async ({ context, errors, input }) => {
          const { db } = context;
          const [row] = await db
            .select({
              name: category.name,
              slug: category.slug,
              used: sql<number>`${inUse(input.id)}`.mapWith(Number),
            })
            .from(category)
            .where(eq(category.id, input.id));
          if (!row) {
            throw errors.NOT_FOUND();
          }
          if (row.used) {
            throw errors.CONFLICT({ data: { reason: "inUse" } });
          }
          try {
            // The guard repeats the check in the batch: a gesture that got the
            // category meanwhile keeps it (the link would cascade away), so no
            // gesture's FTS row ever needs the reindex a used delete would.
            await runCatalogBatch(
              db,
              [
                failWhen(db, "in-use", inUse(input.id)),
                db.delete(category).where(eq(category.id, input.id)),
                auditStatement(db, {
                  action: "category.delete",
                  actorId: context.user.id,
                  data: { name: row.name, slug: row.slug },
                  targetId: input.id,
                  targetType: "category",
                }),
              ],
              "delete a category"
            );
          } catch (error) {
            if (error instanceof GuardFailedError) {
              throw errors.CONFLICT({ data: { reason: "inUse" } });
            }
            throw error;
          }
          await bumpCatalog(deps, context.kv, "a category delete");
          return { id: input.id };
        }
      ),
      list: adminProcedure.categories.list.handler(
        async ({ context }) => await listAdminCategories(context.db)
      ),
      reorder: adminProcedure.categories.reorder.handler(
        async ({ context, errors, input }) => {
          const { db } = context;
          const current = await db.select({ id: category.id }).from(category);
          const wanted = new Set(input.ids);
          const exact =
            wanted.size === input.ids.length &&
            current.length === input.ids.length &&
            current.every((row) => wanted.has(row.id));
          if (!exact) {
            throw errors.INVALID_STATE();
          }
          const ids = jsonList(input.ids);
          try {
            await runCatalogBatch(
              db,
              [
                // A category created or deleted meanwhile: not the exact set.
                failWhen(
                  db,
                  "not-exact",
                  sql`(SELECT count(*) FROM ${category}) <> ${input.ids.length} OR EXISTS (SELECT 1 FROM ${category} AS c WHERE ${ref("c", category.id)} NOT IN (SELECT value FROM json_each(${ids})))`
                ),
                db
                  .update(category)
                  .set({
                    sortOrder: sql`(SELECT CAST(e.key AS INTEGER) FROM json_each(${ids}) AS e WHERE e.value = ${ref(C, category.id)})`,
                    // The order is not what the rename editor holds.
                    updatedAt: sql`${category.updatedAt}`,
                  })
                  .where(
                    sql`${category.id} IN (SELECT value FROM json_each(${ids}))`
                  ),
                auditStatement(db, {
                  action: "category.reorder",
                  actorId: context.user.id,
                  data: { ids: input.ids },
                  targetId: null,
                  targetType: "category",
                }),
              ],
              "reorder categories"
            );
          } catch (error) {
            if (error instanceof GuardFailedError) {
              throw errors.INVALID_STATE();
            }
            throw error;
          }
          await bumpCatalog(deps, context.kv, "a category reorder");
          return await listAdminCategories(db);
        }
      ),
      setPublished: adminProcedure.categories.setPublished.handler(
        async ({ context, errors, input }) => {
          const { db } = context;
          const [row] = await db
            .select({
              name: category.name,
              publishedAt: category.publishedAt,
              slug: category.slug,
              updatedAt: category.updatedAt,
            })
            .from(category)
            .where(eq(category.id, input.id));
          if (!row) {
            throw errors.NOT_FOUND();
          }
          if ((row.publishedAt !== null) === input.published) {
            throw errors.INVALID_STATE();
          }
          const state = input.published
            ? sql`${category.publishedAt} IS NULL`
            : sql`${category.publishedAt} IS NOT NULL`;
          try {
            await runCatalogBatch(
              db,
              [
                failWhen(
                  db,
                  "unchanged",
                  sql`NOT EXISTS (SELECT 1 FROM ${category} WHERE ${category.id} = ${input.id} AND ${state})`
                ),
                db
                  .update(category)
                  .set({
                    publishedAt: input.published ? new Date() : null,
                    updatedAt: nextUpdatedAt(row.updatedAt),
                  })
                  .where(eq(category.id, input.id)),
                // The `categories` column holds published category names only.
                ...fts(db, rebuildCategoryGesturesFtsSql(input.id)),
                auditStatement(db, {
                  action: input.published
                    ? "category.publish"
                    : "category.unpublish",
                  actorId: context.user.id,
                  data: { name: row.name, slug: row.slug },
                  targetId: input.id,
                  targetType: "category",
                }),
              ],
              input.published ? "publish a category" : "unpublish a category"
            );
          } catch (error) {
            if (error instanceof GuardFailedError) {
              throw errors.INVALID_STATE();
            }
            throw error;
          }
          await bumpCatalog(deps, context.kv, "a category publish change");
          return (await findCategory(db, input.id)) as AdminCategory;
        }
      ),
      update: adminProcedure.categories.update.handler(
        async ({ context, errors, input }) => {
          const { db } = context;
          const [row] = await db
            .select({
              name: category.name,
              slug: category.slug,
              updatedAt: category.updatedAt,
            })
            .from(category)
            .where(eq(category.id, input.id));
          if (!row) {
            throw errors.NOT_FOUND();
          }
          const stale = () =>
            errors.CONFLICT({ data: { ids: [input.id], reason: "stale" } });
          if (row.updatedAt.getTime() !== input.expectedUpdatedAt) {
            throw stale();
          }
          if (await nameTaken(db, input.name, input.id)) {
            throw errors.CONFLICT({ data: { reason: "duplicateName" } });
          }
          try {
            await runCatalogBatch(
              db,
              [
                failWhen(
                  db,
                  "stale",
                  sql`NOT EXISTS (SELECT 1 FROM ${category} WHERE ${category.id} = ${input.id} AND ${category.updatedAt} = ${input.expectedUpdatedAt})`
                ),
                // The slug stays: printed QR codes and shared links keep working.
                db
                  .update(category)
                  .set({
                    name: input.name,
                    updatedAt: nextUpdatedAt(input.expectedUpdatedAt),
                  })
                  .where(eq(category.id, input.id)),
                ...fts(db, rebuildCategoryGesturesFtsSql(input.id)),
                auditStatement(db, {
                  action: "category.update",
                  actorId: context.user.id,
                  data: {
                    name: input.name,
                    previousName: row.name,
                    slug: row.slug,
                  },
                  targetId: input.id,
                  targetType: "category",
                }),
              ],
              "rename a category"
            );
          } catch (error) {
            if (error instanceof GuardFailedError) {
              throw stale();
            }
            throw error;
          }
          await bumpCatalog(deps, context.kv, "a category rename");
          return (await findCategory(db, input.id)) as AdminCategory;
        }
      ),
    },
  };
}
