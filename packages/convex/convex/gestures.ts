import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireServiceAuth } from "./lib/serviceAuth";

const nativeGestureValidator = v.object({
  category: v.array(v.string()),
  concept: v.array(v.string()),
  id: v.id("gestures"),
  info: v.string(),
  name: v.string(),
  playbackId: v.string(),
});

async function getCategoryNames(
  ctx: QueryCtx,
  categoryIds: Id<"categories">[]
) {
  const categories = await Promise.all(categoryIds.map((id) => ctx.db.get(id)));
  return categories
    .filter((category) => category?.isActive)
    .map((category) => category!.name);
}

async function toNativeGesture(
  ctx: QueryCtx,
  gesture: {
    _id: Id<"gestures">;
    name: string;
    categoryIds: Id<"categories">[];
    playbackId: string;
    concept: string[];
    info: string;
  }
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

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase();
}

function matchesSearch(
  gesture: { name: string; concept: string[]; info: string },
  categories: string[],
  queryText: string
) {
  if (!queryText) {
    return true;
  }

  return [gesture.name, gesture.info, ...gesture.concept, ...categories].some(
    (value) => value.toLocaleLowerCase().includes(queryText)
  );
}

function scoreSearchResult(
  gesture: { name: string; concept: string[]; info: string },
  categories: string[],
  queryText: string
) {
  if (!queryText) {
    return 0;
  }

  const name = gesture.name.toLocaleLowerCase();
  if (name === queryText) {
    return 1000;
  }
  if (name.startsWith(queryText)) {
    return 750;
  }
  if (name.includes(queryText)) {
    return 500;
  }
  if (
    gesture.concept.some((value) =>
      value.toLocaleLowerCase().includes(queryText)
    )
  ) {
    return 300;
  }
  if (
    categories.some((value) => value.toLocaleLowerCase().includes(queryText))
  ) {
    return 200;
  }
  if (gesture.info.toLocaleLowerCase().includes(queryText)) {
    return 100;
  }
  return 0;
}

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) =>
    await ctx.db
      .query("gestures")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .order("desc")
      .paginate(args.paginationOpts),
  returns: v.any(), // Using v.any() for pagination result which includes extra fields
});

export const getById = query({
  args: { id: v.id("gestures") },
  handler: async (ctx, args) => {
    const gesture = await ctx.db.get(args.id);
    return gesture?.isActive ? gesture : null;
  },
  returns: v.union(
    v.object({
      _creationTime: v.number(),
      _id: v.id("gestures"),
      categoryIds: v.array(v.id("categories")),
      concept: v.array(v.string()),
      info: v.string(),
      isActive: v.boolean(),
      lastUpdated: v.number(),
      name: v.string(),
      playbackId: v.string(),
    }),
    v.null()
  ),
});

export const getByIds = query({
  args: { ids: v.array(v.id("gestures")) },
  handler: async (ctx, args) => {
    if (args.ids.length > 200) {
      throw new Error("Too many gesture IDs");
    }
    const gestures = await Promise.all(args.ids.map((id) => ctx.db.get(id)));

    return gestures
      .filter((gesture) => gesture?.isActive)
      .map((gesture) => gesture!);
  },
  returns: v.array(
    v.object({
      _creationTime: v.number(),
      _id: v.id("gestures"),
      categoryIds: v.array(v.id("categories")),
      concept: v.array(v.string()),
      info: v.string(),
      isActive: v.boolean(),
      lastUpdated: v.number(),
      name: v.string(),
      playbackId: v.string(),
    })
  ),
});

export const listForNative = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 200, 1), 500);
    const gestures = await ctx.db
      .query("gestures")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .order("desc")
      .take(limit);

    return await Promise.all(
      gestures.map((gesture) => toNativeGesture(ctx, gesture))
    );
  },
  returns: v.array(nativeGestureValidator),
});

export const getByIdForNative = query({
  args: { id: v.id("gestures") },
  handler: async (ctx, args) => {
    const gesture = await ctx.db.get(args.id);
    if (!gesture?.isActive) {
      return null;
    }

    return await toNativeGesture(ctx, gesture);
  },
  returns: v.union(nativeGestureValidator, v.null()),
});

export const getByIdsForNative = query({
  args: { ids: v.array(v.id("gestures")) },
  handler: async (ctx, args) => {
    if (args.ids.length > 200) {
      throw new Error("Too many gesture IDs");
    }
    const gestures = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
    return await Promise.all(
      gestures
        .filter((gesture) => gesture?.isActive)
        .map((gesture) => toNativeGesture(ctx, gesture!))
    );
  },
  returns: v.array(nativeGestureValidator),
});

export const searchForNative = query({
  args: {
    categories: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
    searchText: v.string(),
  },
  handler: async (ctx, args) => {
    const queryText = normalizeSearchText(args.searchText);
    const selectedCategories = args.categories ?? [];
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);

    const gestures = await ctx.db
      .query("gestures")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .take(2000);

    const results = await Promise.all(
      gestures.map(async (gesture) => {
        const categories = await getCategoryNames(ctx, gesture.categoryIds);
        return { categories, gesture };
      })
    );

    return await Promise.all(
      results
        .filter(({ gesture, categories }) => {
          const categoryMatch =
            selectedCategories.length === 0 ||
            categories.some((category) =>
              selectedCategories.includes(category)
            );
          return categoryMatch && matchesSearch(gesture, categories, queryText);
        })
        .sort(
          (a, b) =>
            scoreSearchResult(b.gesture, b.categories, queryText) -
              scoreSearchResult(a.gesture, a.categories, queryText) ||
            a.gesture.name.localeCompare(b.gesture.name)
        )
        .slice(0, limit)
        .map(({ gesture }) => toNativeGesture(ctx, gesture))
    );
  },
  returns: v.array(nativeGestureValidator),
});

export const relatedForNative = query({
  args: {
    gestureId: v.id("gestures"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const gesture = await ctx.db.get(args.gestureId);
    if (!gesture?.isActive || gesture.categoryIds.length === 0) {
      return [];
    }

    const categoryIds = new Set(gesture.categoryIds);
    const limit = Math.min(Math.max(args.limit ?? 5, 1), 20);
    const gestures = await ctx.db
      .query("gestures")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .take(2000);

    const related = gestures
      .filter(
        (candidate) =>
          candidate._id !== args.gestureId &&
          candidate.categoryIds.some((categoryId) =>
            categoryIds.has(categoryId)
          )
      )
      .slice(0, limit);

    return await Promise.all(
      related.map((candidate) => toNativeGesture(ctx, candidate))
    );
  },
  returns: v.array(nativeGestureValidator),
});

export const search = query({
  args: {
    limit: v.optional(v.number()),
    searchText: v.string(),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit || 50, 1), 100);

    return await ctx.db
      .query("gestures")
      .withSearchIndex("search_content", (q) =>
        q.search("name", args.searchText).eq("isActive", true)
      )
      .take(limit);
  },
  returns: v.array(
    v.object({
      _creationTime: v.number(),
      _id: v.id("gestures"),
      categoryIds: v.array(v.id("categories")),
      concept: v.array(v.string()),
      info: v.string(),
      isActive: v.boolean(),
      lastUpdated: v.number(),
      name: v.string(),
      playbackId: v.string(),
    })
  ),
});

export const getLastUpdated = query({
  args: {},
  handler: async (ctx) => {
    const latestGesture = await ctx.db
      .query("gestures")
      .withIndex("by_last_updated")
      .order("desc")
      .first();

    return latestGesture?.lastUpdated || null;
  },
  returns: v.union(v.number(), v.null()),
});

// Admin queries and mutations

// List all gestures (including inactive ones) - for admin dashboard
// Note: Admin authentication is handled at the oRPC layer (adminProcedure)
// This function is only called from the server which has already verified admin status
export const listAllForAdmin = query({
  args: {
    limit: v.optional(v.number()),
    serviceToken: v.string(),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "gestures.listAllForAdmin");
    const limit = Math.min(Math.max(args.limit || 1000, 1), 2000);
    // Always return ALL gestures (both active and inactive) for admin
    return await ctx.db.query("gestures").order("desc").take(limit);
  },
  returns: v.array(
    v.object({
      _creationTime: v.number(),
      _id: v.id("gestures"),
      categoryIds: v.array(v.id("categories")),
      concept: v.array(v.string()),
      info: v.string(),
      isActive: v.boolean(),
      lastUpdated: v.number(),
      name: v.string(),
      playbackId: v.string(),
    })
  ),
});

// List gestures with optional inactive filter (legacy, kept for compatibility)
export const listAll = query({
  args: {
    includeInactive: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    serviceToken: v.string(),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "gestures.listAll");
    const limit = Math.min(Math.max(args.limit || 1000, 1), 2000);

    if (args.includeInactive === true) {
      // Return all gestures including hidden ones
      return await ctx.db.query("gestures").order("desc").take(limit);
    }

    // Return only active/visible gestures
    return await ctx.db
      .query("gestures")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .order("desc")
      .take(limit);
  },
  returns: v.array(
    v.object({
      _creationTime: v.number(),
      _id: v.id("gestures"),
      categoryIds: v.array(v.id("categories")),
      concept: v.array(v.string()),
      info: v.string(),
      isActive: v.boolean(),
      lastUpdated: v.number(),
      name: v.string(),
      playbackId: v.string(),
    })
  ),
});

// Update gesture fields
// Note: Admin authentication is handled at the oRPC layer (adminProcedure)
export const updateGesture = mutation({
  args: {
    categoryIds: v.optional(v.array(v.id("categories"))),
    concept: v.optional(v.array(v.string())),
    gestureId: v.id("gestures"),
    info: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    name: v.optional(v.string()),
    playbackId: v.optional(v.string()),
    serviceToken: v.string(),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "gestures.updateGesture");
    const { gestureId, serviceToken: _serviceToken, ...updates } = args;

    if (Object.keys(updates).length === 0) {
      throw new Error("No fields to update");
    }

    await ctx.db.patch(gestureId, {
      ...updates,
      lastUpdated: Date.now(),
    });

    return null;
  },
  returns: v.null(),
});

// Bulk update gestures
// Note: Admin authentication is handled at the oRPC layer (adminProcedure)
export const bulkUpdate = mutation({
  args: {
    gestureIds: v.array(v.id("gestures")),
    serviceToken: v.string(),
    updates: v.object({
      categoryIds: v.optional(v.array(v.id("categories"))),
      isActive: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "gestures.bulkUpdate");
    if (Object.keys(args.updates).length === 0) {
      throw new Error("No fields to update");
    }

    const now = Date.now();

    await Promise.all(
      args.gestureIds.map((id) =>
        ctx.db.patch(id, {
          ...args.updates,
          lastUpdated: now,
        })
      )
    );

    return { updated: args.gestureIds.length };
  },
  returns: v.object({
    updated: v.number(),
  }),
});

// Toggle active status
// Note: Admin authentication is handled at the oRPC layer (adminProcedure)
export const toggleActive = mutation({
  args: {
    gestureId: v.id("gestures"),
    serviceToken: v.string(),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "gestures.toggleActive");
    const gesture = await ctx.db.get(args.gestureId);
    if (!gesture) {
      throw new Error("Gesture not found");
    }

    const newStatus = !gesture.isActive;

    await ctx.db.patch(args.gestureId, {
      isActive: newStatus,
      lastUpdated: Date.now(),
    });

    return newStatus;
  },
  returns: v.boolean(),
});

// Update playback ID
// Note: Admin authentication is handled at the oRPC layer (adminProcedure)
export const updatePlaybackId = mutation({
  args: {
    gestureId: v.id("gestures"),
    playbackId: v.string(),
    serviceToken: v.string(),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "gestures.updatePlaybackId");
    await ctx.db.patch(args.gestureId, {
      lastUpdated: Date.now(),
      playbackId: args.playbackId,
    });

    return null;
  },
  returns: v.null(),
});

// Create new gesture
// Note: Admin authentication is handled at the oRPC layer (adminProcedure)
export const create = mutation({
  args: {
    categoryIds: v.array(v.id("categories")),
    concept: v.array(v.string()),
    info: v.string(),
    isActive: v.optional(v.boolean()),
    name: v.string(),
    playbackId: v.string(),
    serviceToken: v.string(),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "gestures.create");
    const now = Date.now();

    return await ctx.db.insert("gestures", {
      categoryIds: args.categoryIds,
      concept: args.concept,
      info: args.info,
      isActive: args.isActive ?? true,
      lastUpdated: now,
      name: args.name,
      playbackId: args.playbackId,
    });
  },
  returns: v.id("gestures"),
});
