import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireServiceAuth } from "./lib/serviceAuth";

// Log an admin action
export const logAction = mutation({
  args: {
    userId: v.id("users"),
    action: v.string(),
    targetId: v.string(),
    targetType: v.string(),
    metadata: v.optional(v.any()),
    serviceToken: v.string(),
  },
  returns: v.id("adminLogs"),
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "adminLogs.logAction");
    return await ctx.db.insert("adminLogs", {
      userId: args.userId,
      action: args.action,
      targetId: args.targetId,
      targetType: args.targetType,
      metadata: args.metadata,
      createdAt: Date.now(),
    });
  },
});

// Get logs for a specific user
export const getByUser = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
    serviceToken: v.string(),
  },
  returns: v.array(
    v.object({
      _id: v.id("adminLogs"),
      _creationTime: v.number(),
      userId: v.id("users"),
      action: v.string(),
      targetId: v.string(),
      targetType: v.string(),
      metadata: v.optional(v.any()),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "adminLogs.getByUser");
    const limit = args.limit || 100;
    return await ctx.db
      .query("adminLogs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);
  },
});

// Get recent logs across all users
export const getRecent = query({
  args: {
    limit: v.optional(v.number()),
    serviceToken: v.string(),
  },
  returns: v.array(
    v.object({
      _id: v.id("adminLogs"),
      _creationTime: v.number(),
      userId: v.id("users"),
      action: v.string(),
      targetId: v.string(),
      targetType: v.string(),
      metadata: v.optional(v.any()),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "adminLogs.getRecent");
    const limit = args.limit || 100;
    return await ctx.db
      .query("adminLogs")
      .withIndex("by_created_at")
      .order("desc")
      .take(limit);
  },
});

// Get logs for a specific target
export const getByTarget = query({
  args: {
    targetType: v.string(),
    targetId: v.string(),
    serviceToken: v.string(),
  },
  returns: v.array(
    v.object({
      _id: v.id("adminLogs"),
      _creationTime: v.number(),
      userId: v.id("users"),
      action: v.string(),
      targetId: v.string(),
      targetType: v.string(),
      metadata: v.optional(v.any()),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "adminLogs.getByTarget");
    return await ctx.db
      .query("adminLogs")
      .withIndex("by_target", (q) =>
        q.eq("targetType", args.targetType).eq("targetId", args.targetId)
      )
      .order("desc")
      .collect();
  },
});

// Get logs by action type
export const getByAction = query({
  args: {
    action: v.string(),
    limit: v.optional(v.number()),
    serviceToken: v.string(),
  },
  returns: v.array(
    v.object({
      _id: v.id("adminLogs"),
      _creationTime: v.number(),
      userId: v.id("users"),
      action: v.string(),
      targetId: v.string(),
      targetType: v.string(),
      metadata: v.optional(v.any()),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "adminLogs.getByAction");
    const limit = args.limit || 100;
    return await ctx.db
      .query("adminLogs")
      .withIndex("by_action", (q) => q.eq("action", args.action))
      .order("desc")
      .take(limit);
  },
});
