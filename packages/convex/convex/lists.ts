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
import { isValidServiceToken } from "./lib/serviceAuth";

const DEFAULT_FAVORITES_NAME = "Favorites";

const listValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("gesture_lists"),
  allowSharedEditing: v.boolean(),
  createdAt: v.number(),
  description: v.optional(v.string()),
  editShareToken: v.optional(v.string()),
  isDefaultFavorites: v.boolean(),
  name: v.string(),
  ownerId: v.id("users"),
  updatedAt: v.number(),
  viewShareToken: v.optional(v.string()),
  visibility: v.union(v.literal("private"), v.literal("shared")),
});

const publicListValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("gesture_lists"),
  allowSharedEditing: v.boolean(),
  canEdit: v.boolean(),
  createdAt: v.number(),
  description: v.optional(v.string()),
  isDefaultFavorites: v.boolean(),
  name: v.string(),
  updatedAt: v.number(),
  visibility: v.literal("shared"),
});

const gestureValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("gestures"),
  categoryIds: v.array(v.id("categories")),
  concept: v.array(v.string()),
  info: v.string(),
  isActive: v.boolean(),
  lastUpdated: v.number(),
  name: v.string(),
  playbackId: v.string(),
});

const nativeGestureValidator = v.object({
  category: v.array(v.string()),
  concept: v.array(v.string()),
  id: v.id("gestures"),
  info: v.string(),
  name: v.string(),
  playbackId: v.string(),
});

type ListMutationCtx = Pick<MutationCtx, "db">;
type ListQueryCtx = Pick<QueryCtx, "db">;

function createShareToken() {
  return crypto.randomUUID().replaceAll("-", "");
}

export async function requireUserAccess(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
  serviceToken?: string
): Promise<void> {
  if (isValidServiceToken(serviceToken)) {
    return;
  }

  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error("Unauthorized");
  }

  if (user.workosId) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || identity.subject !== user.workosId) {
      throw new Error("Unauthorized");
    }
    return;
  }

  // Guest Convex IDs are only returned to the device that owns the random
  // guest token and are treated as unguessable capabilities.
  if (!user.guestId) {
    throw new Error("Unauthorized");
  }
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
    category: await getCategoryNames(ctx, gesture.categoryIds),
    concept: gesture.concept,
    id: gesture._id,
    info: gesture.info,
    name: gesture.name,
    playbackId: gesture.playbackId,
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

async function getLegacyFavoriteGestureIds(
  ctx: ListQueryCtx,
  userId: Id<"users">
) {
  const favorites = await ctx.db
    .query("user_favorites")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  return favorites
    .toSorted((a, b) => a.createdAt - b.createdAt)
    .map((favorite) => favorite.gestureId);
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
      allowSharedEditing: false,
      createdAt: Date.now(),
      isDefaultFavorites: true,
      name: DEFAULT_FAVORITES_NAME,
      ownerId: userId,
      updatedAt: Date.now(),
      visibility: "private",
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
      // biome-ignore lint/performance/noAwaitInLoops: inserts are sequential so positions are assigned in createdAt order
      await ctx.db.insert("gesture_list_items", {
        addedBy: userId,
        createdAt: favorite.createdAt,
        gestureId: favorite.gestureId,
        listId,
        position: nextPosition,
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
    return { canEdit: false, list: viewList };
  }

  const editList = await ctx.db
    .query("gesture_lists")
    .withIndex("by_edit_share_token", (q) => q.eq("editShareToken", shareToken))
    .unique();

  if (editList?.visibility === "shared") {
    return { canEdit: editList.allowSharedEditing, list: editList };
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
    addedBy,
    createdAt: Date.now(),
    gestureId,
    listId,
    position: await getNextPosition(ctx, listId),
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
  args: {
    serviceToken: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireUserAccess(ctx, args.userId, args.serviceToken);
    return await ensureDefaultFavoritesList(ctx, args.userId);
  },
  returns: v.id("gesture_lists"),
});

export const listUserLists = query({
  args: {
    serviceToken: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireUserAccess(ctx, args.userId, args.serviceToken);
    return await ctx.db
      .query("gesture_lists")
      .withIndex("by_owner_created_at", (q) => q.eq("ownerId", args.userId))
      .order("desc")
      .collect();
  },
  returns: v.array(listValidator),
});

export const getSavedGestureIds = query({
  args: {
    serviceToken: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireUserAccess(ctx, args.userId, args.serviceToken);
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
  returns: v.array(v.id("gestures")),
});

export const getGestureListIds = query({
  args: {
    gestureId: v.id("gestures"),
    serviceToken: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireUserAccess(ctx, args.userId, args.serviceToken);
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
  returns: v.array(v.id("gesture_lists")),
});

export const getListGestures = query({
  args: {
    listId: v.id("gesture_lists"),
    serviceToken: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireUserAccess(ctx, args.userId, args.serviceToken);
    await requireOwnedList(ctx, args.userId, args.listId);
    return await getListGestureDocs(ctx, args.listId);
  },
  returns: v.array(gestureValidator),
});

export const getListGesturesForNative = query({
  args: {
    listId: v.id("gesture_lists"),
    serviceToken: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireUserAccess(ctx, args.userId, args.serviceToken);
    const list = await ctx.db.get(args.listId);
    if (!list || list.ownerId !== args.userId) {
      return [];
    }

    const gestures = await getListGestureDocs(ctx, args.listId);
    return await Promise.all(
      gestures.map((gesture) => toNativeGesture(ctx, gesture))
    );
  },
  returns: v.array(nativeGestureValidator),
});

export const getSharedList = query({
  args: { shareToken: v.string() },
  handler: async (ctx, args) => {
    const result = await getSharedListByToken(ctx, args.shareToken);
    return result ? toPublicSharedList(result.list, result.canEdit) : null;
  },
  returns: v.union(publicListValidator, v.null()),
});

export const getSharedListGestures = query({
  args: { shareToken: v.string() },
  handler: async (ctx, args) => {
    const result = await getSharedListByToken(ctx, args.shareToken);

    if (!result) {
      return [];
    }

    return await getListGestureDocs(ctx, result.list._id);
  },
  returns: v.array(gestureValidator),
});

export const createList = mutation({
  args: {
    allowSharedEditing: v.boolean(),
    description: v.optional(v.string()),
    name: v.string(),
    serviceToken: v.optional(v.string()),
    userId: v.id("users"),
    visibility: v.union(v.literal("private"), v.literal("shared")),
  },
  handler: async (ctx, args) => {
    await requireUserAccess(ctx, args.userId, args.serviceToken);
    await ensureDefaultFavoritesList(ctx, args.userId);
    const now = Date.now();
    const isShared = args.visibility === "shared";

    return await ctx.db.insert("gesture_lists", {
      allowSharedEditing: isShared && args.allowSharedEditing,
      createdAt: now,
      description: normalizeListDescription(args.description),
      editShareToken: isShared ? createShareToken() : undefined,
      isDefaultFavorites: false,
      name: normalizeListName(args.name),
      ownerId: args.userId,
      updatedAt: now,
      viewShareToken: isShared ? createShareToken() : undefined,
      visibility: args.visibility,
    });
  },
  returns: v.id("gesture_lists"),
});

export const renameList = mutation({
  args: {
    listId: v.id("gesture_lists"),
    name: v.string(),
    serviceToken: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireUserAccess(ctx, args.userId, args.serviceToken);
    await requireOwnedList(ctx, args.userId, args.listId);
    await ctx.db.patch(args.listId, {
      name: normalizeListName(args.name),
      updatedAt: Date.now(),
    });
    return null;
  },
  returns: v.null(),
});

export const updateListSharing = mutation({
  args: {
    allowSharedEditing: v.boolean(),
    listId: v.id("gesture_lists"),
    serviceToken: v.optional(v.string()),
    userId: v.id("users"),
    visibility: v.union(v.literal("private"), v.literal("shared")),
  },
  handler: async (ctx, args) => {
    await requireUserAccess(ctx, args.userId, args.serviceToken);
    const list = await requireOwnedList(ctx, args.userId, args.listId);
    const isShared = args.visibility === "shared";

    await ctx.db.patch(args.listId, {
      allowSharedEditing: isShared && args.allowSharedEditing,
      editShareToken: isShared
        ? (list.editShareToken ?? createShareToken())
        : undefined,
      updatedAt: Date.now(),
      viewShareToken: isShared
        ? (list.viewShareToken ?? createShareToken())
        : undefined,
      visibility: args.visibility,
    });

    const updated = await ctx.db.get(args.listId);
    if (!updated) {
      throw new Error("List not found");
    }
    return updated;
  },
  returns: listValidator,
});

export const regenerateShareTokens = mutation({
  args: {
    listId: v.id("gesture_lists"),
    serviceToken: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireUserAccess(ctx, args.userId, args.serviceToken);
    await requireOwnedList(ctx, args.userId, args.listId);
    await ctx.db.patch(args.listId, {
      editShareToken: createShareToken(),
      updatedAt: Date.now(),
      viewShareToken: createShareToken(),
    });
    const updated = await ctx.db.get(args.listId);
    if (!updated) {
      throw new Error("List not found");
    }
    return updated;
  },
  returns: listValidator,
});

export const deleteList = mutation({
  args: {
    listId: v.id("gesture_lists"),
    serviceToken: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireUserAccess(ctx, args.userId, args.serviceToken);
    const list = await requireOwnedList(ctx, args.userId, args.listId);
    if (list.isDefaultFavorites) {
      throw new Error("Default Favorites list cannot be deleted");
    }

    const items = await getListItems(ctx, args.listId);
    await Promise.all(items.map((item) => ctx.db.delete(item._id)));
    await ctx.db.delete(args.listId);
    return null;
  },
  returns: v.null(),
});

export const addGestureToList = mutation({
  args: {
    gestureId: v.id("gestures"),
    listId: v.id("gesture_lists"),
    serviceToken: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireUserAccess(ctx, args.userId, args.serviceToken);
    await requireOwnedList(ctx, args.userId, args.listId);
    return await addGestureToListInternal(
      ctx,
      args.listId,
      args.gestureId,
      args.userId
    );
  },
  returns: v.boolean(),
});

export const removeGestureFromList = mutation({
  args: {
    gestureId: v.id("gestures"),
    listId: v.id("gesture_lists"),
    serviceToken: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireUserAccess(ctx, args.userId, args.serviceToken);
    await requireOwnedList(ctx, args.userId, args.listId);
    return await removeGestureFromListInternal(
      ctx,
      args.listId,
      args.gestureId
    );
  },
  returns: v.boolean(),
});

export const addGestureToSharedEditableList = mutation({
  args: {
    editShareToken: v.string(),
    gestureId: v.id("gestures"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const list = await requireSharedEditableList(ctx, args.editShareToken);
    return await addGestureToListInternal(
      ctx,
      list._id,
      args.gestureId,
      args.userId
    );
  },
  returns: v.boolean(),
});

export const removeGestureFromSharedEditableList = mutation({
  args: {
    editShareToken: v.string(),
    gestureId: v.id("gestures"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const list = await requireSharedEditableList(ctx, args.editShareToken);
    return await removeGestureFromListInternal(ctx, list._id, args.gestureId);
  },
  returns: v.boolean(),
});

export const reorderListItems = mutation({
  args: {
    gestureIds: v.array(v.id("gestures")),
    listId: v.id("gesture_lists"),
    serviceToken: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireUserAccess(ctx, args.userId, args.serviceToken);
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
      // biome-ignore lint/performance/noAwaitInLoops: validate each gesture before patching, stopping at the first unknown one
      await ctx.db.patch(item._id, { position });
    }

    await ctx.db.patch(args.listId, { updatedAt: Date.now() });
    return null;
  },
  returns: v.null(),
});

export const backfillDefaultFavoritesLists = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    let migratedUsers = 0;

    for (const user of users) {
      // biome-ignore lint/performance/noAwaitInLoops: migration runs per user sequentially; ensureDefaultFavoritesList reads then writes each user's lists
      await ensureDefaultFavoritesList(ctx, user._id);
      migratedUsers++;
    }

    return { migratedUsers };
  },
  returns: v.object({ migratedUsers: v.number() }),
});

export async function getDefaultFavoriteGestureIdsForUser(
  ctx: ListQueryCtx,
  userId: Id<"users">
) {
  const legacyGestureIds = await getLegacyFavoriteGestureIds(ctx, userId);
  const defaultList = await getDefaultFavoritesList(ctx, userId);
  if (!defaultList) {
    return legacyGestureIds;
  }

  const items = await getListItems(ctx, defaultList._id);
  return [
    ...new Set([...items.map((item) => item.gestureId), ...legacyGestureIds]),
  ];
}

export async function getDefaultFavoriteGesturesForUser(
  ctx: ListQueryCtx,
  userId: Id<"users">
) {
  const gestureIds = await getDefaultFavoriteGestureIdsForUser(ctx, userId);
  const gestures = await Promise.all(gestureIds.map((id) => ctx.db.get(id)));
  return gestures.filter((gesture): gesture is Doc<"gestures"> =>
    Boolean(gesture?.isActive)
  );
}

export async function isDefaultFavoriteGesture(
  ctx: ListQueryCtx,
  userId: Id<"users">,
  gestureId: Id<"gestures">
) {
  const legacyFavorite = await ctx.db
    .query("user_favorites")
    .withIndex("by_user_gesture", (q) =>
      q.eq("userId", userId).eq("gestureId", gestureId)
    )
    .unique();
  if (legacyFavorite) {
    return true;
  }

  const defaultList = await getDefaultFavoritesList(ctx, userId);
  if (!defaultList) {
    return false;
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
