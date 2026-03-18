/**
 * User Management Functions
 *
 * Handles user CRUD operations in Convex. Users are created and synced
 * by the client apps after successful WorkOS authentication.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// =============================================================================
// User Type (for return values)
// =============================================================================

const userReturnType = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  workosId: v.optional(v.string()),
  guestId: v.optional(v.string()),
  email: v.optional(v.string()),
  role: v.optional(v.union(v.literal("user"), v.literal("admin"))),
  createdAt: v.number(),
  lastActiveAt: v.number(),
});

// =============================================================================
// User Queries
// =============================================================================

/**
 * Get user by their Convex ID
 */
export const getUserById = query({
  args: { userId: v.id("users") },
  returns: v.union(userReturnType, v.null()),
  handler: async (ctx, args) => await ctx.db.get(args.userId),
});

/**
 * Get user by their WorkOS ID
 */
export const getUserByWorkOSId = query({
  args: { workosId: v.string() },
  returns: v.union(userReturnType, v.null()),
  handler: async (ctx, args) =>
    await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", args.workosId))
      .unique(),
});

/**
 * Get user by their guest ID
 */
export const getUserByGuestId = query({
  args: { guestId: v.string() },
  returns: v.union(userReturnType, v.null()),
  handler: async (ctx, args) =>
    await ctx.db
      .query("users")
      .withIndex("by_guest_id", (q) => q.eq("guestId", args.guestId))
      .unique(),
});

// =============================================================================
// User Mutations
// =============================================================================

/**
 * Create a new user (authenticated or guest)
 */
export const createUser = mutation({
  args: {
    workosId: v.optional(v.string()),
    guestId: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("users", {
      workosId: args.workosId,
      guestId: args.guestId,
      email: args.email,
      createdAt: now,
      lastActiveAt: now,
    });
  },
});

/**
 * Migrate a guest user to an authenticated user
 * Links the guest's data to their WorkOS account
 */
export const migrateGuestToUser = mutation({
  args: {
    guestId: v.string(),
    workosId: v.string(),
    email: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const now = Date.now();

    // Find existing guest user
    const guestUser = await ctx.db
      .query("users")
      .withIndex("by_guest_id", (q) => q.eq("guestId", args.guestId))
      .unique();

    if (guestUser) {
      // Update existing guest with WorkOS ID and email
      await ctx.db.patch(guestUser._id, {
        workosId: args.workosId,
        ...(args.email !== undefined && { email: args.email }),
        lastActiveAt: now,
      });
      return guestUser._id;
    }

    // No guest found - create new user with both IDs
    return await ctx.db.insert("users", {
      workosId: args.workosId,
      guestId: args.guestId,
      email: args.email,
      createdAt: now,
      lastActiveAt: now,
    });
  },
});

/**
 * Update user's last active timestamp
 */
export const updateLastActive = mutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { lastActiveAt: Date.now() });
    return null;
  },
});

/**
 * Update user's role
 */
export const updateUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("admin")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { role: args.role });
    return null;
  },
});

// =============================================================================
// Admin Queries
// =============================================================================

/**
 * List all users (admin only)
 */
export const listAllUsers = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    users: v.array(userReturnType),
    hasMore: v.boolean(),
    nextCursor: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    const users = await ctx.db
      .query("users")
      .order("desc")
      .take(limit + 1);

    const hasMore = users.length > limit;
    const results = hasMore ? users.slice(0, limit) : users;

    return {
      users: results,
      hasMore,
      nextCursor: hasMore ? results.at(-1)?._id : undefined,
    };
  },
});

/**
 * List all admin users
 */
export const listAdmins = query({
  args: {},
  returns: v.array(userReturnType),
  handler: async (ctx) =>
    await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .collect(),
});
