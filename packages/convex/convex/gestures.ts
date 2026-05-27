import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

const nativeGestureValidator = v.object({
  id: v.id("gestures"),
  name: v.string(),
  category: v.array(v.string()),
  playbackId: v.string(),
  concept: v.array(v.string()),
  info: v.string(),
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
    id: gesture._id,
    name: gesture.name,
    category: await getCategoryNames(ctx, gesture.categoryIds),
    playbackId: gesture.playbackId,
    concept: gesture.concept,
    info: gesture.info,
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
  returns: v.any(), // Using v.any() for pagination result which includes extra fields
  handler: async (ctx, args) =>
    await ctx.db
      .query("gestures")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .order("desc")
      .paginate(args.paginationOpts),
});

export const getById = query({
  args: { id: v.id("gestures") },
  returns: v.union(
    v.object({
      _id: v.id("gestures"),
      _creationTime: v.number(),
      name: v.string(),
      categoryIds: v.array(v.id("categories")),
      playbackId: v.string(),
      concept: v.array(v.string()),
      info: v.string(),
      isActive: v.boolean(),
      lastUpdated: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const gesture = await ctx.db.get(args.id);
    return gesture?.isActive ? gesture : null;
  },
});

export const getByIds = query({
  args: { ids: v.array(v.id("gestures")) },
  returns: v.array(
    v.object({
      _id: v.id("gestures"),
      _creationTime: v.number(),
      name: v.string(),
      categoryIds: v.array(v.id("categories")),
      playbackId: v.string(),
      concept: v.array(v.string()),
      info: v.string(),
      isActive: v.boolean(),
      lastUpdated: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const gestures = await Promise.all(args.ids.map((id) => ctx.db.get(id)));

    return gestures
      .filter((gesture) => gesture?.isActive)
      .map((gesture) => gesture!);
  },
});

export const listForNative = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(nativeGestureValidator),
  handler: async (ctx, args) => {
    const gestures = await ctx.db
      .query("gestures")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .order("desc")
      .take(args.limit ?? 200);

    return await Promise.all(
      gestures.map((gesture) => toNativeGesture(ctx, gesture))
    );
  },
});

export const getByIdForNative = query({
  args: { id: v.id("gestures") },
  returns: v.union(nativeGestureValidator, v.null()),
  handler: async (ctx, args) => {
    const gesture = await ctx.db.get(args.id);
    if (!gesture?.isActive) {
      return null;
    }

    return await toNativeGesture(ctx, gesture);
  },
});

export const getByIdsForNative = query({
  args: { ids: v.array(v.id("gestures")) },
  returns: v.array(nativeGestureValidator),
  handler: async (ctx, args) => {
    const gestures = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
    return await Promise.all(
      gestures
        .filter((gesture) => gesture?.isActive)
        .map((gesture) => toNativeGesture(ctx, gesture!))
    );
  },
});

export const searchForNative = query({
  args: {
    searchText: v.string(),
    categories: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  returns: v.array(nativeGestureValidator),
  handler: async (ctx, args) => {
    const queryText = normalizeSearchText(args.searchText);
    const selectedCategories = args.categories ?? [];
    const limit = args.limit ?? 50;

    const gestures = await ctx.db
      .query("gestures")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    const results = await Promise.all(
      gestures.map(async (gesture) => {
        const categories = await getCategoryNames(ctx, gesture.categoryIds);
        return { gesture, categories };
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
});

export const relatedForNative = query({
  args: {
    gestureId: v.id("gestures"),
    limit: v.optional(v.number()),
  },
  returns: v.array(nativeGestureValidator),
  handler: async (ctx, args) => {
    const gesture = await ctx.db.get(args.gestureId);
    if (!gesture?.isActive || gesture.categoryIds.length === 0) {
      return [];
    }

    const categoryIds = new Set(gesture.categoryIds);
    const gestures = await ctx.db
      .query("gestures")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    const related = gestures
      .filter(
        (candidate) =>
          candidate._id !== args.gestureId &&
          candidate.categoryIds.some((categoryId) =>
            categoryIds.has(categoryId)
          )
      )
      .slice(0, args.limit ?? 5);

    return await Promise.all(
      related.map((candidate) => toNativeGesture(ctx, candidate))
    );
  },
});

export const search = query({
  args: {
    searchText: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("gestures"),
      _creationTime: v.number(),
      name: v.string(),
      categoryIds: v.array(v.id("categories")),
      playbackId: v.string(),
      concept: v.array(v.string()),
      info: v.string(),
      isActive: v.boolean(),
      lastUpdated: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const limit = args.limit || 50;

    return await ctx.db
      .query("gestures")
      .withSearchIndex("search_content", (q) =>
        q.search("name", args.searchText).eq("isActive", true)
      )
      .take(limit);
  },
});

export const getLastUpdated = query({
  args: {},
  returns: v.union(v.number(), v.null()),
  handler: async (ctx) => {
    const latestGesture = await ctx.db
      .query("gestures")
      .withIndex("by_last_updated")
      .order("desc")
      .first();

    return latestGesture?.lastUpdated || null;
  },
});

// Admin queries and mutations

// List all gestures (including inactive ones) - for admin dashboard
// Note: Admin authentication is handled at the oRPC layer (adminProcedure)
// This function is only called from the server which has already verified admin status
export const listAllForAdmin = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("gestures"),
      _creationTime: v.number(),
      name: v.string(),
      categoryIds: v.array(v.id("categories")),
      playbackId: v.string(),
      concept: v.array(v.string()),
      info: v.string(),
      isActive: v.boolean(),
      lastUpdated: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const limit = args.limit || 1000;
    // Always return ALL gestures (both active and inactive) for admin
    return await ctx.db.query("gestures").order("desc").take(limit);
  },
});

// List gestures with optional inactive filter (legacy, kept for compatibility)
export const listAll = query({
  args: {
    limit: v.optional(v.number()),
    includeInactive: v.optional(v.boolean()),
  },
  returns: v.array(
    v.object({
      _id: v.id("gestures"),
      _creationTime: v.number(),
      name: v.string(),
      categoryIds: v.array(v.id("categories")),
      playbackId: v.string(),
      concept: v.array(v.string()),
      info: v.string(),
      isActive: v.boolean(),
      lastUpdated: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const limit = args.limit || 1000;

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
});

// Update gesture fields
// Note: Admin authentication is handled at the oRPC layer (adminProcedure)
export const updateGesture = mutation({
  args: {
    gestureId: v.id("gestures"),
    name: v.optional(v.string()),
    categoryIds: v.optional(v.array(v.id("categories"))),
    playbackId: v.optional(v.string()),
    concept: v.optional(v.array(v.string())),
    info: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { gestureId, ...updates } = args;

    if (Object.keys(updates).length === 0) {
      throw new Error("No fields to update");
    }

    await ctx.db.patch(gestureId, {
      ...updates,
      lastUpdated: Date.now(),
    });

    return null;
  },
});

// Bulk update gestures
// Note: Admin authentication is handled at the oRPC layer (adminProcedure)
export const bulkUpdate = mutation({
  args: {
    gestureIds: v.array(v.id("gestures")),
    updates: v.object({
      isActive: v.optional(v.boolean()),
      categoryIds: v.optional(v.array(v.id("categories"))),
    }),
  },
  returns: v.object({
    updated: v.number(),
  }),
  handler: async (ctx, args) => {
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
});

// Toggle active status
// Note: Admin authentication is handled at the oRPC layer (adminProcedure)
export const toggleActive = mutation({
  args: {
    gestureId: v.id("gestures"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
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
});

// Update playback ID
// Note: Admin authentication is handled at the oRPC layer (adminProcedure)
export const updatePlaybackId = mutation({
  args: {
    gestureId: v.id("gestures"),
    playbackId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.gestureId, {
      playbackId: args.playbackId,
      lastUpdated: Date.now(),
    });

    return null;
  },
});

// Create new gesture
// Note: Admin authentication is handled at the oRPC layer (adminProcedure)
export const create = mutation({
  args: {
    name: v.string(),
    categoryIds: v.array(v.id("categories")),
    playbackId: v.string(),
    concept: v.array(v.string()),
    info: v.string(),
    isActive: v.optional(v.boolean()),
  },
  returns: v.id("gestures"),
  handler: async (ctx, args) => {
    const now = Date.now();

    return await ctx.db.insert("gestures", {
      name: args.name,
      categoryIds: args.categoryIds,
      playbackId: args.playbackId,
      concept: args.concept,
      info: args.info,
      isActive: args.isActive ?? true,
      lastUpdated: now,
    });
  },
});
