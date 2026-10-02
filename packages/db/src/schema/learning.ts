/** Learning tables (spec §5.2). `gesture_fts` lives in migration 0001. */

import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { LIST_SHARE_ROLES } from "../enums";
import { user } from "./auth";
import {
  col,
  createdAt,
  inValues,
  lengthBetween,
  timestamp,
  updatedAt,
} from "./columns";

export const category = sqliteTable(
  "category",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    publishedAt: timestamp("published_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    legacyId: text("legacy_id").unique(),
  },
  (t) => [index("category_published_sort_idx").on(t.publishedAt, t.sortOrder)]
);

export const gesture = sqliteTable(
  "gesture",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    /**
     * `gestureSortName(name)` (`normalizeText`: lowercase, no accents), the
     * public catalogue order. SQLite can neither strip accents nor take a
     * custom collation on D1, so the writers set it: the gestures/admin
     * services, the seed, the data migration and the test factories.
     */
    sortName: text("sort_name").notNull(),
    description: text("description").notNull().default(""),
    playbackId: text("playback_id").notNull(),
    muxAssetId: text("mux_asset_id"),
    publishedAt: timestamp("published_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    legacyId: text("legacy_id").unique(),
  },
  (t) => [
    // The public catalogue order (`@smog/gestures`: published only,
    // `sort_name, id` keyset): the partial index serves the filter, the
    // order and the cursor, so a page reads only its own rows.
    index("gesture_published_sort_name_idx")
      .on(t.sortName, t.id)
      .where(sql`${col(t.publishedAt)} IS NOT NULL`),
    // The admin list (`@smog/admin`): every gesture, published or not, in
    // the same `sort_name, id` keyset order (migration 0006).
    index("gesture_sort_name_idx").on(t.sortName, t.id),
    index("gesture_mux_asset_id_idx").on(t.muxAssetId),
  ]
);

export const gestureCategory = sqliteTable(
  "gesture_category",
  {
    gestureId: text("gesture_id")
      .notNull()
      .references(() => gesture.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.gestureId, t.categoryId] }),
    index("gesture_category_category_id_idx").on(t.categoryId),
  ]
);

/** Synonyms / related concepts ("concept" in the old model). */
export const gestureKeyword = sqliteTable(
  "gesture_keyword",
  {
    gestureId: text("gesture_id")
      .notNull()
      .references(() => gesture.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.gestureId, t.keyword] })]
);

export const favorite = sqliteTable(
  "favorite",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    gestureId: text("gesture_id")
      .notNull()
      .references(() => gesture.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.gestureId] }),
    index("favorite_gesture_id_idx").on(t.gestureId),
    // A user's favorites newest first (`ids`, the `list` keyset).
    index("favorite_user_created_idx").on(t.userId, t.createdAt, t.gestureId),
  ]
);

export const list = sqliteTable(
  "list",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("list_name_length_check", lengthBetween(t.name, 1, 80)),
    check(
      "list_description_length_check",
      lengthBetween(t.description, 0, 280)
    ),
    index("list_owner_updated_idx").on(t.ownerId, t.updatedAt),
  ]
);

export const listItem = sqliteTable(
  "list_item",
  {
    listId: text("list_id")
      .notNull()
      .references(() => list.id, { onDelete: "cascade" }),
    gestureId: text("gesture_id")
      .notNull()
      .references(() => gesture.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    addedBy: text("added_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.listId, t.gestureId] }),
    index("list_item_list_position_idx").on(t.listId, t.position),
    index("list_item_gesture_id_idx").on(t.gestureId),
    index("list_item_added_by_idx").on(t.addedBy),
  ]
);

export const listShare = sqliteTable(
  "list_share",
  {
    id: text("id").primaryKey(),
    listId: text("list_id")
      .notNull()
      .references(() => list.id, { onDelete: "cascade" }),
    role: text("role", { enum: LIST_SHARE_ROLES }).notNull(),
    /** 32 random bytes, base64url (`newToken()`); stored in plain text. */
    token: text("token").notNull().unique(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    revokedAt: timestamp("revoked_at"),
  },
  (t) => [
    check("list_share_role_check", inValues(t.role, LIST_SHARE_ROLES)),
    uniqueIndex("list_share_active_role_uq")
      .on(t.listId, t.role)
      .where(sql`${col(t.revokedAt)} IS NULL`),
    index("list_share_list_id_idx").on(t.listId),
    index("list_share_created_by_idx").on(t.createdBy),
  ]
);
