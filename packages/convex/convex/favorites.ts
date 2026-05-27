import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  addDefaultFavoriteGesture,
  getDefaultFavoriteGestureIdsForUser,
  getDefaultFavoriteGesturesForUser,
  isDefaultFavoriteGesture,
  removeDefaultFavoriteGesture,
  toggleDefaultFavoriteGesture,
  toNativeGesture,
} from "./lists";

const nativeGestureValidator = v.object({
  id: v.id("gestures"),
  name: v.string(),
  category: v.array(v.string()),
  playbackId: v.string(),
  concept: v.array(v.string()),
  info: v.string(),
});

export const getUserFavorites = query({
  args: { userId: v.id("users") },
  returns: v.array(v.id("gestures")),
  handler: async (ctx, args) =>
    await getDefaultFavoriteGestureIdsForUser(ctx, args.userId),
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
  handler: async (ctx, args) =>
    await getDefaultFavoriteGesturesForUser(ctx, args.userId),
});

export const getUserFavoriteGesturesForNative = query({
  args: { userId: v.id("users") },
  returns: v.array(nativeGestureValidator),
  handler: async (ctx, args) => {
    const gestures = await getDefaultFavoriteGesturesForUser(ctx, args.userId);
    return await Promise.all(
      gestures.map((gesture) => toNativeGesture(ctx as QueryCtx, gesture))
    );
  },
});

export const toggleUserFavorite = mutation({
  args: {
    userId: v.id("users"),
    gestureId: v.id("gestures"),
  },
  returns: v.boolean(), // true if added, false if removed
  handler: async (ctx, args) =>
    await toggleDefaultFavoriteGesture(ctx, args.userId, args.gestureId),
});

export const addUserFavorite = mutation({
  args: {
    userId: v.id("users"),
    gestureId: v.id("gestures"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await addDefaultFavoriteGesture(ctx, args.userId, args.gestureId);
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
    await removeDefaultFavoriteGesture(ctx, args.userId, args.gestureId);
    return null;
  },
});

export const isFavorite = query({
  args: {
    userId: v.id("users"),
    gestureId: v.id("gestures"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) =>
    await isDefaultFavoriteGesture(ctx, args.userId, args.gestureId),
});
