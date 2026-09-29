import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireServiceAuth } from "./lib/serviceAuth";

// Log an admin action
export const logAction = mutation({
  args: {
    action: v.string(),
    metadata: v.optional(v.any()),
    serviceToken: v.string(),
    targetId: v.string(),
    targetType: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "adminLogs.logAction");
    return await ctx.db.insert("adminLogs", {
      action: args.action,
      createdAt: Date.now(),
      metadata: args.metadata,
      targetId: args.targetId,
      targetType: args.targetType,
      userId: args.userId,
    });
  },
  returns: v.id("adminLogs"),
});

// Get logs for a specific user
export const getByUser = query({
  args: {
    limit: v.optional(v.number()),
    serviceToken: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "adminLogs.getByUser");
    const limit = args.limit || 100;
    return await ctx.db
      .query("adminLogs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);
  },
  returns: v.array(
    v.object({
      _creationTime: v.number(),
      _id: v.id("adminLogs"),
      action: v.string(),
      createdAt: v.number(),
      metadata: v.optional(v.any()),
      targetId: v.string(),
      targetType: v.string(),
      userId: v.id("users"),
    })
  ),
});

// Get recent logs across all users
export const getRecent = query({
  args: {
    limit: v.optional(v.number()),
    serviceToken: v.string(),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "adminLogs.getRecent");
    const limit = args.limit || 100;
    return await ctx.db
      .query("adminLogs")
      .withIndex("by_created_at")
      .order("desc")
      .take(limit);
  },
  returns: v.array(
    v.object({
      _creationTime: v.number(),
      _id: v.id("adminLogs"),
      action: v.string(),
      createdAt: v.number(),
      metadata: v.optional(v.any()),
      targetId: v.string(),
      targetType: v.string(),
      userId: v.id("users"),
    })
  ),
});

// Get logs for a specific target
export const getByTarget = query({
  args: {
    serviceToken: v.string(),
    targetId: v.string(),
    targetType: v.string(),
  },
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
  returns: v.array(
    v.object({
      _creationTime: v.number(),
      _id: v.id("adminLogs"),
      action: v.string(),
      createdAt: v.number(),
      metadata: v.optional(v.any()),
      targetId: v.string(),
      targetType: v.string(),
      userId: v.id("users"),
    })
  ),
});

// Get logs by action type
export const getByAction = query({
  args: {
    action: v.string(),
    limit: v.optional(v.number()),
    serviceToken: v.string(),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "adminLogs.getByAction");
    const limit = args.limit || 100;
    return await ctx.db
      .query("adminLogs")
      .withIndex("by_action", (q) => q.eq("action", args.action))
      .order("desc")
      .take(limit);
  },
  returns: v.array(
    v.object({
      _creationTime: v.number(),
      _id: v.id("adminLogs"),
      action: v.string(),
      createdAt: v.number(),
      metadata: v.optional(v.any()),
      targetId: v.string(),
      targetType: v.string(),
      userId: v.id("users"),
    })
  ),
});
