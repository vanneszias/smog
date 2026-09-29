import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireServiceAuth } from "./lib/serviceAuth";

export const list = query({
  args: {},
  handler: async (ctx) =>
    await ctx.db
      .query("categories")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect(),
  returns: v.array(
    v.object({
      _creationTime: v.number(),
      _id: v.id("categories"),
      isActive: v.boolean(),
      name: v.string(),
    })
  ),
});

export const getByName = query({
  args: { name: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("categories")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .filter((q) => q.eq(q.field("isActive"), true))
      .unique(),
  returns: v.union(
    v.object({
      _creationTime: v.number(),
      _id: v.id("categories"),
      isActive: v.boolean(),
      name: v.string(),
    }),
    v.null()
  ),
});

export const getByIds = query({
  args: { ids: v.array(v.id("categories")) },
  handler: async (ctx, args) => {
    if (args.ids.length > 200) {
      throw new Error("Too many category IDs");
    }
    const categories = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
    return categories
      .filter((category) => category?.isActive)
      .map((category) => category!);
  },
  returns: v.array(
    v.object({
      _creationTime: v.number(),
      _id: v.id("categories"),
      isActive: v.boolean(),
      name: v.string(),
    })
  ),
});

// Admin queries and mutations

// List all categories (including inactive ones) - for admin dashboard
// Note: Admin authentication is handled at the oRPC layer (adminProcedure)
export const listAllForAdmin = query({
  args: { serviceToken: v.string() },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "categories.listAllForAdmin");
    // Return ALL categories (both active and inactive) for admin
    return await ctx.db.query("categories").withIndex("by_name").collect();
  },
  returns: v.array(
    v.object({
      _creationTime: v.number(),
      _id: v.id("categories"),
      isActive: v.boolean(),
      name: v.string(),
    })
  ),
});

// Create new category
// Note: Admin authentication is handled at the oRPC layer (adminProcedure)
export const create = mutation({
  args: {
    isActive: v.optional(v.boolean()),
    name: v.string(),
    serviceToken: v.string(),
  },
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
      isActive: args.isActive ?? true,
      name: args.name,
    });
  },
  returns: v.id("categories"),
});

// Update category
// Note: Admin authentication is handled at the oRPC layer (adminProcedure)
export const update = mutation({
  args: {
    categoryId: v.id("categories"),
    isActive: v.optional(v.boolean()),
    name: v.optional(v.string()),
    serviceToken: v.string(),
  },
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
  returns: v.null(),
});

// Delete category (soft delete by setting isActive to false)
// Note: Admin authentication is handled at the oRPC layer (adminProcedure)
export const deleteCategory = mutation({
  args: {
    categoryId: v.id("categories"),
    serviceToken: v.string(),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "categories.deleteCategory");
    await ctx.db.patch(args.categoryId, {
      isActive: false,
    });
    return null;
  },
  returns: v.null(),
});
