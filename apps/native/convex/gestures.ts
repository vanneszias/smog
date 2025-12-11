import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";

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
