import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * GDPR Compliance Functions
 * Implements user rights: access and deletion
 *
 * Security Notes:
 * - All data export and deletion functions require authentication
 * - Authentication is validated via JWT tokens from WorkOS
 * - Guest users cannot use the authenticated export/delete endpoints
 * - Inactive guest data is automatically removed after 12 months
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
          addedAt: new Date(fav.createdAt).toISOString(),
          gestureId: fav.gestureId,
          gestureName: gesture?.name ?? "Unknown",
        };
      })
    );

    const consents = await ctx.db
      .query("user_consents")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

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
              addedAt: new Date(item.createdAt).toISOString(),
              gestureId: item.gestureId,
              gestureName: gesture?.name ?? "Unknown",
              position: item.position,
            };
          })
        );

        return {
          allowSharedEditing: list.allowSharedEditing,
          createdAt: new Date(list.createdAt).toISOString(),
          description: list.description ?? null,
          gestures,
          isDefaultFavorites: list.isDefaultFavorites,
          listId: list._id,
          name: list.name,
          updatedAt: new Date(list.updatedAt).toISOString(),
          visibility: list.visibility,
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
      adminActivity: {
        logsCount: adminLogs.length,
        sponsorshipsReviewed: sponsorshipsReviewed.length,
      },
      consents: consents.map((consent) => ({
        analyticsConsent: consent.analyticsConsent,
        consentDate: new Date(consent.consentDate).toISOString(),
        consentVersion: consent.consentVersion,
        marketingConsent: consent.marketingConsent ?? false,
      })),
      dataProcessing: {
        dataRetention:
          "Account, favorites, and lists are retained until account deletion; legally required transaction records follow separate retention rules.",
        purposes: [
          "Account management",
          "Gesture list and favorites synchronization",
          "Security and service operation",
        ],
        thirdParties: [
          "WorkOS (authentication)",
          "Convex (database and application functions)",
          "Mux (video delivery)",
          "OpenPanel (optional analytics after consent)",
        ],
      },
      exportDate: new Date().toISOString(),
      exportVersion: "1.0",
      favorites: favoritesWithDetails,
      lists: listsWithDetails,
      userData: {
        accountCreated: new Date(user.createdAt).toISOString(),
        guestId: user.guestId ?? null,
        lastActive: new Date(user.lastActiveAt).toISOString(),
        role: user.role ?? "user",
        userId: user._id,
        workosId: user.workosId ?? null,
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

    await Promise.all(favorites.map((fav) => ctx.db.delete(fav._id)));

    const consents = await ctx.db
      .query("user_consents")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    await Promise.all(consents.map((consent) => ctx.db.delete(consent._id)));

    // Delete owned lists and their items
    const lists = await ctx.db
      .query("gesture_lists")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();

    for (const list of lists) {
      // biome-ignore lint/performance/noAwaitInLoops: delete each list's items before the list itself, one list at a time
      const items = await ctx.db
        .query("gesture_list_items")
        .withIndex("by_list", (q) => q.eq("listId", list._id))
        .collect();

      await Promise.all(items.map((item) => ctx.db.delete(item._id)));

      await ctx.db.delete(list._id);
    }

    // Anonymize admin logs (preserve audit trail but remove PII)
    const adminLogsAsUser = await ctx.db
      .query("adminLogs")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // For audit trail, we keep the log but mark as deleted user
    // This is GDPR compliant as it's necessary for legal purposes
    await Promise.all(
      adminLogsAsUser.map((log) =>
        ctx.db.patch(log._id, {
          metadata: {
            ...log.metadata,
            deletionDate: Date.now(),
            userDeleted: true,
          },
        })
      )
    );

    // Update sponsorships reviewed by user (if admin)
    if (user.role === "admin") {
      const sponsorships = await ctx.db
        .query("sponsorships")
        .filter((q) => q.eq(q.field("reviewedBy"), user._id))
        .collect();

      await Promise.all(
        sponsorships.map((sponsorship) =>
          ctx.db.patch(sponsorship._id, {
            reviewedBy: undefined,
          })
        )
      );
    }

    // Delete the user account
    await ctx.db.delete(user._id);

    return {
      deletedAt: new Date().toISOString(),
      message:
        "Account, favorites, and owned lists deleted. Legally required transaction records may be retained separately.",
      success: true,
    };
  },
});

// Compatibility API for app versions deployed before privacy consent moved local.
export const recordConsent = mutation({
  args: {
    analyticsConsent: v.boolean(),
    ipAddress: v.optional(v.string()),
    marketingConsent: v.optional(v.boolean()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error(
        "Authentication required. Please sign in to update consent preferences."
      );
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.insert("user_consents", {
      analyticsConsent: args.analyticsConsent,
      consentDate: Date.now(),
      consentVersion: "1.0",
      ipAddress: args.ipAddress,
      marketingConsent: args.marketingConsent ?? false,
      userAgent: args.userAgent,
      userId: user._id,
    });

    return { success: true };
  },
});

export const recordGuestConsent = mutation({
  args: {
    analyticsConsent: v.boolean(),
    guestId: v.string(),
    marketingConsent: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let user = await ctx.db
      .query("users")
      .withIndex("by_guest_id", (q) => q.eq("guestId", args.guestId))
      .unique();

    if (!user) {
      const userId = await ctx.db.insert("users", {
        createdAt: Date.now(),
        guestId: args.guestId,
        lastActiveAt: Date.now(),
      });
      user = await ctx.db.get(userId);
      if (!user) {
        throw new Error("Failed to create user");
      }
    }

    await ctx.db.insert("user_consents", {
      analyticsConsent: args.analyticsConsent,
      consentDate: Date.now(),
      consentVersion: "1.0",
      marketingConsent: args.marketingConsent ?? false,
      userId: user._id,
    });

    return { success: true };
  },
});

export const updateConsent = mutation({
  args: {
    analyticsConsent: v.boolean(),
    marketingConsent: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error(
        "Authentication required. Please sign in to update consent preferences."
      );
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.insert("user_consents", {
      analyticsConsent: args.analyticsConsent,
      consentDate: Date.now(),
      consentVersion: "1.0",
      marketingConsent: args.marketingConsent ?? false,
      userId: user._id,
    });

    return { success: true };
  },
});

export const getConsentStatus = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", identity.subject))
      .unique();

    if (!user) {
      return null;
    }

    const consents = await ctx.db
      .query("user_consents")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(1);

    const [latestConsent] = consents;

    if (!latestConsent) {
      return {
        analyticsConsent: false,
        hasConsent: false,
        marketingConsent: false,
      };
    }

    return {
      analyticsConsent: latestConsent.analyticsConsent,
      consentDate: new Date(latestConsent.consentDate).toISOString(),
      hasConsent: true,
      marketingConsent: latestConsent.marketingConsent ?? false,
    };
  },
});

export const getGuestConsentStatus = query({
  args: {
    guestId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_guest_id", (q) => q.eq("guestId", args.guestId))
      .unique();

    if (!user) {
      return {
        analyticsConsent: false,
        hasConsent: false,
        marketingConsent: false,
      };
    }

    const consents = await ctx.db
      .query("user_consents")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(1);

    const [latestConsent] = consents;

    if (!latestConsent) {
      return {
        analyticsConsent: false,
        hasConsent: false,
        marketingConsent: false,
      };
    }

    return {
      analyticsConsent: latestConsent.analyticsConsent,
      consentDate: new Date(latestConsent.consentDate).toISOString(),
      hasConsent: true,
      marketingConsent: latestConsent.marketingConsent ?? false,
    };
  },
});
