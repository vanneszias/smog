import { v } from "convex/values";
import { mutation } from "./_generated/server";

/**
 * Admin mutations for bulk operations
 * Used by upload scripts and admin tools
 */

// Create a new category
export const createCategory = mutation({
  args: {
    name: v.string(),
    isActive: v.optional(v.boolean()),
  },
  returns: v.id("categories"),
  handler: async (ctx, args) => {
    // Check if category already exists
    const existing = await ctx.db
      .query("categories")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("categories", {
      name: args.name,
      isActive: args.isActive ?? true,
    });
  },
});

// Bulk create categories
export const createCategories = mutation({
  args: {
    categories: v.array(
      v.object({
        name: v.string(),
        isActive: v.optional(v.boolean()),
      })
    ),
  },
  returns: v.array(
    v.object({
      name: v.string(),
      id: v.id("categories"),
    })
  ),
  handler: async (ctx, args) => {
    const results: { name: string; id: string }[] = [];

    for (const category of args.categories) {
      // Check if category already exists
      const existing = await ctx.db
        .query("categories")
        .withIndex("by_name", (q) => q.eq("name", category.name))
        .first();

      if (existing) {
        results.push({ name: category.name, id: existing._id });
      } else {
        const id = await ctx.db.insert("categories", {
          name: category.name,
          isActive: category.isActive ?? true,
        });
        results.push({ name: category.name, id });
      }
    }

    return results;
  },
});

// Bulk create gestures (for upload script)
export const createGestures = mutation({
  args: {
    gestures: v.array(
      v.object({
        name: v.string(),
        categoryIds: v.array(v.id("categories")),
        playbackId: v.string(),
        concept: v.array(v.string()),
        info: v.string(),
        isActive: v.optional(v.boolean()),
      })
    ),
  },
  returns: v.array(v.id("gestures")),
  handler: async (ctx, args) => {
    const now = Date.now();
    const ids: string[] = [];

    for (const gesture of args.gestures) {
      const id = await ctx.db.insert("gestures", {
        name: gesture.name,
        categoryIds: gesture.categoryIds,
        playbackId: gesture.playbackId,
        concept: gesture.concept,
        info: gesture.info,
        isActive: gesture.isActive ?? true,
        lastUpdated: now,
      });
      ids.push(id);
    }

    return ids;
  },
});
