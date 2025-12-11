import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  categories: defineTable({
    name: v.string(),
    isActive: v.boolean(),
  }).index("by_name", ["name"]),

  gestures: defineTable({
    name: v.string(),
    categoryIds: v.array(v.id("categories")),
    playbackId: v.string(),
    concept: v.array(v.string()),
    info: v.string(),
    isActive: v.boolean(),
    lastUpdated: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_category", ["categoryIds"])
    .index("by_active", ["isActive"])
    .index("by_last_updated", ["lastUpdated"])
    .searchIndex("search_content", {
      searchField: "name",
      filterFields: ["categoryIds", "isActive"],
    }),

  users: defineTable({
    workosId: v.optional(v.string()),
    guestId: v.optional(v.string()),
    createdAt: v.number(),
    lastActiveAt: v.number(),
  })
    .index("by_workos_id", ["workosId"])
    .index("by_guest_id", ["guestId"]),

  user_favorites: defineTable({
    userId: v.id("users"),
    gestureId: v.id("gestures"),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_gesture", ["gestureId"])
    .index("by_user_gesture", ["userId", "gestureId"]),
});
