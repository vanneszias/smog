/**
 * The guest → account import (spec §11): one read batch, then one write
 * batch (a D1 transaction, so it is all or nothing). Every write guards
 * itself, as the lists service does, so a retry or a concurrent write
 * cannot duplicate rows or pass a limit:
 * - favorites: `INSERT … SELECT` of the published ids, `ON CONFLICT DO
 *   NOTHING` (a union);
 * - lists: one `INSERT … SELECT … LIMIT max(0, LISTS_MAX - count)`;
 * - items: one `INSERT … SELECT` over every target list, appended at
 *   `max(position) + row_number()`, missing ones only, and only while
 *   `size + row_number() <= LIST_ITEMS_MAX`;
 * - consent: appended unless the account already has a decision at least
 *   as recent (or this very import is its newest).
 * The statements are hand-written SQL over `json_each` (one bound JSON
 * parameter each, so D1's 100-parameter limit never applies). Table names
 * come from the `@smog/db` schema; the column names are written out, and
 * the tests run every statement against the real migrations.
 */
import { CONSENT_POLICY_VERSION } from "@smog/config/constants";
import { consentEvent, favorite, gesture, list, listItem } from "@smog/db";
import type { Db } from "@smog/db/client";
import { LIST_ITEMS_MAX, LISTS_MAX } from "@smog/lists/schema";
import { newId } from "@smog/utils";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { ImportGuestData, ImportResult } from "../schema";

/** How list names match: trimmed, case-insensitive (Unicode-aware). */
function listNameKey(name: string): string {
  return name.normalize("NFC").trim().toLocaleLowerCase("und");
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

/** `SELECT value FROM json_each(?)`: a JSON array bound as one parameter. */
function jsonValues(values: readonly unknown[]) {
  return sql`(SELECT value FROM json_each(${JSON.stringify(values)}))`;
}

interface NewList {
  description: string | null;
  id: string;
  name: string;
}

interface Plan {
  favorites: string[];
  /** `[listId, gestureId]`, in append order, each pair once. */
  items: [string, string][];
  listsMerged: number;
  /** Existing lists that receive items (their `updated_at` is bumped). */
  merged: string[];
  newLists: NewList[];
  skippedUnknownGestures: number;
}

/** Decides what goes where, from the published ids and the owner's lists. */
function plan(
  input: ImportGuestData,
  requested: readonly string[],
  published: ReadonlySet<string>,
  existing: readonly { id: string; name: string }[]
): Plan {
  // The most recently changed list wins when the account has two same-name lists.
  const targets = new Map<string, string>();
  for (const row of existing) {
    const key = listNameKey(row.name);
    if (!targets.has(key)) {
      targets.set(key, row.id);
    }
  }
  const existingIds = new Set(existing.map((row) => row.id));
  const newLists: NewList[] = [];
  const merged = new Set<string>();
  const seen = new Map<string, Set<string>>();
  const items: [string, string][] = [];
  let listsMerged = 0;

  for (const guest of input.lists) {
    const key = listNameKey(guest.name);
    let target = targets.get(key);
    if (target === undefined) {
      target = newId();
      targets.set(key, target);
      newLists.push({
        description: guest.description ?? null,
        id: target,
        name: guest.name,
      });
    } else {
      listsMerged += 1;
      if (existingIds.has(target)) {
        merged.add(target);
      }
    }
    const inTarget = seen.get(target) ?? new Set<string>();
    seen.set(target, inTarget);
    for (const gestureId of guest.gestureIds) {
      if (published.has(gestureId) && !inTarget.has(gestureId)) {
        inTarget.add(gestureId);
        items.push([target, gestureId]);
      }
    }
  }

  return {
    favorites: unique(input.favorites).filter((id) => published.has(id)),
    items,
    listsMerged,
    merged: [...merged],
    newLists,
    skippedUnknownGestures: requested.filter((id) => !published.has(id)).length,
  };
}

/** The payload pairs as rows: `p.list_id`, `p.gesture_id`, `p.k` (order). */
function payloadPairs(items: readonly [string, string][]) {
  return sql`(SELECT json_extract(value, '$[0]') AS list_id, json_extract(value, '$[1]') AS gesture_id, key AS k FROM json_each(${JSON.stringify(items)}))`;
}

/** The pair's list belongs to the user, the gesture is published, and it is not in the list yet. */
function insertablePair(userId: string) {
  return sql`EXISTS (SELECT 1 FROM ${list} AS l WHERE l.id = p.list_id AND l.owner_id = ${userId})
    AND EXISTS (SELECT 1 FROM ${gesture} AS g WHERE g.id = p.gesture_id AND g.published_at IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM ${listItem} AS li WHERE li.list_id = p.list_id AND li.gesture_id = p.gesture_id)`;
}

/**
 * Imports a guest's device data into `userId`'s account: favorites become
 * a union, lists are created or merged into a same-name list (missing
 * items appended in order), unknown and unpublished gestures are skipped
 * (and counted), and the consent choice is appended with source `import`.
 * Idempotent: a second identical call adds nothing. Past `LISTS_MAX` lists
 * or `LIST_ITEMS_MAX` items per list the rest is left out and counted
 * (`listsOverLimit`, `itemsOverLimit`).
 */
export async function importGuestData(
  db: Db,
  userId: string,
  input: ImportGuestData,
  now: Date = new Date()
): Promise<ImportResult> {
  const at = now.getTime();
  const requested = unique([
    ...input.favorites,
    ...input.lists.flatMap((guest) => guest.gestureIds),
  ]);
  try {
    const [publishedRows, existing] = await db.batch([
      db
        .select({ id: gesture.id })
        .from(gesture)
        .where(
          and(
            isNotNull(gesture.publishedAt),
            sql`${gesture.id} IN ${jsonValues(requested)}`
          )
        ),
      db
        .select({ id: list.id, name: list.name })
        .from(list)
        .where(eq(list.ownerId, userId))
        .orderBy(desc(list.updatedAt), desc(list.id))
        .limit(LISTS_MAX),
    ]);
    const steps = plan(
      input,
      requested,
      new Set(publishedRows.map((row) => row.id)),
      existing
    );
    const favoriteCount = steps.favorites.length;
    const listCount = steps.newLists.length;
    const decidedAt = input.consent
      ? Math.min(input.consent.decidedAt, at)
      : undefined;

    const [favorites, lists, items, , remaining] = await db.batch([
      // The device keeps favorites oldest first: the last one is the newest.
      db
        .insert(favorite)
        .select(
          sql`SELECT ${userId}, j.value, ${at} - (${favoriteCount} - 1 - j.key) FROM json_each(${JSON.stringify(steps.favorites)}) AS j WHERE EXISTS (SELECT 1 FROM ${gesture} AS g WHERE g.id = j.value AND g.published_at IS NOT NULL)`
        )
        .onConflictDoNothing()
        .returning({ gestureId: favorite.gestureId }),
      // Columns in table order: id, owner_id, name, description, created_at, updated_at.
      db
        .insert(list)
        .select(
          sql`SELECT json_extract(j.value, '$.id'), ${userId}, json_extract(j.value, '$.name'), json_extract(j.value, '$.description'), ${at} - (${listCount} - 1 - j.key), ${at} - (${listCount} - 1 - j.key) FROM json_each(${JSON.stringify(steps.newLists)}) AS j WHERE true ORDER BY j.key LIMIT max(0, ${LISTS_MAX} - (SELECT count(*) FROM ${list} AS o WHERE o.owner_id = ${userId}))`
        )
        .returning({ id: list.id }),
      // Columns: list_id, gesture_id, position, added_by, created_at.
      db
        .insert(listItem)
        .select(
          sql`SELECT c.list_id, c.gesture_id, c.base + c.rn, ${userId}, ${at} FROM (SELECT p.list_id, p.gesture_id, (SELECT coalesce(max(li.position), -1) FROM ${listItem} AS li WHERE li.list_id = p.list_id) AS base, (SELECT count(*) FROM ${listItem} AS li WHERE li.list_id = p.list_id) AS size, row_number() OVER (PARTITION BY p.list_id ORDER BY p.k) AS rn FROM ${payloadPairs(steps.items)} AS p WHERE ${insertablePair(userId)}) AS c WHERE c.size + c.rn <= ${LIST_ITEMS_MAX}`
        )
        .onConflictDoNothing()
        .returning({ listId: listItem.listId }),
      // A merged list counts as changed only when it received items.
      db
        .update(list)
        .set({ updatedAt: now })
        .where(
          and(
            eq(list.ownerId, userId),
            sql`${list.id} IN ${jsonValues(steps.merged)}`,
            sql`EXISTS (SELECT 1 FROM ${listItem} AS li WHERE li.list_id = "list"."id" AND li.added_by = ${userId} AND li.created_at = ${at})`
          )
        ),
      // What still fits nowhere: pairs of existing lists that did not go in.
      db
        .select({ count: sql<number>`count(*)` })
        .from(sql`${payloadPairs(steps.items)} AS p`)
        .where(sql`${insertablePair(userId)}`),
      ...(input.consent && decidedAt !== undefined
        ? [
            // Columns: id, user_id, purpose, granted, policy_version, source, created_at.
            db
              .insert(consentEvent)
              .select(
                sql`SELECT ${newId()}, ${userId}, 'analytics', ${input.consent.analytics ? 1 : 0}, ${CONSENT_POLICY_VERSION}, 'import', ${decidedAt} WHERE NOT EXISTS (SELECT 1 FROM ${consentEvent} AS c WHERE c.user_id = ${userId} AND c.purpose = 'analytics' AND (c.created_at >= ${decidedAt} OR (c.source = 'import' AND c.granted = ${input.consent.analytics ? 1 : 0} AND c.policy_version = ${CONSENT_POLICY_VERSION} AND c.created_at = (SELECT max(n.created_at) FROM ${consentEvent} AS n WHERE n.user_id = ${userId} AND n.purpose = 'analytics'))))`
              ),
          ]
        : []),
    ]);

    return {
      favoritesAdded: favorites.length,
      itemsAdded: items.length,
      itemsOverLimit: Number(remaining[0]?.count ?? 0),
      listsCreated: lists.length,
      listsMerged: steps.listsMerged,
      listsOverLimit: listCount - lists.length,
      skippedUnknownGestures: steps.skippedUnknownGestures,
    };
  } catch (error) {
    console.error("[account] Failed to import guest data:", error);
    throw error;
  }
}
