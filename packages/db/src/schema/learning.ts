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
    createdAt: createdAt(),
    id: text("id").primaryKey(),
    legacyId: text("legacy_id").unique(),
    name: text("name").notNull(),
    publishedAt: timestamp("published_at"),
    slug: text("slug").notNull().unique(),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [index("category_published_sort_idx").on(t.publishedAt, t.sortOrder)]
);

export const gesture = sqliteTable(
  "gesture",
  {
    createdAt: createdAt(),
    description: text("description").notNull().default(""),
    id: text("id").primaryKey(),
    legacyId: text("legacy_id").unique(),
    muxAssetId: text("mux_asset_id"),
    name: text("name").notNull(),
    playbackId: text("playback_id").notNull(),
    publishedAt: timestamp("published_at"),
    slug: text("slug").notNull().unique(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("gesture_published_name_idx").on(t.publishedAt, t.name),
    index("gesture_mux_asset_id_idx").on(t.muxAssetId),
  ]
);

export const gestureCategory = sqliteTable(
  "gesture_category",
  {
    categoryId: text("category_id")
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
    gestureId: text("gesture_id")
      .notNull()
      .references(() => gesture.id, { onDelete: "cascade" }),
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
    createdAt: createdAt(),
    gestureId: text("gesture_id")
      .notNull()
      .references(() => gesture.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.gestureId] }),
    index("favorite_gesture_id_idx").on(t.gestureId),
  ]
);

export const list = sqliteTable(
  "list",
  {
    createdAt: createdAt(),
    description: text("description"),
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
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
    addedBy: text("added_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    gestureId: text("gesture_id")
      .notNull()
      .references(() => gesture.id, { onDelete: "cascade" }),
    listId: text("list_id")
      .notNull()
      .references(() => list.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
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
    createdAt: createdAt(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    id: text("id").primaryKey(),
    listId: text("list_id")
      .notNull()
      .references(() => list.id, { onDelete: "cascade" }),
    revokedAt: timestamp("revoked_at"),
    role: text("role", { enum: LIST_SHARE_ROLES }).notNull(),
    /** 32 random bytes, base64url (`newToken()`); stored in plain text. */
    token: text("token").notNull().unique(),
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
