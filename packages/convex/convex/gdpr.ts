import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * GDPR Compliance Functions
 * Implements user rights: access and deletion
 *
 * Security Notes:
 * - All data export and deletion functions require authentication
 * - Authentication is validated via JWT tokens from WorkOS
 * - Guest users cannot export or delete data (their data is auto-removed after 12 months)
 * - The client must use <Authenticated> wrappers to ensure proper auth state
 */

// GDPR Article 15: Right of Access - Export user data
export const exportUserData = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      // Return null instead of throwing - allows UI to handle gracefully
      return null;
    }

    // Find user by workosId (identity.subject contains the WorkOS user ID)
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", identity.subject))
      .unique();

    if (!user) {
      return null;
    }

    // Gather all user data
    const favorites = await ctx.db
      .query("user_favorites")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Get gesture details for favorites
    const favoritesWithDetails = await Promise.all(
      favorites.map(async (fav) => {
        const gesture = await ctx.db.get(fav.gestureId);
        return {
          gestureId: fav.gestureId,
          gestureName: gesture?.name ?? "Unknown",
          addedAt: new Date(fav.createdAt).toISOString(),
        };
      })
    );

    const lists = await ctx.db
      .query("gesture_lists")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();

    const listsWithDetails = await Promise.all(
      lists.map(async (list) => {
        const items = await ctx.db
          .query("gesture_list_items")
          .withIndex("by_list_position", (q) => q.eq("listId", list._id))
          .collect();

        const gestures = await Promise.all(
          items.map(async (item) => {
            const gesture = await ctx.db.get(item.gestureId);
            return {
              gestureId: item.gestureId,
              gestureName: gesture?.name ?? "Unknown",
              position: item.position,
              addedAt: new Date(item.createdAt).toISOString(),
            };
          })
        );

        return {
          listId: list._id,
          name: list.name,
          description: list.description ?? null,
          visibility: list.visibility,
          allowSharedEditing: list.allowSharedEditing,
          isDefaultFavorites: list.isDefaultFavorites,
          createdAt: new Date(list.createdAt).toISOString(),
          updatedAt: new Date(list.updatedAt).toISOString(),
          gestures,
        };
      })
    );

    // Get admin logs related to user (where they are the target)
    const adminLogs = await ctx.db
      .query("adminLogs")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "user").eq("targetId", user._id)
      )
      .collect();

    // Get sponsorships reviewed by user (if admin)
    const sponsorshipsReviewed =
      user.role === "admin"
        ? await ctx.db
            .query("sponsorships")
            .filter((q) => q.eq(q.field("reviewedBy"), user._id))
            .collect()
        : [];

    return {
      exportDate: new Date().toISOString(),
      exportVersion: "1.0",
      userData: {
        userId: user._id,
        workosId: user.workosId ?? null,
        guestId: user.guestId ?? null,
        role: user.role ?? "user",
        accountCreated: new Date(user.createdAt).toISOString(),
        lastActive: new Date(user.lastActiveAt).toISOString(),
      },
      favorites: favoritesWithDetails,
      lists: listsWithDetails,
      adminActivity: {
        logsCount: adminLogs.length,
        sponsorshipsReviewed: sponsorshipsReviewed.length,
      },
      dataProcessing: {
        purposes: [
          "Account management",
          "Gesture list and favorites synchronization",
        ],
        thirdParties: ["WorkOS (Authentication)"],
        dataRetention: "Account data retained until deletion request",
      },
    };
  },
});

// GDPR Article 17: Right to Erasure - Delete user account
export const deleteUserAccount = mutation({
  args: {
    confirmDelete: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (!args.confirmDelete) {
      throw new Error(
        "Deletion must be confirmed by setting confirmDelete to true"
      );
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error(
        "Authentication required. Please sign in to delete your account."
      );
    }

    // Find user by workosId (identity.subject contains the WorkOS user ID)
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Delete all favorites
    const favorites = await ctx.db
      .query("user_favorites")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    for (const fav of favorites) {
      await ctx.db.delete(fav._id);
    }

    // Delete owned lists and their items
    const lists = await ctx.db
      .query("gesture_lists")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();

    for (const list of lists) {
      const items = await ctx.db
        .query("gesture_list_items")
        .withIndex("by_list", (q) => q.eq("listId", list._id))
        .collect();

      for (const item of items) {
        await ctx.db.delete(item._id);
      }

      await ctx.db.delete(list._id);
    }

    // Anonymize admin logs (preserve audit trail but remove PII)
    const adminLogsAsUser = await ctx.db
      .query("adminLogs")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    for (const log of adminLogsAsUser) {
      // For audit trail, we keep the log but mark as deleted user
      // This is GDPR compliant as it's necessary for legal purposes
      await ctx.db.patch(log._id, {
        metadata: {
          ...log.metadata,
          userDeleted: true,
          deletionDate: Date.now(),
        },
      });
    }

    // Update sponsorships reviewed by user (if admin)
    if (user.role === "admin") {
      const sponsorships = await ctx.db
        .query("sponsorships")
        .filter((q) => q.eq(q.field("reviewedBy"), user._id))
        .collect();

      for (const sponsorship of sponsorships) {
        await ctx.db.patch(sponsorship._id, {
          reviewedBy: undefined,
        });
      }
    }

    // Delete the user account
    await ctx.db.delete(user._id);

    return {
      success: true,
      deletedAt: new Date().toISOString(),
      message: "Account and all associated data deleted successfully",
    };
  },
});
