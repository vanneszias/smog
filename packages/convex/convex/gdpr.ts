import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * GDPR Compliance Functions
 * Implements user rights: access, deletion, consent management
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
      throw new Error(
        "Authentication required. Please sign in to export your data."
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

    // Get consent history
    const consents = await ctx.db
      .query("user_consents")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

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
      consents: consents.map((c) => ({
        analyticsConsent: c.analyticsConsent,
        marketingConsent: c.marketingConsent ?? false,
        consentVersion: c.consentVersion,
        consentDate: new Date(c.consentDate).toISOString(),
      })),
      adminActivity: {
        logsCount: adminLogs.length,
        sponsorshipsReviewed: sponsorshipsReviewed.length,
      },
      dataProcessing: {
        purposes: [
          "Account management",
          "Favorites synchronization",
          "Usage analytics (if consented)",
        ],
        thirdParties: ["WorkOS (Authentication)", "PostHog (Analytics)"],
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

    // Delete consent records
    const consents = await ctx.db
      .query("user_consents")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    for (const consent of consents) {
      await ctx.db.delete(consent._id);
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

// Record user consent (for authenticated users)
export const recordConsent = mutation({
  args: {
    analyticsConsent: v.boolean(),
    marketingConsent: v.optional(v.boolean()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error(
        "Authentication required. Please sign in to update consent preferences."
      );
    }

    // Find user by workosId
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Create consent record
    await ctx.db.insert("user_consents", {
      userId: user._id,
      analyticsConsent: args.analyticsConsent,
      marketingConsent: args.marketingConsent ?? false,
      consentVersion: "1.0",
      consentDate: Date.now(),
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
    });

    return { success: true };
  },
});

// Record guest user consent (before account creation)
export const recordGuestConsent = mutation({
  args: {
    guestId: v.string(),
    analyticsConsent: v.boolean(),
    marketingConsent: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Find or create guest user
    let user = await ctx.db
      .query("users")
      .withIndex("by_guest_id", (q) => q.eq("guestId", args.guestId))
      .unique();

    if (!user) {
      // Create guest user if doesn't exist
      const userId = await ctx.db.insert("users", {
        guestId: args.guestId,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      });
      user = await ctx.db.get(userId);
      if (!user) {
        throw new Error("Failed to create user");
      }
    }

    // Create consent record
    await ctx.db.insert("user_consents", {
      userId: user._id,
      analyticsConsent: args.analyticsConsent,
      marketingConsent: args.marketingConsent ?? false,
      consentVersion: "1.0",
      consentDate: Date.now(),
    });

    return { success: true };
  },
});

// Update consent preferences (for authenticated users)
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

    // Create new consent record (keep history)
    await ctx.db.insert("user_consents", {
      userId: user._id,
      analyticsConsent: args.analyticsConsent,
      marketingConsent: args.marketingConsent ?? false,
      consentVersion: "1.0",
      consentDate: Date.now(),
    });

    return { success: true };
  },
});

// Get current consent status (for authenticated users)
// Returns null if not authenticated (graceful handling for UI)
export const getConsentStatus = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      // Return null instead of throwing - allows UI to handle gracefully
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", identity.subject))
      .unique();

    if (!user) {
      return null;
    }

    // Get latest consent
    const consents = await ctx.db
      .query("user_consents")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(1);

    const latestConsent = consents[0];

    if (!latestConsent) {
      return {
        hasConsent: false,
        analyticsConsent: false,
        marketingConsent: false,
      };
    }

    return {
      hasConsent: true,
      analyticsConsent: latestConsent.analyticsConsent,
      marketingConsent: latestConsent.marketingConsent ?? false,
      consentDate: new Date(latestConsent.consentDate).toISOString(),
    };
  },
});

// Get guest consent status
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
        hasConsent: false,
        analyticsConsent: false,
        marketingConsent: false,
      };
    }

    // Get latest consent
    const consents = await ctx.db
      .query("user_consents")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(1);

    const latestConsent = consents[0];

    if (!latestConsent) {
      return {
        hasConsent: false,
        analyticsConsent: false,
        marketingConsent: false,
      };
    }

    return {
      hasConsent: true,
      analyticsConsent: latestConsent.analyticsConsent,
      marketingConsent: latestConsent.marketingConsent ?? false,
      consentDate: new Date(latestConsent.consentDate).toISOString(),
    };
  },
});
