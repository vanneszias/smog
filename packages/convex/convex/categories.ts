import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireServiceAuth } from "./lib/serviceAuth";

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("categories"),
      _creationTime: v.number(),
      name: v.string(),
      isActive: v.boolean(),
    })
  ),
  handler: async (ctx) =>
    await ctx.db
      .query("categories")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect(),
});

export const getByName = query({
  args: { name: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("categories"),
      _creationTime: v.number(),
      name: v.string(),
      isActive: v.boolean(),
    }),
    v.null()
  ),
  handler: async (ctx, args) =>
    await ctx.db
      .query("categories")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .filter((q) => q.eq(q.field("isActive"), true))
      .unique(),
});

export const getByIds = query({
  args: { ids: v.array(v.id("categories")) },
  returns: v.array(
    v.object({
      _id: v.id("categories"),
      _creationTime: v.number(),
      name: v.string(),
      isActive: v.boolean(),
    })
  ),
  handler: async (ctx, args) => {
    if (args.ids.length > 200) {
      throw new Error("Too many category IDs");
    }
    const categories = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
    return categories
      .filter((category) => category?.isActive)
      .map((category) => category!);
  },
});

// Admin queries and mutations

// List all categories (including inactive ones) - for admin dashboard
// Note: Admin authentication is handled at the oRPC layer (adminProcedure)
export const listAllForAdmin = query({
  args: { serviceToken: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("categories"),
      _creationTime: v.number(),
      name: v.string(),
      isActive: v.boolean(),
    })
  ),
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "categories.listAllForAdmin");
    // Return ALL categories (both active and inactive) for admin
    return await ctx.db.query("categories").withIndex("by_name").collect();
  },
});

// Create new category
// Note: Admin authentication is handled at the oRPC layer (adminProcedure)
export const create = mutation({
  args: {
    name: v.string(),
    isActive: v.optional(v.boolean()),
    serviceToken: v.string(),
  },
  returns: v.id("categories"),
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "categories.create");
    // Check if category with same name already exists
    const existing = await ctx.db
      .query("categories")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();

    if (existing) {
      throw new Error("Category with this name already exists");
    }

    return await ctx.db.insert("categories", {
      name: args.name,
      isActive: args.isActive ?? true,
    });
  },
});

// Update category
// Note: Admin authentication is handled at the oRPC layer (adminProcedure)
export const update = mutation({
  args: {
    categoryId: v.id("categories"),
    name: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    serviceToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "categories.update");
    const { categoryId, serviceToken: _serviceToken, ...updates } = args;

    if (Object.keys(updates).length === 0) {
      throw new Error("No fields to update");
    }

    // If updating name, check for duplicates
    if (updates.name) {
      const existing = await ctx.db
        .query("categories")
        .withIndex("by_name", (q) => q.eq("name", updates.name!))
        .unique();

      if (existing && existing._id !== categoryId) {
        throw new Error("Category with this name already exists");
      }
    }

    await ctx.db.patch(categoryId, updates);
    return null;
  },
});

// Delete category (soft delete by setting isActive to false)
// Note: Admin authentication is handled at the oRPC layer (adminProcedure)
export const deleteCategory = mutation({
  args: {
    categoryId: v.id("categories"),
    serviceToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "categories.deleteCategory");
    await ctx.db.patch(args.categoryId, {
      isActive: false,
    });
    return null;
  },
});
