import { env } from "cloudflare:workers";
import type { SessionWithUser } from "@smog/auth";
import type { User } from "@smog/db";
import { createDb, type Db } from "@smog/db/client";
import { makeGesture, makeUser } from "@smog/db/testing";
import { makeRpcContext } from "@smog/rpc/testing";

export function testDb(): Db {
  return createDb(env.DB);
}

/** A session for a real user row (the middleware reads only these fields). */
function sessionFor(owner: User): SessionWithUser {
  return {
    session: { id: `session-${owner.id}`, userId: owner.id },
    user: {
      email: owner.email,
      id: owner.id,
      image: null,
      name: owner.name,
      role: "user",
    },
  } as SessionWithUser;
}

/** An rpc context over the test D1, signed in as `as` (or a guest). */
export function contextFor(as: User | null) {
  return {
    context: makeRpcContext({
      db: testDb(),
      session: as ? sessionFor(as) : null,
    }),
  };
}

export async function addUser(name = "Anna"): Promise<User> {
  return await makeUser(testDb(), { name });
}

export async function addGestures(
  names: readonly string[],
  options: { published?: boolean } = {}
): Promise<string[]> {
  const db = testDb();
  const rows = await Promise.all(
    names.map((name) =>
      makeGesture(db, {
        name,
        publishedAt: options.published === false ? null : new Date(),
      })
    )
  );
  return rows.map((row) => row.id);
}

/** Inserts a list with its items (positions 0..n-1) straight into D1. */
export async function addList(
  ownerId: string,
  name: string,
  gestureIds: readonly string[] = [],
  updatedAt = 1000
): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO list (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(id, ownerId, name, updatedAt, updatedAt),
    ...gestureIds.map((gestureId, position) =>
      env.DB.prepare(
        "INSERT INTO list_item (list_id, gesture_id, position, added_by, created_at) VALUES (?, ?, ?, ?, ?)"
      ).bind(id, gestureId, position, ownerId, updatedAt)
    ),
  ]);
  return id;
}

export interface StoredList {
  description: string | null;
  id: string;
  items: string[];
  name: string;
  positions: number[];
  updatedAt: number;
}

/** The owner's lists (oldest first) with their items by position. */
export async function storedLists(ownerId: string): Promise<StoredList[]> {
  const { results: lists } = await env.DB.prepare(
    "SELECT id, name, description, updated_at AS updatedAt FROM list WHERE owner_id = ? ORDER BY created_at, name"
  )
    .bind(ownerId)
    .all<Omit<StoredList, "items" | "positions">>();
  return await Promise.all(
    lists.map(async (row) => {
      const { results } = await env.DB.prepare(
        "SELECT gesture_id AS gestureId, position FROM list_item WHERE list_id = ? ORDER BY position"
      )
        .bind(row.id)
        .all<{ gestureId: string; position: number }>();
      return {
        ...row,
        items: results.map((item) => item.gestureId),
        positions: results.map((item) => item.position),
      };
    })
  );
}

/** The user's favorite gesture ids, newest first. */
export async function storedFavorites(userId: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    "SELECT gesture_id AS gestureId FROM favorite WHERE user_id = ? ORDER BY created_at DESC, gesture_id DESC"
  )
    .bind(userId)
    .all<{ gestureId: string }>();
  return results.map((row) => row.gestureId);
}

export interface StoredConsent {
  createdAt: number;
  granted: number;
  policyVersion: string;
  purpose: string;
  source: string;
}

export async function storedConsent(userId: string): Promise<StoredConsent[]> {
  const { results } = await env.DB.prepare(
    "SELECT purpose, granted, policy_version AS policyVersion, source, created_at AS createdAt FROM consent_event WHERE user_id = ? ORDER BY created_at"
  )
    .bind(userId)
    .all<StoredConsent>();
  return results;
}
