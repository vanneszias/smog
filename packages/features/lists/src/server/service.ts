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

/** A list `insertListsStmt` inserts (`id` chosen by the caller). */
export interface NewListRow {
  description: string | null;
  id: string;
  name: string;
}

/**
 * Inserts `lists` in order, as many as fit under `LISTS_MAX`: the limit is
 * part of the insert (`LIMIT max(0, LISTS_MAX - count)`, no check-then-act),
 * so concurrent inserts at the edge cannot pass it. Timestamps end at `at`,
 * one millisecond apart, so the given order is the creation order. Returns
 * the inserted rows; a statement, not run, so a caller (the guest import)
 * can put it in its own batch.
 */
export function insertListsStmt(
  db: Db,
  ownerId: string,
  lists: readonly NewListRow[],
  at: Date
) {
  const last = at.getTime();
  const count = lists.length;
  // The columns follow the table's order (id, owner_id, name, description,
  // created_at, updated_at).
  return db
    .insert(list)
    .select(
      sql`SELECT json_extract(j.value, '$.id'), ${ownerId}, json_extract(j.value, '$.name'), json_extract(j.value, '$.description'), ${last} - (${count} - 1 - j.key), ${last} - (${count} - 1 - j.key) FROM json_each(${JSON.stringify(lists)}) AS j WHERE true ORDER BY j.key LIMIT max(0, ${LISTS_MAX} - (SELECT count(*) FROM ${list} AS o WHERE ${ref("o", list.ownerId)} = ${ownerId}))`
    )
    .returning();
}

export async function createList(
  db: Db,
  ownerId: string,
  input: { description?: string | null | undefined; name: string }
): Promise<ListSummary> {
  const [row] = await insertListsStmt(
    db,
    ownerId,
    [{ description: input.description ?? null, id: newId(), name: input.name }],
    new Date()
  );
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

/** Who appends: `actorId` is recorded; with `ownerId` the lists must be theirs. */
export interface AppendActor {
  actorId: string;
  ownerId?: string | undefined;
}

/** `[listId, gestureId]`, in append order, each pair at most once. */
export type ItemPair = readonly [listId: string, gestureId: string];

function isPresent(listId: string, gestureId: string): SQL<number> {
  return sql<number>`EXISTS (SELECT 1 FROM ${listItem} AS li WHERE ${ref("li", listItem.listId)} = ${listId} AND ${ref("li", listItem.gestureId)} = ${gestureId})`;
}

/** The pairs as rows `p.list_id`, `p.gesture_id`, `p.k` (their order). */
function pairRows(pairs: readonly ItemPair[]): SQL {
  return sql`(SELECT json_extract(value, '$[0]') AS list_id, json_extract(value, '$[1]') AS gesture_id, key AS k FROM json_each(${JSON.stringify(pairs)}))`;
}

/**
 * A pair (`p`) that may go in: the list exists (and is `ownerId`'s), the
 * gesture is published, and the list does not hold it yet.
 */
function insertable(ownerId: string | undefined): SQL {
  const owner =
    ownerId === undefined
      ? sql``
      : sql` AND ${ref("l", list.ownerId)} = ${ownerId}`;
  return sql`EXISTS (SELECT 1 FROM ${list} AS l WHERE ${ref("l", list.id)} = p.list_id${owner}) AND EXISTS (SELECT 1 FROM ${gesture} AS g WHERE ${ref("g", gesture.id)} = p.gesture_id AND ${ref("g", gesture.publishedAt)} IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM ${listItem} AS li WHERE ${ref("li", listItem.listId)} = p.list_id AND ${ref("li", listItem.gestureId)} = p.gesture_id)`;
}

/**
 * Appends the insertable `pairs` to their lists, in order. Each list's new
 * items go at `max(position) + 1, + 2, …`, computed by the insert, so
 * concurrent appends stay dense; only while the list stays within
 * `LIST_ITEMS_MAX` (the limit is part of the write); `ON CONFLICT DO
 * NOTHING` makes a repeat a no-op. Returns the inserted pairs; a
 * statement, not run.
 */
export function appendItemsStmt(
  db: Db,
  { actorId, ownerId }: AppendActor,
  pairs: readonly ItemPair[],
  at: Date
) {
  // Columns: list_id, gesture_id, position, added_by, created_at.
  return db
    .insert(listItem)
    .select(
      sql`SELECT c.list_id, c.gesture_id, c.base + c.rn, ${actorId}, ${at.getTime()} FROM (SELECT p.list_id, p.gesture_id, (SELECT coalesce(max(${ref("li", listItem.position)}), -1) FROM ${listItem} AS li WHERE ${ref("li", listItem.listId)} = p.list_id) AS base, (SELECT count(*) FROM ${listItem} AS li WHERE ${ref("li", listItem.listId)} = p.list_id) AS size, row_number() OVER (PARTITION BY p.list_id ORDER BY p.k) AS rn FROM ${pairRows(pairs)} AS p WHERE ${insertable(ownerId)}) AS c WHERE c.size + c.rn <= ${LIST_ITEMS_MAX}`
    )
    .onConflictDoNothing()
    .returning({ gestureId: listItem.gestureId, listId: listItem.listId });
}

/**
 * Bumps `updated_at` of those `listIds` that received an item from
 * `actorId` at `at` (an `appendItemsStmt` earlier in the same batch).
 */
export function touchListsWithNewItemsStmt(
  db: Db,
  listIds: readonly string[],
  actorId: string,
  at: Date
) {
  return db
    .update(list)
    .set({ updatedAt: at })
    .where(
      and(
        sql`${list.id} IN (SELECT value FROM json_each(${JSON.stringify(listIds)}))`,
        sql`EXISTS (SELECT 1 FROM ${listItem} AS li WHERE ${ref("li", listItem.listId)} = ${ref(L, list.id)} AND ${ref("li", listItem.addedBy)} = ${actorId} AND ${ref("li", listItem.createdAt)} = ${at.getTime()})`
      )
    );
}

/**
 * The pairs that could still go in: after an `appendItemsStmt` in the same
 * batch, the ones its limit left out. A statement, not run.
 */
export function unplacedItemsStmt(
  db: Db,
  { ownerId }: Pick<AppendActor, "ownerId">,
  pairs: readonly ItemPair[]
) {
  return db
    .select({
      gestureId: sql<string>`p.gesture_id`,
      listId: sql<string>`p.list_id`,
    })
    .from(sql`${pairRows(pairs)} AS p`)
    .where(insertable(ownerId));
}

/**
 * Appends a published gesture (`NOT_FOUND` otherwise) at `max + 1`. With
 * `ownerId` the list must be theirs (the owner path); without it the
 * caller has authorised the list (an edit link). One read, then one batch:
 * `appendItemsStmt` for the one pair (dense position, a repeat is a no-op,
 * `LIST_ITEMS_MAX` part of the write) and the `updated_at` bump.
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
    appendItemsStmt(db, { actorId, ownerId }, [[listId, gestureId]], now),
    touchListsWithNewItemsStmt(db, [listId], actorId, now),
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
