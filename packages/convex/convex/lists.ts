import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { toPublicSharedList } from "./lib/listSharing";
import {
  normalizeListDescription,
  normalizeListName,
  validateReorderPayload,
} from "./lib/listValidation";

const DEFAULT_FAVORITES_NAME = "Favorites";

const listValidator = v.object({
  _id: v.id("gesture_lists"),
  _creationTime: v.number(),
  ownerId: v.id("users"),
  name: v.string(),
  description: v.optional(v.string()),
  visibility: v.union(v.literal("private"), v.literal("shared")),
  viewShareToken: v.optional(v.string()),
  editShareToken: v.optional(v.string()),
  allowSharedEditing: v.boolean(),
  isDefaultFavorites: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const publicListValidator = v.object({
  _id: v.id("gesture_lists"),
  _creationTime: v.number(),
  name: v.string(),
  description: v.optional(v.string()),
  visibility: v.literal("shared"),
  allowSharedEditing: v.boolean(),
  canEdit: v.boolean(),
  isDefaultFavorites: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const gestureValidator = v.object({
  _id: v.id("gestures"),
  _creationTime: v.number(),
  name: v.string(),
  categoryIds: v.array(v.id("categories")),
  playbackId: v.string(),
  concept: v.array(v.string()),
  info: v.string(),
  isActive: v.boolean(),
  lastUpdated: v.number(),
});

const nativeGestureValidator = v.object({
  id: v.id("gestures"),
  name: v.string(),
  category: v.array(v.string()),
  playbackId: v.string(),
  concept: v.array(v.string()),
  info: v.string(),
});

type ListMutationCtx = Pick<MutationCtx, "db">;
type ListQueryCtx = Pick<QueryCtx, "db">;

function createShareToken() {
  return crypto.randomUUID().replaceAll("-", "");
}

async function getCategoryNames(
  ctx: ListQueryCtx,
  categoryIds: Id<"categories">[]
) {
  const categories = await Promise.all(categoryIds.map((id) => ctx.db.get(id)));
  return categories
    .filter((category) => category?.isActive)
    .map((category) => category!.name);
}

async function toNativeGesture(
  ctx: ListQueryCtx,
  gesture: Pick<
    Doc<"gestures">,
    "_id" | "name" | "categoryIds" | "playbackId" | "concept" | "info"
  >
) {
  return {
    id: gesture._id,
    name: gesture.name,
    category: await getCategoryNames(ctx, gesture.categoryIds),
    playbackId: gesture.playbackId,
    concept: gesture.concept,
    info: gesture.info,
  };
}

async function getDefaultFavoritesList(ctx: ListQueryCtx, userId: Id<"users">) {
  return await ctx.db
    .query("gesture_lists")
    .withIndex("by_owner_default", (q) =>
      q.eq("ownerId", userId).eq("isDefaultFavorites", true)
    )
    .unique();
}

export async function ensureDefaultFavoritesList(
  ctx: ListMutationCtx,
  userId: Id<"users">
) {
  const existing = await ctx.db
    .query("gesture_lists")
    .withIndex("by_owner_default", (q) =>
      q.eq("ownerId", userId).eq("isDefaultFavorites", true)
    )
    .unique();

  const listId =
    existing?._id ??
    (await ctx.db.insert("gesture_lists", {
      ownerId: userId,
      name: DEFAULT_FAVORITES_NAME,
      visibility: "private",
      allowSharedEditing: false,
      isDefaultFavorites: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

  const legacyFavorites = await ctx.db
    .query("user_favorites")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const sortedFavorites = legacyFavorites.toSorted(
    (a, b) => a.createdAt - b.createdAt
  );
  const existingItems = await getListItems(ctx, listId);
  const existingGestureIds = new Set(
    existingItems.map((item) => item.gestureId)
  );
  let nextPosition =
    existingItems.reduce(
      (highest, item) => Math.max(highest, item.position),
      -1
    ) + 1;

  for (const favorite of sortedFavorites) {
    if (!existingGestureIds.has(favorite.gestureId)) {
      await ctx.db.insert("gesture_list_items", {
        listId,
        gestureId: favorite.gestureId,
        addedBy: userId,
        position: nextPosition,
        createdAt: favorite.createdAt,
      });
      existingGestureIds.add(favorite.gestureId);
      nextPosition++;
    }

    await ctx.db.delete(favorite._id);
  }

  return listId;
}

async function requireOwnedList(
  ctx: ListQueryCtx,
  userId: Id<"users">,
  listId: Id<"gesture_lists">
) {
  const list = await ctx.db.get(listId);
  if (!(list && list.ownerId === userId)) {
    throw new Error("List not found");
  }
  return list;
}

async function requireSharedEditableList(
  ctx: ListQueryCtx,
  editShareToken: string
) {
  const list = await ctx.db
    .query("gesture_lists")
    .withIndex("by_edit_share_token", (q) =>
      q.eq("editShareToken", editShareToken)
    )
    .unique();

  if (!(list && list.visibility === "shared" && list.allowSharedEditing)) {
    throw new Error("List is not editable");
  }

  return list;
}

async function getSharedListByToken(ctx: ListQueryCtx, shareToken: string) {
  const viewList = await ctx.db
    .query("gesture_lists")
    .withIndex("by_view_share_token", (q) => q.eq("viewShareToken", shareToken))
    .unique();

  if (viewList?.visibility === "shared") {
    return { list: viewList, canEdit: false };
  }

  const editList = await ctx.db
    .query("gesture_lists")
    .withIndex("by_edit_share_token", (q) => q.eq("editShareToken", shareToken))
    .unique();

  if (editList?.visibility === "shared") {
    return { list: editList, canEdit: editList.allowSharedEditing };
  }

  return null;
}

async function getListItems(ctx: ListQueryCtx, listId: Id<"gesture_lists">) {
  return await ctx.db
    .query("gesture_list_items")
    .withIndex("by_list_position", (q) => q.eq("listId", listId))
    .collect();
}

async function getListGestureDocs(
  ctx: ListQueryCtx,
  listId: Id<"gesture_lists">
) {
  const items = await getListItems(ctx, listId);
  const gestures = await Promise.all(
    items.map((item) => ctx.db.get(item.gestureId))
  );

  return gestures.filter((gesture): gesture is Doc<"gestures"> =>
    Boolean(gesture?.isActive)
  );
}

async function getNextPosition(ctx: ListQueryCtx, listId: Id<"gesture_lists">) {
  const lastItem = await ctx.db
    .query("gesture_list_items")
    .withIndex("by_list_position", (q) => q.eq("listId", listId))
    .order("desc")
    .first();

  return (lastItem?.position ?? -1) + 1;
}

async function addGestureToListInternal(
  ctx: ListMutationCtx,
  listId: Id<"gesture_lists">,
  gestureId: Id<"gestures">,
  addedBy: Id<"users">
) {
  const gesture = await ctx.db.get(gestureId);
  if (!gesture?.isActive) {
    throw new Error("Gesture not found");
  }

  const existing = await ctx.db
    .query("gesture_list_items")
    .withIndex("by_list_gesture", (q) =>
      q.eq("listId", listId).eq("gestureId", gestureId)
    )
    .unique();

  if (existing) {
    return false;
  }

  await ctx.db.insert("gesture_list_items", {
    listId,
    gestureId,
    addedBy,
    position: await getNextPosition(ctx, listId),
    createdAt: Date.now(),
  });

  await ctx.db.patch(listId, { updatedAt: Date.now() });
  return true;
}

async function removeGestureFromListInternal(
  ctx: ListMutationCtx,
  listId: Id<"gesture_lists">,
  gestureId: Id<"gestures">
) {
  const existing = await ctx.db
    .query("gesture_list_items")
    .withIndex("by_list_gesture", (q) =>
      q.eq("listId", listId).eq("gestureId", gestureId)
    )
    .unique();

  if (!existing) {
    return false;
  }

  await ctx.db.delete(existing._id);
  await ctx.db.patch(listId, { updatedAt: Date.now() });
  return true;
}

export const initializeUserLists = mutation({
  args: { userId: v.id("users") },
  returns: v.id("gesture_lists"),
  handler: async (ctx, args) =>
    await ensureDefaultFavoritesList(ctx, args.userId),
});

export const listUserLists = query({
  args: { userId: v.id("users") },
  returns: v.array(listValidator),
  handler: async (ctx, args) =>
    await ctx.db
      .query("gesture_lists")
      .withIndex("by_owner_created_at", (q) => q.eq("ownerId", args.userId))
      .order("desc")
      .collect(),
});

export const getSavedGestureIds = query({
  args: { userId: v.id("users") },
  returns: v.array(v.id("gestures")),
  handler: async (ctx, args) => {
    const lists = await ctx.db
      .query("gesture_lists")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
      .collect();
    const itemGroups = await Promise.all(
      lists.map((list) => getListItems(ctx, list._id))
    );
    return [
      ...new Set(
        itemGroups.flatMap((items) => items.map((item) => item.gestureId))
      ),
    ];
  },
});

export const getGestureListIds = query({
  args: { userId: v.id("users"), gestureId: v.id("gestures") },
  returns: v.array(v.id("gesture_lists")),
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("gesture_list_items")
      .withIndex("by_gesture", (q) => q.eq("gestureId", args.gestureId))
      .collect();
    const lists = await Promise.all(
      items.map((item) => ctx.db.get(item.listId))
    );
    return lists
      .filter((list) => list?.ownerId === args.userId)
      .map((list) => list!._id);
  },
});

export const getListGestures = query({
  args: { userId: v.id("users"), listId: v.id("gesture_lists") },
  returns: v.array(gestureValidator),
  handler: async (ctx, args) => {
    await requireOwnedList(ctx, args.userId, args.listId);
    return await getListGestureDocs(ctx, args.listId);
  },
});

export const getListGesturesForNative = query({
  args: { userId: v.id("users"), listId: v.id("gesture_lists") },
  returns: v.array(nativeGestureValidator),
  handler: async (ctx, args) => {
    await requireOwnedList(ctx, args.userId, args.listId);
    const gestures = await getListGestureDocs(ctx, args.listId);
    return await Promise.all(
      gestures.map((gesture) => toNativeGesture(ctx, gesture))
    );
  },
});

export const getSharedList = query({
  args: { shareToken: v.string() },
  returns: v.union(publicListValidator, v.null()),
  handler: async (ctx, args) => {
    const result = await getSharedListByToken(ctx, args.shareToken);
    return result ? toPublicSharedList(result.list, result.canEdit) : null;
  },
});

export const getSharedListGestures = query({
  args: { shareToken: v.string() },
  returns: v.array(gestureValidator),
  handler: async (ctx, args) => {
    const result = await getSharedListByToken(ctx, args.shareToken);

    if (!result) {
      return [];
    }

    return await getListGestureDocs(ctx, result.list._id);
  },
});

export const createList = mutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    visibility: v.union(v.literal("private"), v.literal("shared")),
    allowSharedEditing: v.boolean(),
  },
  returns: v.id("gesture_lists"),
  handler: async (ctx, args) => {
    await ensureDefaultFavoritesList(ctx, args.userId);
    const now = Date.now();
    const isShared = args.visibility === "shared";

    return await ctx.db.insert("gesture_lists", {
      ownerId: args.userId,
      name: normalizeListName(args.name),
      description: normalizeListDescription(args.description),
      visibility: args.visibility,
      viewShareToken: isShared ? createShareToken() : undefined,
      editShareToken: isShared ? createShareToken() : undefined,
      allowSharedEditing: isShared && args.allowSharedEditing,
      isDefaultFavorites: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const renameList = mutation({
  args: {
    userId: v.id("users"),
    listId: v.id("gesture_lists"),
    name: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOwnedList(ctx, args.userId, args.listId);
    await ctx.db.patch(args.listId, {
      name: normalizeListName(args.name),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const updateListSharing = mutation({
  args: {
    userId: v.id("users"),
    listId: v.id("gesture_lists"),
    visibility: v.union(v.literal("private"), v.literal("shared")),
    allowSharedEditing: v.boolean(),
  },
  returns: listValidator,
  handler: async (ctx, args) => {
    const list = await requireOwnedList(ctx, args.userId, args.listId);
    const isShared = args.visibility === "shared";

    await ctx.db.patch(args.listId, {
      visibility: args.visibility,
      viewShareToken: isShared
        ? (list.viewShareToken ?? createShareToken())
        : undefined,
      editShareToken: isShared
        ? (list.editShareToken ?? createShareToken())
        : undefined,
      allowSharedEditing: isShared && args.allowSharedEditing,
      updatedAt: Date.now(),
    });

    const updated = await ctx.db.get(args.listId);
    if (!updated) {
      throw new Error("List not found");
    }
    return updated;
  },
});

export const regenerateShareTokens = mutation({
  args: { userId: v.id("users"), listId: v.id("gesture_lists") },
  returns: listValidator,
  handler: async (ctx, args) => {
    await requireOwnedList(ctx, args.userId, args.listId);
    await ctx.db.patch(args.listId, {
      viewShareToken: createShareToken(),
      editShareToken: createShareToken(),
      updatedAt: Date.now(),
    });
    const updated = await ctx.db.get(args.listId);
    if (!updated) {
      throw new Error("List not found");
    }
    return updated;
  },
});

export const deleteList = mutation({
  args: { userId: v.id("users"), listId: v.id("gesture_lists") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const list = await requireOwnedList(ctx, args.userId, args.listId);
    if (list.isDefaultFavorites) {
      throw new Error("Default Favorites list cannot be deleted");
    }

    const items = await getListItems(ctx, args.listId);
    for (const item of items) {
      await ctx.db.delete(item._id);
    }
    await ctx.db.delete(args.listId);
    return null;
  },
});

export const addGestureToList = mutation({
  args: {
    userId: v.id("users"),
    listId: v.id("gesture_lists"),
    gestureId: v.id("gestures"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    await requireOwnedList(ctx, args.userId, args.listId);
    return await addGestureToListInternal(
      ctx,
      args.listId,
      args.gestureId,
      args.userId
    );
  },
});

export const removeGestureFromList = mutation({
  args: {
    userId: v.id("users"),
    listId: v.id("gesture_lists"),
    gestureId: v.id("gestures"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    await requireOwnedList(ctx, args.userId, args.listId);
    return await removeGestureFromListInternal(
      ctx,
      args.listId,
      args.gestureId
    );
  },
});

export const addGestureToSharedEditableList = mutation({
  args: {
    userId: v.id("users"),
    editShareToken: v.string(),
    gestureId: v.id("gestures"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const list = await requireSharedEditableList(ctx, args.editShareToken);
    return await addGestureToListInternal(
      ctx,
      list._id,
      args.gestureId,
      args.userId
    );
  },
});

export const removeGestureFromSharedEditableList = mutation({
  args: {
    userId: v.id("users"),
    editShareToken: v.string(),
    gestureId: v.id("gestures"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const list = await requireSharedEditableList(ctx, args.editShareToken);
    return await removeGestureFromListInternal(ctx, list._id, args.gestureId);
  },
});

export const reorderListItems = mutation({
  args: {
    userId: v.id("users"),
    listId: v.id("gesture_lists"),
    gestureIds: v.array(v.id("gestures")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOwnedList(ctx, args.userId, args.listId);
    const items = await getListItems(ctx, args.listId);
    const itemByGestureId = new Map(
      items.map((item) => [item.gestureId, item] as const)
    );
    validateReorderPayload(
      items.map((item) => item.gestureId),
      args.gestureIds
    );

    for (const [position, gestureId] of args.gestureIds.entries()) {
      const item = itemByGestureId.get(gestureId);
      if (!item) {
        throw new Error("Reorder payload contains an unknown gesture");
      }
      await ctx.db.patch(item._id, { position });
    }

    await ctx.db.patch(args.listId, { updatedAt: Date.now() });
    return null;
  },
});

export const backfillDefaultFavoritesLists = internalMutation({
  args: {},
  returns: v.object({ migratedUsers: v.number() }),
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    let migratedUsers = 0;

    for (const user of users) {
      await ensureDefaultFavoritesList(ctx, user._id);
      migratedUsers++;
    }

    return { migratedUsers };
  },
});

export async function getDefaultFavoriteGestureIdsForUser(
  ctx: ListQueryCtx,
  userId: Id<"users">
) {
  const defaultList = await getDefaultFavoritesList(ctx, userId);
  if (!defaultList) {
    const legacyFavorites = await ctx.db
      .query("user_favorites")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return legacyFavorites.map((favorite) => favorite.gestureId);
  }

  const items = await getListItems(ctx, defaultList._id);
  return items.map((item) => item.gestureId);
}

export async function getDefaultFavoriteGesturesForUser(
  ctx: ListQueryCtx,
  userId: Id<"users">
) {
  const defaultList = await getDefaultFavoritesList(ctx, userId);
  if (!defaultList) {
    const legacyFavorites = await ctx.db
      .query("user_favorites")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const gestures = await Promise.all(
      legacyFavorites.map((favorite) => ctx.db.get(favorite.gestureId))
    );
    return gestures.filter((gesture): gesture is Doc<"gestures"> =>
      Boolean(gesture?.isActive)
    );
  }

  return await getListGestureDocs(ctx, defaultList._id);
}

export async function isDefaultFavoriteGesture(
  ctx: ListQueryCtx,
  userId: Id<"users">,
  gestureId: Id<"gestures">
) {
  const defaultList = await getDefaultFavoritesList(ctx, userId);
  if (!defaultList) {
    return Boolean(
      await ctx.db
        .query("user_favorites")
        .withIndex("by_user_gesture", (q) =>
          q.eq("userId", userId).eq("gestureId", gestureId)
        )
        .unique()
    );
  }

  return Boolean(
    await ctx.db
      .query("gesture_list_items")
      .withIndex("by_list_gesture", (q) =>
        q.eq("listId", defaultList._id).eq("gestureId", gestureId)
      )
      .unique()
  );
}

export async function addDefaultFavoriteGesture(
  ctx: ListMutationCtx,
  userId: Id<"users">,
  gestureId: Id<"gestures">
) {
  const listId = await ensureDefaultFavoritesList(ctx, userId);
  return await addGestureToListInternal(ctx, listId, gestureId, userId);
}

export async function removeDefaultFavoriteGesture(
  ctx: ListMutationCtx,
  userId: Id<"users">,
  gestureId: Id<"gestures">
) {
  const listId = await ensureDefaultFavoritesList(ctx, userId);
  return await removeGestureFromListInternal(ctx, listId, gestureId);
}

export async function toggleDefaultFavoriteGesture(
  ctx: ListMutationCtx,
  userId: Id<"users">,
  gestureId: Id<"gestures">
) {
  const listId = await ensureDefaultFavoritesList(ctx, userId);
  const existing = await ctx.db
    .query("gesture_list_items")
    .withIndex("by_list_gesture", (q) =>
      q.eq("listId", listId).eq("gestureId", gestureId)
    )
    .unique();

  if (existing) {
    await ctx.db.delete(existing._id);
    await ctx.db.patch(listId, { updatedAt: Date.now() });
    return false;
  }

  await addGestureToListInternal(ctx, listId, gestureId, userId);
  return true;
}

export { toNativeGesture };
