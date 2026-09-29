/**
 * The owner's lists and their items. Every function takes the signed-in
 * user's id and answers `NOT_FOUND` for a list it does not own, so another
 * user's list is indistinguishable from a missing one. Positions are dense
 * (`0..n-1`): an add appends at `max + 1` in one statement, a remove shifts
 * the rows after it down in the same D1 batch, and a reorder rewrites them
 * all.
 */
import { gesture, list, listItem, listShare } from "@smog/db";
import type { Db } from "@smog/db/client";
import type { GestureSummary } from "@smog/gestures/schema";
import { newId } from "@smog/utils";
import {
  and,
  desc,
  eq,
  inArray,
  type SQL,
  type SQLWrapper,
  sql,
} from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import {
  isExactSet,
  LIST_ITEMS_MAX,
  LISTS_MAX,
  type ListDetail,
  type ListItem,
  type ListSummary,
} from "../schema";

/**
 * Published gesture summaries by id, in the order asked (unknown and
 * unpublished ids dropped): `@smog/gestures/server` `findGesturesByIds`,
 * which `@smog/api` passes in (a feature never imports another's server).
 */
export type FindGestureSummaries = (
  db: Db,
  ids: readonly string[]
) => Promise<GestureSummary[]>;

export interface ListsDeps {
  db: Db;
  findSummaries: FindGestureSummaries;
}

export type ListsErrorCode = "FORBIDDEN" | "INVALID_STATE" | "NOT_FOUND";

/** A rule the router maps to the contract error of the same code. */
export class ListsError extends Error {
  readonly code: ListsErrorCode;

  constructor(code: ListsErrorCode, message: string) {
    super(`[lists] ${message}`);
    this.code = code;
    this.name = "ListsError";
  }
}

/**
 * `alias."column"`. Drizzle renders columns unqualified in single-table
 * statements, so a correlated subquery names both sides itself.
 */
function ref(alias: string, column: SQLiteColumn): SQL {
  return sql`${sql.raw(alias)}.${sql.identifier(column.name)}`;
}

/** The outer row's name in the list queries (the `list` table). */
const L = "list";

const hasActiveShare = (role: "edit" | "view"): SQL<number> =>
  sql<number>`EXISTS (SELECT 1 FROM ${listShare} AS s WHERE ${ref("s", listShare.listId)} = ${ref(L, list.id)} AND ${ref("s", listShare.role)} = ${role} AND ${ref("s", listShare.revokedAt)} IS NULL)`;

const summaryColumns = {
  description: list.description,
  edit: hasActiveShare("edit"),
  id: list.id,
  /** Published gestures only, like the items `get` returns. */
  itemCount: sql<number>`(SELECT count(*) FROM ${listItem} AS li JOIN ${gesture} AS g ON ${ref("g", gesture.id)} = ${ref("li", listItem.gestureId)} WHERE ${ref("li", listItem.listId)} = ${ref(L, list.id)} AND ${ref("g", gesture.publishedAt)} IS NOT NULL)`,
  name: list.name,
  updatedAt: list.updatedAt,
  view: hasActiveShare("view"),
};

interface SummaryRow {
  description: string | null;
  edit: number;
  id: string;
  itemCount: number;
  name: string;
  updatedAt: Date;
  view: number;
}

function toSummary(row: SummaryRow): ListSummary {
  return {
    description: row.description,
    id: row.id,
    itemCount: Number(row.itemCount),
    name: row.name,
    shares: { edit: Boolean(row.edit), view: Boolean(row.view) },
    updatedAt: row.updatedAt.getTime(),
  };
}

function owned(ownerId: string, listId: string): SQL | undefined {
  return and(eq(list.id, listId), eq(list.ownerId, ownerId));
}

function summaryQuery(db: Db, ownerId: string, listId: string) {
  return db
    .select(summaryColumns)
    .from(list)
    .where(owned(ownerId, listId))
    .limit(1);
}

function notFound(): ListsError {
  return new ListsError("NOT_FOUND", "List not found");
}

/** Throws `NOT_FOUND` unless `ownerId` owns the list. */
export async function assertOwner(
  db: Db,
  ownerId: string,
  listId: string
): Promise<void> {
  const [row] = await db
    .select({ id: list.id })
    .from(list)
    .where(owned(ownerId, listId))
    .limit(1);
  if (!row) {
    throw notFound();
  }
}

/**
 * The list's item rows in order (bounded), for hydration. `listId` may be
 * a subquery (the shared view resolves the token in the same batch).
 */
export function itemRowsQuery(db: Db, listId: string | SQLWrapper) {
  return db
    .select({ gestureId: listItem.gestureId, position: listItem.position })
    .from(listItem)
    .where(
      typeof listId === "string"
        ? eq(listItem.listId, listId)
        : inArray(listItem.listId, listId)
    )
    .orderBy(listItem.position, listItem.gestureId)
    .limit(LIST_ITEMS_MAX);
}

/** Published summaries with their positions, in list order. */
export async function hydrateItems(
  deps: ListsDeps,
  rows: readonly { gestureId: string; position: number }[]
): Promise<ListItem[]> {
  const positions = new Map(rows.map((row) => [row.gestureId, row.position]));
  const summaries = await deps.findSummaries(
    deps.db,
    rows.map((row) => row.gestureId)
  );
  return summaries.map((summary) => ({
    ...summary,
    position: positions.get(summary.id) ?? 0,
  }));
}

/** The owner's lists, most recently changed first (`list_owner_updated_idx`). */
export async function listMine(
  db: Db,
  ownerId: string
): Promise<ListSummary[]> {
  try {
    const rows = await db
      .select(summaryColumns)
      .from(list)
      .where(eq(list.ownerId, ownerId))
      .orderBy(desc(list.updatedAt), desc(list.id))
      .limit(LISTS_MAX);
    return rows.map(toSummary);
  } catch (error) {
    console.error("[lists] Failed to list the owner's lists:", error);
    throw error;
  }
}

export async function getList(
  deps: ListsDeps,
  ownerId: string,
  listId: string
): Promise<ListDetail> {
  const [summaries, rows] = await deps.db.batch([
    summaryQuery(deps.db, ownerId, listId),
    itemRowsQuery(deps.db, listId),
  ]);
  const [summary] = summaries;
  if (!summary) {
    throw notFound();
  }
  return { ...toSummary(summary), items: await hydrateItems(deps, rows) };
}

export async function createList(
  db: Db,
  ownerId: string,
  input: { description?: string | null | undefined; name: string }
): Promise<ListSummary> {
  const now = Date.now();
  // The limit is part of the insert (no check-then-act): the row is only
  // selected while the owner has fewer than `LISTS_MAX` lists. The columns
  // follow the table's order (id, owner_id, name, description, created_at,
  // updated_at).
  const [row] = await db
    .insert(list)
    .select(
      sql`SELECT ${newId()}, ${ownerId}, ${input.name}, ${input.description ?? null}, ${now}, ${now} WHERE (SELECT count(*) FROM ${list} AS o WHERE ${ref("o", list.ownerId)} = ${ownerId}) < ${LISTS_MAX}`
    )
    .returning();
  if (!row) {
    throw new ListsError("INVALID_STATE", `At most ${LISTS_MAX} lists`);
  }
  return toSummary({ ...row, edit: 0, itemCount: 0, view: 0 });
}

export async function updateList(
  db: Db,
  ownerId: string,
  input: {
    description?: string | null | undefined;
    id: string;
    name?: string | undefined;
  }
): Promise<ListSummary> {
  const [, summaries] = await db.batch([
    db
      .update(list)
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        updatedAt: new Date(),
      })
      .where(owned(ownerId, input.id)),
    summaryQuery(db, ownerId, input.id),
  ]);
  const [summary] = summaries;
  if (!summary) {
    throw notFound();
  }
  return toSummary(summary);
}

/** Deletes the list; its items and share links go with it (`ON DELETE CASCADE`). */
export async function deleteList(
  db: Db,
  ownerId: string,
  listId: string
): Promise<void> {
  const deleted = await db
    .delete(list)
    .where(owned(ownerId, listId))
    .returning({ id: list.id });
  if (deleted.length === 0) {
    throw notFound();
  }
}

interface ItemTarget {
  /** Who adds (`list_item.added_by`): the owner or an editor. */
  actorId: string;
  gestureId: string;
  listId: string;
}

function isPresent(listId: string, gestureId: string): SQL<number> {
  return sql<number>`EXISTS (SELECT 1 FROM ${listItem} AS li WHERE ${ref("li", listItem.listId)} = ${listId} AND ${ref("li", listItem.gestureId)} = ${gestureId})`;
}

/**
 * Appends a published gesture (`NOT_FOUND` otherwise) at `max + 1`. With
 * `ownerId` the list must be theirs (the owner path); without it the
 * caller has authorised the list (an edit link). One read, then one batch.
 * The insert computes the position itself, so concurrent adds stay dense;
 * `ON CONFLICT DO NOTHING` makes a repeated add a no-op; and `HAVING
 * count(*) < LIST_ITEMS_MAX` makes the limit part of the write, so
 * concurrent adds to a nearly full list cannot pass it.
 */
export async function addItemToList(
  db: Db,
  target: ItemTarget & { ownerId?: string }
): Promise<{ added: boolean }> {
  const { actorId, gestureId, listId, ownerId } = target;
  const [state] = await db
    .select({
      present: isPresent(listId, gestureId),
      published: sql<number>`EXISTS (SELECT 1 FROM ${gesture} AS g WHERE ${ref("g", gesture.id)} = ${gestureId} AND ${ref("g", gesture.publishedAt)} IS NOT NULL)`,
    })
    .from(list)
    .where(ownerId === undefined ? eq(list.id, listId) : owned(ownerId, listId))
    .limit(1);
  if (!state) {
    throw notFound();
  }
  if (!state.published) {
    throw new ListsError("NOT_FOUND", "Gesture not found");
  }
  if (state.present) {
    return { added: false };
  }
  const now = new Date();
  const [inserted] = await db.batch([
    db
      .insert(listItem)
      .select(
        sql`SELECT ${listId}, ${gestureId}, coalesce(max(${ref("li", listItem.position)}) + 1, 0), ${actorId}, ${now.getTime()} FROM ${listItem} AS li WHERE ${ref("li", listItem.listId)} = ${listId} HAVING count(*) < ${LIST_ITEMS_MAX}`
      )
      .onConflictDoNothing()
      .returning({ gestureId: listItem.gestureId }),
    db
      .update(list)
      .set({ updatedAt: now })
      .where(
        and(
          eq(list.id, listId),
          sql`EXISTS (SELECT 1 FROM ${listItem} AS li WHERE ${ref("li", listItem.listId)} = ${listId} AND ${ref("li", listItem.gestureId)} = ${gestureId} AND ${ref("li", listItem.createdAt)} = ${now.getTime()})`
        )
      ),
  ]);
  if (inserted.length > 0) {
    return { added: true };
  }
  // Not inserted: a concurrent add of the same gesture won, or the list is full.
  const [after] = await db
    .select({ present: isPresent(listId, gestureId) })
    .from(list)
    .where(eq(list.id, listId))
    .limit(1);
  if (after?.present) {
    return { added: false };
  }
  throw new ListsError("INVALID_STATE", `At most ${LIST_ITEMS_MAX} items`);
}

/**
 * Removes the gesture and shifts the rows after it down by one, in one
 * batch (the shift reads the removed row's position before the delete).
 */
export async function removeItemFromList(
  db: Db,
  target: Omit<ItemTarget, "actorId">
): Promise<{ removed: boolean }> {
  const { gestureId, listId } = target;
  const removedPosition = sql`(SELECT ${ref("r", listItem.position)} FROM ${listItem} AS r WHERE ${ref("r", listItem.listId)} = ${listId} AND ${ref("r", listItem.gestureId)} = ${gestureId})`;
  const [, , deleted] = await db.batch([
    db
      .update(list)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(list.id, listId),
          sql`EXISTS (SELECT 1 FROM ${listItem} AS li WHERE ${ref("li", listItem.listId)} = ${listId} AND ${ref("li", listItem.gestureId)} = ${gestureId})`
        )
      ),
    db
      .update(listItem)
      .set({ position: sql`${listItem.position} - 1` })
      .where(
        and(
          eq(listItem.listId, listId),
          sql`${listItem.position} > ${removedPosition}`
        )
      ),
    db
      .delete(listItem)
      .where(
        and(eq(listItem.listId, listId), eq(listItem.gestureId, gestureId))
      )
      .returning({ gestureId: listItem.gestureId }),
  ]);
  return { removed: deleted.length > 0 };
}

export async function addItem(
  db: Db,
  ownerId: string,
  input: { gestureId: string; id: string }
): Promise<{ added: boolean }> {
  return await addItemToList(db, {
    actorId: ownerId,
    gestureId: input.gestureId,
    listId: input.id,
    ownerId,
  });
}

export async function removeItem(
  db: Db,
  ownerId: string,
  input: { gestureId: string; id: string }
): Promise<{ removed: boolean }> {
  await assertOwner(db, ownerId, input.id);
  return await removeItemFromList(db, {
    gestureId: input.gestureId,
    listId: input.id,
  });
}

/**
 * Sets the order. `gestureIds` must be exactly the list's published
 * gestures (what the owner sees), else `INVALID_STATE`; unpublished ones
 * keep their relative order after them. Only the payload's rows (and the
 * hidden ones) are rewritten, so an add that lands between the read and
 * the write keeps its `max + 1` place.
 */
export async function reorderList(
  db: Db,
  ownerId: string,
  input: { gestureIds: readonly string[]; id: string }
): Promise<void> {
  const [owner, rows] = await db.batch([
    db.select({ id: list.id }).from(list).where(owned(ownerId, input.id)),
    db
      .select({
        gestureId: listItem.gestureId,
        published: sql<number>`${gesture.publishedAt} IS NOT NULL`,
      })
      .from(listItem)
      .innerJoin(gesture, eq(gesture.id, listItem.gestureId))
      .where(eq(listItem.listId, input.id))
      .orderBy(listItem.position, listItem.gestureId),
  ]);
  if (owner.length === 0) {
    throw notFound();
  }
  const visible = rows
    .filter((row) => row.published)
    .map((row) => row.gestureId);
  if (!isExactSet(visible, input.gestureIds)) {
    throw new ListsError(
      "INVALID_STATE",
      "Reorder payload must include every list item exactly once"
    );
  }
  const hidden = rows
    .filter((row) => !row.published)
    .map((row) => row.gestureId);
  const order = JSON.stringify([...input.gestureIds, ...hidden]);
  await db.batch([
    db
      .update(listItem)
      .set({
        position: sql`(SELECT j.key FROM json_each(${order}) AS j WHERE j.value = ${ref("list_item", listItem.gestureId)})`,
      })
      .where(
        and(
          eq(listItem.listId, input.id),
          sql`${listItem.gestureId} IN (SELECT value FROM json_each(${order}))`
        )
      ),
    db.update(list).set({ updatedAt: new Date() }).where(eq(list.id, input.id)),
  ]);
}
