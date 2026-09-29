import { env } from "cloudflare:workers";
import type { SessionWithUser } from "@smog/auth";
import { gesture, type User } from "@smog/db";
import { createDb, type Db } from "@smog/db/client";
import { makeGesture, makeUser } from "@smog/db/testing";
import type { GestureSummary } from "@smog/gestures/schema";
import type { Locale } from "@smog/i18n";
import { makeRpcContext } from "@smog/rpc/testing";
import { and, inArray, isNotNull } from "drizzle-orm";
import { createListsRouter, type GestureSummaries } from "../src/server";

/**
 * Published gestures by id, in the order asked: what `@smog/gestures`
 * `findGesturesByIds` answers (the api wires the real one), minus the
 * categories and the sponsored video.
 */
const fakeSummaries: GestureSummaries = async (db, ids) => {
  if (ids.length === 0) {
    return [];
  }
  const rows = await db
    .select({
      id: gesture.id,
      name: gesture.name,
      playbackId: gesture.playbackId,
      slug: gesture.slug,
    })
    .from(gesture)
    .where(and(isNotNull(gesture.publishedAt), inArray(gesture.id, [...ids])));
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id): GestureSummary[] => {
    const row = byId.get(id);
    return row ? [{ ...row, categories: [] }] : [];
  });
};

export const router = createListsRouter({ gestureSummaries: fakeSummaries });

function testDb(): Db {
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
export function contextFor(as: User | null, options: { locale?: Locale } = {}) {
  return {
    context: makeRpcContext({
      db: testDb(),
      locale: options.locale ?? "nl",
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

/** Every list_item row of a list, by position. */
export async function storedItems(
  listId: string
): Promise<{ gestureId: string; position: number }[]> {
  const { results } = await env.DB.prepare(
    "SELECT gesture_id AS gestureId, position FROM list_item WHERE list_id = ? ORDER BY position, gesture_id"
  )
    .bind(listId)
    .all<{ gestureId: string; position: number }>();
  return results;
}
