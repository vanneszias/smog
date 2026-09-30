/**
 * The guest → account import (spec §11): one read batch, then one write
 * batch (a D1 transaction, so it is all or nothing). The write batch
 * starts with the `guest_import` guard row planned from the read, so an
 * import that another one overtook between its read and its write aborts
 * on the primary key and runs again from the read (it then merges into
 * the lists the other one created, instead of creating them twice). The favorite, list
 * and list-item writes are the favorites and lists packages' own statement
 * builders, which `@smog/api` injects (a feature never imports another's
 * server), so their rules (the published-gesture guard, `LISTS_MAX` and
 * `LIST_ITEMS_MAX` inside the write, dense positions, when `updated_at`
 * moves) are written once. This file owns the reads, the name matching and
 * planning, and the consent statement.
 */
import { CONSENT_POLICY_VERSION } from "@smog/config/constants";
import { consentEvent, gesture, guestImport, list } from "@smog/db";
import type { Db } from "@smog/db/client";
import { LISTS_MAX } from "@smog/lists/schema";
import { newId } from "@smog/utils";
import { and, desc, eq, isNotNull, lt, sql } from "drizzle-orm";
import type { RunnableQuery } from "drizzle-orm/runnable-query";
import type {
  ImportGuestData,
  ImportListOutcome,
  ImportResult,
} from "../schema";

/** A statement for `db.batch`, typed by its result rows. */
type Statement<T> = RunnableQuery<T, "sqlite">;

type Pair = readonly [listId: string, gestureId: string];
interface PairRow {
  gestureId: string;
  listId: string;
}

/**
 * The favorites and lists statement builders (`@smog/favorites/server`
 * `insertFavoritesStmt`, `@smog/lists/server` `insertListsStmt`,
 * `appendItemsStmt`, `touchListsWithNewItemsStmt`, `unplacedItemsStmt`),
 * wired by `@smog/api`.
 */
export interface ImportDeps {
  appendItems: (
    db: Db,
    actor: { actorId: string; ownerId?: string | undefined },
    pairs: readonly Pair[],
    at: Date
  ) => Statement<PairRow[]>;
  insertFavorites: (
    db: Db,
    userId: string,
    gestureIds: readonly string[],
    at: Date
  ) => Statement<{ gestureId: string }[]>;
  insertLists: (
    db: Db,
    ownerId: string,
    lists: readonly { description: string | null; id: string; name: string }[],
    at: Date
  ) => Statement<{ id: string }[]>;
  touchLists: (
    db: Db,
    listIds: readonly string[],
    actorId: string,
    at: Date
  ) => Statement<unknown>;
  unplacedItems: (
    db: Db,
    owner: { ownerId?: string | undefined },
    pairs: readonly Pair[]
  ) => Statement<PairRow[]>;
}

/** Tries of one import when concurrent imports keep overtaking it. */
const IMPORT_ATTEMPTS = 3;

/** Whether `error` (or its cause) is the `guest_import` guard's conflict. */
function isGuardConflict(error: unknown): boolean {
  for (let current = error; current instanceof Error; ) {
    if (
      current.message.includes("UNIQUE constraint failed: guest_import") ||
      current.message.includes("SQLITE_CONSTRAINT_PRIMARYKEY")
    ) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

/** How list names match: trimmed, case-insensitive (Unicode-aware). */
function listNameKey(name: string): string {
  return name.normalize("NFC").trim().toLocaleLowerCase("und");
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

interface NewList {
  description: string | null;
  id: string;
  name: string;
}

interface Plan {
  favorites: string[];
  /**
   * Per guest list: its target list, how it gets there (`existing`: a list
   * of the account; `new`: created by this import; `again`: a same-name
   * guest list earlier in this import), and the pairs it contributes.
   */
  guests: {
    into: "again" | "existing" | "new";
    pairs: Pair[];
    target: string;
  }[];
  /** `[listId, gestureId]`, in append order, each pair once. */
  items: Pair[];
  /** Existing lists that may receive items (their `updated_at` moves then). */
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
  const items: Pair[] = [];
  const guests: Plan["guests"] = [];

  for (const guest of input.lists) {
    const key = listNameKey(guest.name);
    let target = targets.get(key);
    let into: "again" | "existing" | "new" = "again";
    if (target === undefined) {
      into = "new";
      target = newId();
      targets.set(key, target);
      newLists.push({
        description: guest.description ?? null,
        id: target,
        name: guest.name,
      });
    } else if (existingIds.has(target)) {
      into = "existing";
      merged.add(target);
    }
    const inTarget = seen.get(target) ?? new Set<string>();
    seen.set(target, inTarget);
    const pairs: Pair[] = [];
    for (const gestureId of guest.gestureIds) {
      if (published.has(gestureId) && !inTarget.has(gestureId)) {
        inTarget.add(gestureId);
        pairs.push([target, gestureId]);
      }
    }
    items.push(...pairs);
    guests.push({ into, pairs, target });
  }

  return {
    favorites: unique(input.favorites).filter((id) => published.has(id)),
    guests,
    items,
    merged: [...merged],
    newLists,
    skippedUnknownGestures: requested.filter((id) => !published.has(id)).length,
  };
}

/**
 * The consent row, unless the account already has an analytics decision at
 * least as recent as `decidedAt`, or its newest one is this very import
 * (same value and policy: a retry with a device clock ahead).
 */
function consentStmt(
  db: Db,
  userId: string,
  granted: boolean,
  decidedAt: number
) {
  const value = granted ? 1 : 0;
  // Columns: id, user_id, purpose, granted, policy_version, source, created_at.
  return db
    .insert(consentEvent)
    .select(
      sql`SELECT ${newId()}, ${userId}, 'analytics', ${value}, ${CONSENT_POLICY_VERSION}, 'import', ${decidedAt} WHERE NOT EXISTS (SELECT 1 FROM ${consentEvent} AS c WHERE c.user_id = ${userId} AND c.purpose = 'analytics' AND (c.created_at >= ${decidedAt} OR (c.source = 'import' AND c.granted = ${value} AND c.policy_version = ${CONSENT_POLICY_VERSION} AND c.created_at = (SELECT max(n.created_at) FROM ${consentEvent} AS n WHERE n.user_id = ${userId} AND n.purpose = 'analytics'))))`
    );
}

/**
 * Imports a guest's device data into `userId`'s account: favorites become
 * a union, lists are created or merged into a same-name list (missing
 * items appended in order), unknown and unpublished gestures are skipped
 * (and counted), and the consent choice is appended with source `import`.
 * Idempotent: a second identical call adds nothing. `lists` says per guest
 * list what was stored, so the client keeps what was not (lists past
 * `LISTS_MAX`, items past `LIST_ITEMS_MAX`).
 */
export async function importGuestData(
  deps: ImportDeps & { db: Db },
  userId: string,
  input: ImportGuestData,
  now: Date = new Date()
): Promise<ImportResult> {
  const requested = unique([
    ...input.favorites,
    ...input.lists.flatMap((guest) => guest.gestureIds),
  ]);
  try {
    for (let attempt = 1; ; attempt += 1) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: a retry runs after the failed try, by design.
        return await importOnce(deps, userId, input, requested, now);
      } catch (error) {
        if (!isGuardConflict(error) || attempt >= IMPORT_ATTEMPTS) {
          throw error;
        }
      }
    }
  } catch (error) {
    console.error("[account] Failed to import guest data:", error);
    throw error;
  }
}

/** One read, plan and write; the write aborts when another import overtook it. */
async function importOnce(
  deps: ImportDeps & { db: Db },
  userId: string,
  input: ImportGuestData,
  requested: readonly string[],
  now: Date
): Promise<ImportResult> {
  const { db } = deps;
  const owner = { actorId: userId, ownerId: userId };
  const [publishedRows, existing, guard] = await db.batch([
    db
      .select({ id: gesture.id })
      .from(gesture)
      .where(
        and(
          isNotNull(gesture.publishedAt),
          sql`${gesture.id} IN (SELECT value FROM json_each(${JSON.stringify(requested)}))`
        )
      ),
    db
      .select({ id: list.id, name: list.name })
      .from(list)
      .where(eq(list.ownerId, userId))
      .orderBy(desc(list.updatedAt), desc(list.id))
      .limit(LISTS_MAX),
    db
      .select({ seq: sql<number>`coalesce(max(${guestImport.seq}), 0)` })
      .from(guestImport)
      .where(eq(guestImport.userId, userId)),
  ]);
  const seq = Number(guard[0]?.seq ?? 0) + 1;
  const steps = plan(
    input,
    requested,
    new Set(publishedRows.map((row) => row.id)),
    existing
  );
  const decidedAt = input.consent
    ? Math.min(input.consent.decidedAt, now.getTime())
    : undefined;

  const [, , favorites, created, appended, , unplaced] = await db.batch([
    // No ON CONFLICT: an import that wrote since our read took `seq`, and
    // this batch aborts before anything else is written.
    db.insert(guestImport).values({ seq, userId }),
    db
      .delete(guestImport)
      .where(and(eq(guestImport.userId, userId), lt(guestImport.seq, seq))),
    deps.insertFavorites(db, userId, steps.favorites, now),
    deps.insertLists(db, userId, steps.newLists, now),
    deps.appendItems(db, owner, steps.items, now),
    // A merged list counts as changed only when it received items.
    deps.touchLists(db, steps.merged, userId, now),
    deps.unplacedItems(db, owner, steps.items),
    ...(input.consent && decidedAt !== undefined
      ? [consentStmt(db, userId, input.consent.analytics, decidedAt)]
      : []),
  ]);

  const createdIds = new Set(created.map((row) => row.id));
  const left = new Set(
    unplaced.map((row) => `${row.listId}\u0000${row.gestureId}`)
  );
  const lists = steps.guests.map(
    ({ into, pairs, target }): ImportListOutcome => {
      if (into !== "existing" && !createdIds.has(target)) {
        return { status: "notCreated", unplaced: [] };
      }
      return {
        status: into === "new" ? "created" : "merged",
        unplaced: pairs
          .filter(([listId, gestureId]) =>
            left.has(`${listId}\u0000${gestureId}`)
          )
          .map(([, gestureId]) => gestureId),
      };
    }
  );

  return {
    favoritesAdded: favorites.length,
    itemsAdded: appended.length,
    itemsOverLimit: unplaced.length,
    lists,
    listsCreated: created.length,
    listsMerged: lists.filter((outcome) => outcome.status === "merged").length,
    listsOverLimit: lists.filter((outcome) => outcome.status === "notCreated")
      .length,
    skippedUnknownGestures: steps.skippedUnknownGestures,
  };
}
