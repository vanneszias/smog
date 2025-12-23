import { internalMutation } from "./_generated/server";

// Clean up inactive guest accounts (12+ months of inactivity)
export const cleanupInactiveGuests = internalMutation({
  args: {},
  handler: async (ctx) => {
    const twelveMonthsAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;

    // Find inactive guest users
    const inactiveGuests = await ctx.db
      .query("users")
      .filter((q) =>
        q.and(
          q.neq(q.field("guestId"), undefined),
          q.lt(q.field("lastActiveAt"), twelveMonthsAgo)
        )
      )
      .collect();

    let deletedCount = 0;

    for (const guest of inactiveGuests) {
      // Delete favorites
      const favorites = await ctx.db
        .query("user_favorites")
        .withIndex("by_user", (q) => q.eq("userId", guest._id))
        .collect();

      for (const fav of favorites) {
        await ctx.db.delete(fav._id);
      }

      // Delete consents
      const consents = await ctx.db
        .query("user_consents")
        .withIndex("by_user", (q) => q.eq("userId", guest._id))
        .collect();

      for (const consent of consents) {
        await ctx.db.delete(consent._id);
      }

      // Delete guest user
      await ctx.db.delete(guest._id);
      deletedCount++;
    }

    console.log(`Cleaned up ${deletedCount} inactive guest accounts`);
    return { deletedCount };
  },
});

// Clean up old admin logs (3+ years old)
export const cleanupOldAdminLogs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const threeYearsAgo = Date.now() - 3 * 365 * 24 * 60 * 60 * 1000;

    const oldLogs = await ctx.db
      .query("adminLogs")
      .withIndex("by_created_at", (q) => q.lt("createdAt", threeYearsAgo))
      .collect();

    for (const log of oldLogs) {
      await ctx.db.delete(log._id);
    }

    console.log(`Cleaned up ${oldLogs.length} old admin logs`);
    return { deletedCount: oldLogs.length };
  },
});
