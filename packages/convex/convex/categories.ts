import { v } from "convex/values";
import { query } from "./_generated/server";

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
      .withIndex("by_name")
      .filter((q) => q.eq(q.field("isActive"), true))
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
    const categories = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
    return categories
      .filter((category) => category?.isActive)
      .map((category) => category!);
  },
});
