import { newId } from "@smog/utils";
import type { Db } from "../client";
import { category, gesture, user } from "../schema";
import { gestureSortName } from "../sort-name";
import type {
  Category,
  Gesture,
  NewCategory,
  NewGesture,
  NewUser,
  User,
} from "../types";

/** A public sample Mux playback id (also used by the dev seed). */
export const SAMPLE_PLAYBACK_ID =
  "VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU";

function first<T>(rows: T[], table: string): T {
  const [row] = rows;
  if (!row) {
    throw new Error(`[factories] Failed to insert a ${table} row`);
  }
  return row;
}

/** Inserts a user (unique email, role `user`) and returns the row. */
export async function makeUser(
  db: Db,
  overrides: Partial<NewUser> = {}
): Promise<User> {
  const id = overrides.id ?? newId();
  const rows = await db
    .insert(user)
    .values({ email: `${id}@smog.test`, id, name: "Test User", ...overrides })
    .returning();
  return first(rows, "user");
}

/** Inserts a published category (unique slug) and returns the row. */
export async function makeCategory(
  db: Db,
  overrides: Partial<NewCategory> = {}
): Promise<Category> {
  const id = overrides.id ?? newId();
  const rows = await db
    .insert(category)
    .values({
      id,
      name: "Test Category",
      publishedAt: new Date(),
      slug: `category-${id}`,
      ...overrides,
    })
    .returning();
  return first(rows, "category");
}

/** Inserts a published gesture (unique slug) and returns the row. */
export async function makeGesture(
  db: Db,
  overrides: Partial<NewGesture> = {}
): Promise<Gesture> {
  const id = overrides.id ?? newId();
  const name = overrides.name ?? "Test Gesture";
  const rows = await db
    .insert(gesture)
    .values({
      id,
      name,
      playbackId: SAMPLE_PLAYBACK_ID,
      publishedAt: new Date(),
      slug: `gesture-${id}`,
      sortName: gestureSortName(name),
      ...overrides,
    })
    .returning();
  return first(rows, "gesture");
}
