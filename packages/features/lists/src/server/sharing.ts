/**
 * Share links (spec §5.2): at most one active link per (list, role),
 * enforced by the partial unique index `list_share_active_role_uq`.
 * Tokens are 32 random bytes (`newToken()`), stored in plain text so the
 * owner can copy the link again; revoking sets `revoked_at` and the link
 * 404s at once. A private list (no active link) is reachable by nobody
 * but its owner.
 */
import { list, listShare, user } from "@smog/db";
import type { Db } from "@smog/db/client";
import { type Locale, resources } from "@smog/i18n";
import { newId, newToken } from "@smog/utils";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { SharedList, ShareLink, ShareLinks, ShareRole } from "../schema";
import {
  addItemToList,
  assertOwner,
  hydrateItems,
  itemRowsQuery,
  type ListsDeps,
  ListsError,
  removeItemFromList,
} from "./service";

const TRAILING_SLASHES = /\/+$/;

/** `SITE_URL/lists/<token>`: the site's shared-list route. */
function shareUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(TRAILING_SLASHES, "")}/lists/${token}`;
}

function toLink(
  siteUrl: string,
  row: { createdAt: Date; token: string }
): ShareLink {
  return {
    createdAt: row.createdAt.getTime(),
    token: row.token,
    url: shareUrl(siteUrl, row.token),
  };
}

function activeShares(db: Db, listId: string) {
  return db
    .select({
      createdAt: listShare.createdAt,
      role: listShare.role,
      token: listShare.token,
    })
    .from(listShare)
    .where(and(eq(listShare.listId, listId), isNull(listShare.revokedAt)));
}

interface ShareInput {
  id: string;
  siteUrl: string;
}

/** The owner's active links (`NOT_FOUND` for someone else's list). */
export async function getShareLinks(
  db: Db,
  ownerId: string,
  input: ShareInput
): Promise<ShareLinks> {
  const [owner, rows] = await db.batch([
    db
      .select({ id: list.id })
      .from(list)
      .where(and(eq(list.id, input.id), eq(list.ownerId, ownerId))),
    activeShares(db, input.id),
  ]);
  if (owner.length === 0) {
    throw new ListsError("NOT_FOUND", "List not found");
  }
  const link = (role: ShareRole): ShareLink | null => {
    const row = rows.find((item) => item.role === role);
    return row ? toLink(input.siteUrl, row) : null;
  };
  return { edit: link("edit"), view: link("view") };
}

/**
 * The active link for the role, created when there is none. The insert
 * yields to an existing active link (`ON CONFLICT DO NOTHING` on the
 * partial unique index), so concurrent creates agree on one token.
 */
export async function createShareLink(
  db: Db,
  ownerId: string,
  input: ShareInput & { role: ShareRole }
): Promise<ShareLink> {
  await assertOwner(db, ownerId, input.id);
  const [, rows] = await db.batch([
    db
      .insert(listShare)
      .values({
        createdAt: new Date(),
        createdBy: ownerId,
        id: newId(),
        listId: input.id,
        role: input.role,
        token: newToken(),
      })
      .onConflictDoNothing(),
    activeShares(db, input.id),
  ]);
  const row = rows.find((item) => item.role === input.role);
  if (!row) {
    throw new Error("[lists] Failed to create a share link");
  }
  return toLink(input.siteUrl, row);
}

/** Revokes the role's active link (a no-op when there is none). */
export async function revokeShareLink(
  db: Db,
  ownerId: string,
  input: { id: string; role: ShareRole }
): Promise<void> {
  await assertOwner(db, ownerId, input.id);
  await db
    .update(listShare)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(listShare.listId, input.id),
        eq(listShare.role, input.role),
        isNull(listShare.revokedAt)
      )
    );
}

/** The list behind an active token, or `NOT_FOUND`. */
async function resolveToken(
  db: Db,
  token: string
): Promise<{ listId: string; role: ShareRole }> {
  const [row] = await db
    .select({ listId: listShare.listId, role: listShare.role })
    .from(listShare)
    .where(and(eq(listShare.token, token), isNull(listShare.revokedAt)))
    .limit(1);
  if (!row) {
    throw new ListsError("NOT_FOUND", "Share link not found");
  }
  return row;
}

function ownerFallback(locale: Locale): string {
  return resources[locale].translation.lists.ownerFallback;
}

/**
 * The public view of a shared list: name, description, the owner's name
 * (never the email) and the published gestures in order.
 */
export async function getSharedList(
  deps: ListsDeps,
  input: { locale: Locale; token: string }
): Promise<SharedList> {
  const { db } = deps;
  const [heads, rows] = await db.batch([
    db
      // Aliased: D1 batches return rows keyed by column name, so the two
      // `name` columns would collide.
      .select({
        description: list.description,
        name: sql<string>`${list.name}`.as("list_name"),
        ownerName: sql<string>`${user.name}`.as("owner_name"),
        role: listShare.role,
      })
      .from(listShare)
      .innerJoin(list, eq(list.id, listShare.listId))
      .innerJoin(user, eq(user.id, list.ownerId))
      .where(and(eq(listShare.token, input.token), isNull(listShare.revokedAt)))
      .limit(1),
    itemRowsQuery(
      db,
      // Empty when the token is unknown or revoked: no list id matches.
      db
        .select({ id: listShare.listId })
        .from(listShare)
        .where(
          and(eq(listShare.token, input.token), isNull(listShare.revokedAt))
        )
    ),
  ]);
  const [head] = heads;
  if (!head) {
    throw new ListsError("NOT_FOUND", "Share link not found");
  }
  const ownerName = head.ownerName.trim();
  return {
    items: await hydrateItems(deps, rows),
    list: {
      description: head.description,
      name: head.name,
      ownerName: ownerName === "" ? ownerFallback(input.locale) : ownerName,
    },
    role: head.role,
  };
}

async function resolveEditable(db: Db, token: string): Promise<string> {
  const share = await resolveToken(db, token);
  if (share.role !== "edit") {
    throw new ListsError("FORBIDDEN", "A view link cannot edit");
  }
  return share.listId;
}

/** Adds through an edit link; the caller has a session (`actorId`). */
export async function addSharedItem(
  db: Db,
  actorId: string,
  input: { gestureId: string; token: string }
): Promise<{ added: boolean }> {
  const listId = await resolveEditable(db, input.token);
  return await addItemToList(db, {
    actorId,
    gestureId: input.gestureId,
    listId,
  });
}

/** Removes through an edit link; the caller has a session. */
export async function removeSharedItem(
  db: Db,
  input: { gestureId: string; token: string }
): Promise<{ removed: boolean }> {
  const listId = await resolveEditable(db, input.token);
  return await removeItemFromList(db, { gestureId: input.gestureId, listId });
}
