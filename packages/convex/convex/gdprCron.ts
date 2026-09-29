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
      // biome-ignore lint/performance/noAwaitInLoops: clean up one guest account at a time to keep the transaction's work bounded and ordered
      const favorites = await ctx.db
        .query("user_favorites")
        .withIndex("by_user", (q) => q.eq("userId", guest._id))
        .collect();

      await Promise.all(favorites.map((fav) => ctx.db.delete(fav._id)));

      const consents = await ctx.db
        .query("user_consents")
        .withIndex("by_user", (q) => q.eq("userId", guest._id))
        .collect();

      await Promise.all(consents.map((consent) => ctx.db.delete(consent._id)));

      // Delete owned lists and their items
      const lists = await ctx.db
        .query("gesture_lists")
        .withIndex("by_owner", (q) => q.eq("ownerId", guest._id))
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

    await Promise.all(oldLogs.map((log) => ctx.db.delete(log._id)));

    console.log(`Cleaned up ${oldLogs.length} old admin logs`);
    return { deletedCount: oldLogs.length };
  },
});
