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

      // Delete owned lists and their items
      const lists = await ctx.db
        .query("gesture_lists")
        .withIndex("by_owner", (q) => q.eq("ownerId", guest._id))
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
