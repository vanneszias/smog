/**
 * User Management Functions
 *
 * Handles user CRUD operations in Convex. Users are created and synced
 * by the client apps after successful WorkOS authentication.
 */

import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { isValidServiceToken, requireServiceAuth } from "./lib/serviceAuth";
import { ensureDefaultFavoritesList } from "./lists";

// =============================================================================
// User Type (for return values)
// =============================================================================

const userReturnType = v.object({
  _creationTime: v.number(),
  _id: v.id("users"),
  createdAt: v.number(),
  email: v.optional(v.string()),
  guestId: v.optional(v.string()),
  lastActiveAt: v.number(),
  role: v.optional(v.union(v.literal("user"), v.literal("admin"))),
  workosId: v.optional(v.string()),
});

const guestUserReturnType = v.object({
  _id: v.id("users"),
  guestId: v.optional(v.string()),
});

async function requireMatchingIdentity(
  ctx: MutationCtx | QueryCtx,
  workosId: string
): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || identity.subject !== workosId) {
    throw new Error("Unauthorized");
  }
}

async function hasMatchingIdentity(
  ctx: MutationCtx | QueryCtx,
  workosId: string
): Promise<boolean> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject === workosId;
}

// =============================================================================
// User Queries
// =============================================================================

/**
 * Get user by their Convex ID
 */
export const getUserById = query({
  args: { serviceToken: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "getUserById");
    return await ctx.db.get(args.userId);
  },
  returns: v.union(userReturnType, v.null()),
});

/**
 * Get user by their WorkOS ID
 */
export const getUserByWorkOSId = query({
  args: {
    serviceToken: v.optional(v.string()),
    workosId: v.string(),
  },
  handler: async (ctx, args) => {
    if (
      !(
        isValidServiceToken(args.serviceToken) ||
        (await hasMatchingIdentity(ctx, args.workosId))
      )
    ) {
      return null;
    }
    return await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", args.workosId))
      .unique();
  },
  returns: v.union(userReturnType, v.null()),
});

/**
 * Get user by their guest ID
 */
export const getUserByGuestId = query({
  args: { guestId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_guest_id", (q) => q.eq("guestId", args.guestId))
      .unique();
    return user ? { _id: user._id, guestId: user.guestId } : null;
  },
  returns: v.union(guestUserReturnType, v.null()),
});

// =============================================================================
// User Mutations
// =============================================================================

/**
 * Create a new user (authenticated or guest)
 */
export const createUser = mutation({
  args: {
    email: v.optional(v.string()),
    guestId: v.optional(v.string()),
    serviceToken: v.optional(v.string()),
    workosId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (Boolean(args.workosId) === Boolean(args.guestId)) {
      throw new Error("Provide exactly one user identity");
    }
    if (args.workosId) {
      if (!isValidServiceToken(args.serviceToken)) {
        await requireMatchingIdentity(ctx, args.workosId);
      }
    } else if (!args.guestId || args.guestId.length < 32) {
      throw new Error("Invalid guest identity");
    }

    const existing = args.workosId
      ? await ctx.db
          .query("users")
          .withIndex("by_workos_id", (q) => q.eq("workosId", args.workosId))
          .unique()
      : await ctx.db
          .query("users")
          .withIndex("by_guest_id", (q) => q.eq("guestId", args.guestId))
          .unique();
    if (existing) {
      return existing._id;
    }

    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      createdAt: now,
      email: args.email,
      guestId: args.guestId,
      lastActiveAt: now,
      workosId: args.workosId,
    });
    await ensureDefaultFavoritesList(ctx, userId);
    return userId;
  },
  returns: v.id("users"),
});

/**
 * Migrate a guest user to an authenticated user
 * Links the guest's data to their WorkOS account
 */
export const migrateGuestToUser = mutation({
  args: {
    email: v.optional(v.string()),
    guestId: v.string(),
    workosId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireMatchingIdentity(ctx, args.workosId);

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
      await ensureDefaultFavoritesList(ctx, guestUser._id);
      return guestUser._id;
    }

    // No guest found - create new user with both IDs
    const userId = await ctx.db.insert("users", {
      createdAt: now,
      email: args.email,
      guestId: args.guestId,
      lastActiveAt: now,
      workosId: args.workosId,
    });
    await ensureDefaultFavoritesList(ctx, userId);
    return userId;
  },
  returns: v.id("users"),
});

/**
 * Update user's last active timestamp
 */
export const updateLastActive = mutation({
  args: { serviceToken: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "updateLastActive");
    await ctx.db.patch(args.userId, { lastActiveAt: Date.now() });
    return null;
  },
  returns: v.null(),
});

/**
 * Update user's role
 */
export const updateUserRole = mutation({
  args: {
    role: v.union(v.literal("user"), v.literal("admin")),
    serviceToken: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "updateUserRole");
    await ctx.db.patch(args.userId, { role: args.role });
    return null;
  },
  returns: v.null(),
});

// =============================================================================
// Admin Queries
// =============================================================================

/**
 * List all users (admin only)
 */
export const listAllUsers = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    serviceToken: v.string(),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "listAllUsers");
    const limit = Math.min(Math.max(args.limit || 50, 1), 500);
    const users = await ctx.db
      .query("users")
      .order("desc")
      .take(limit + 1);

    const hasMore = users.length > limit;
    const results = hasMore ? users.slice(0, limit) : users;

    return {
      hasMore,
      nextCursor: hasMore ? results.at(-1)?._id : undefined,
      users: results,
    };
  },
  returns: v.object({
    hasMore: v.boolean(),
    nextCursor: v.optional(v.string()),
    users: v.array(userReturnType),
  }),
});

/**
 * List all admin users
 */
export const listAdmins = query({
  args: { serviceToken: v.string() },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "listAdmins");
    return await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .collect();
  },
  returns: v.array(userReturnType),
});
