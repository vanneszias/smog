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
  category: v.array(v.string()),
  concept: v.array(v.string()),
  id: v.id("gestures"),
  info: v.string(),
  name: v.string(),
  playbackId: v.string(),
});

export const getUserFavorites = query({
  args: { serviceToken: v.optional(v.string()), userId: v.id("users") },
  handler: async (ctx, args) =>
    await getDefaultFavoriteGestureIdsForUser(ctx, args.userId),
  returns: v.array(v.id("gestures")),
});

export const getUserFavoriteGestures = query({
  args: { serviceToken: v.optional(v.string()), userId: v.id("users") },
  handler: async (ctx, args) =>
    await getDefaultFavoriteGesturesForUser(ctx, args.userId),
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

export const getUserFavoriteGesturesForNative = query({
  args: { serviceToken: v.optional(v.string()), userId: v.id("users") },
  handler: async (ctx, args) => {
    const gestures = await getDefaultFavoriteGesturesForUser(ctx, args.userId);
    return await Promise.all(
      gestures.map((gesture) => toNativeGesture(ctx as QueryCtx, gesture))
    );
  },
  returns: v.array(nativeGestureValidator),
});

export const toggleUserFavorite = mutation({
  args: {
    gestureId: v.id("gestures"),
    serviceToken: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) =>
    await toggleDefaultFavoriteGesture(ctx, args.userId, args.gestureId),
  returns: v.boolean(), // true if added, false if removed
});

export const addUserFavorite = mutation({
  args: {
    gestureId: v.id("gestures"),
    serviceToken: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await addDefaultFavoriteGesture(ctx, args.userId, args.gestureId);
    return null;
  },
  returns: v.null(),
});

export const removeUserFavorite = mutation({
  args: {
    gestureId: v.id("gestures"),
    serviceToken: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await removeDefaultFavoriteGesture(ctx, args.userId, args.gestureId);
    return null;
  },
  returns: v.null(),
});

export const isFavorite = query({
  args: {
    gestureId: v.id("gestures"),
    serviceToken: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) =>
    await isDefaultFavoriteGesture(ctx, args.userId, args.gestureId),
  returns: v.boolean(),
});
