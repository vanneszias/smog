import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";

export const createUser = mutation({
  args: {
    workosId: v.optional(v.string()),
    guestId: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const now = Date.now();

    const userId = await ctx.db.insert("users", {
      workosId: args.workosId,
      guestId: args.guestId,
      createdAt: now,
      lastActiveAt: now,
    });

    return userId;
  },
});

export const getUserByWorkOSId = query({
  args: { workosId: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      workosId: v.optional(v.string()),
      guestId: v.optional(v.string()),
      role: v.optional(v.union(v.literal("user"), v.literal("admin"))),
      createdAt: v.number(),
      lastActiveAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) =>
    await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", args.workosId))
      .unique(),
});

export const getUserByGuestId = query({
  args: { guestId: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      workosId: v.optional(v.string()),
      guestId: v.optional(v.string()),
      role: v.optional(v.union(v.literal("user"), v.literal("admin"))),
      createdAt: v.number(),
      lastActiveAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) =>
    await ctx.db
      .query("users")
      .withIndex("by_guest_id", (q) => q.eq("guestId", args.guestId))
      .unique(),
});

export const migrateGuestToUser = mutation({
  args: {
    guestId: v.string(),
    workosId: v.string(),
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
      // Update existing guest user with WorkOS ID
      await ctx.db.patch(guestUser._id, {
        workosId: args.workosId,
        lastActiveAt: now,
      });
      return guestUser._id;
    }
    // Create new user with WorkOS ID (guest had no favorites to migrate)
    return await ctx.db.insert("users", {
      workosId: args.workosId,
      guestId: args.guestId,
      createdAt: now,
      lastActiveAt: now,
    });
  },
});

export const updateLastActive = mutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      lastActiveAt: Date.now(),
    });
    return null;
  },
});

export const exchangeCodeForToken = action({
  args: {
    code: v.string(),
    redirectUri: v.string(),
  },
  returns: v.object({
    workosId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
  }),
  handler: async (_ctx, args) => {
    const clientId = process.env.WORKOS_CLIENT_ID;
    const clientSecret = process.env.WORKOS_CLIENT_SECRET;

    if (!(clientId && clientSecret)) {
      throw new Error("WorkOS credentials not configured");
    }

    // Exchange code for user information
    const response = await fetch(
      "https://api.workos.com/user_management/authenticate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code: args.code,
          grant_type: "authorization_code",
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to authenticate: ${error}`);
    }

    const data = (await response.json()) as {
      user: {
        id: string;
        email: string;
        first_name?: string;
        last_name?: string;
      };
    };

    return {
      workosId: data.user.id,
      email: data.user.email,
      firstName: data.user.first_name,
      lastName: data.user.last_name,
    };
  },
});

// Admin queries and mutations
export const listAllUsers = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    users: v.array(
      v.object({
        _id: v.id("users"),
        _creationTime: v.number(),
        workosId: v.optional(v.string()),
        guestId: v.optional(v.string()),
        role: v.optional(v.union(v.literal("user"), v.literal("admin"))),
        createdAt: v.number(),
        lastActiveAt: v.number(),
      })
    ),
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

export const listAdmins = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      workosId: v.optional(v.string()),
      guestId: v.optional(v.string()),
      role: v.optional(v.union(v.literal("user"), v.literal("admin"))),
      createdAt: v.number(),
      lastActiveAt: v.number(),
    })
  ),
  handler: async (ctx) =>
    await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .collect(),
});

export const updateUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("admin")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      role: args.role,
    });
    return null;
  },
});

export const getUserById = query({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      workosId: v.optional(v.string()),
      guestId: v.optional(v.string()),
      role: v.optional(v.union(v.literal("user"), v.literal("admin"))),
      createdAt: v.number(),
      lastActiveAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => await ctx.db.get(args.userId),
});
