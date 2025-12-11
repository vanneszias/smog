import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getUserFavorites = query({
  args: { userId: v.id("users") },
  returns: v.array(v.id("gestures")),
  handler: async (ctx, args) => {
    const favorites = await ctx.db
      .query("user_favorites")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return favorites.map((favorite) => favorite.gestureId);
  },
});

export const getUserFavoriteGestures = query({
  args: { userId: v.id("users") },
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
    const favorites = await ctx.db
      .query("user_favorites")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const gestureIds = favorites.map((favorite) => favorite.gestureId);
    const gestures = await Promise.all(gestureIds.map((id) => ctx.db.get(id)));

    return gestures
      .filter((gesture) => gesture?.isActive)
      .map((gesture) => gesture!);
  },
});

export const toggleUserFavorite = mutation({
  args: {
    userId: v.id("users"),
    gestureId: v.id("gestures"),
  },
  returns: v.boolean(), // true if added, false if removed
  handler: async (ctx, args) => {
    // Check if favorite already exists
    const existingFavorite = await ctx.db
      .query("user_favorites")
      .withIndex("by_user_gesture", (q) =>
        q.eq("userId", args.userId).eq("gestureId", args.gestureId)
      )
      .unique();

    if (existingFavorite) {
      // Remove favorite
      await ctx.db.delete(existingFavorite._id);
      return false;
    }
    // Add favorite
    await ctx.db.insert("user_favorites", {
      userId: args.userId,
      gestureId: args.gestureId,
      createdAt: Date.now(),
    });
    return true;
  },
});

export const addUserFavorite = mutation({
  args: {
    userId: v.id("users"),
    gestureId: v.id("gestures"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Check if favorite already exists
    const existingFavorite = await ctx.db
      .query("user_favorites")
      .withIndex("by_user_gesture", (q) =>
        q.eq("userId", args.userId).eq("gestureId", args.gestureId)
      )
      .unique();

    if (!existingFavorite) {
      await ctx.db.insert("user_favorites", {
        userId: args.userId,
        gestureId: args.gestureId,
        createdAt: Date.now(),
      });
    }

    return null;
  },
});

export const removeUserFavorite = mutation({
  args: {
    userId: v.id("users"),
    gestureId: v.id("gestures"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existingFavorite = await ctx.db
      .query("user_favorites")
      .withIndex("by_user_gesture", (q) =>
        q.eq("userId", args.userId).eq("gestureId", args.gestureId)
      )
      .unique();

    if (existingFavorite) {
      await ctx.db.delete(existingFavorite._id);
    }

    return null;
  },
});

export const isFavorite = query({
  args: {
    userId: v.id("users"),
    gestureId: v.id("gestures"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const favorite = await ctx.db
      .query("user_favorites")
      .withIndex("by_user_gesture", (q) =>
        q.eq("userId", args.userId).eq("gestureId", args.gestureId)
      )
      .unique();

    return !!favorite;
  },
});
