import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  categories: defineTable({
    name: v.string(),
    isActive: v.boolean(),
  })
    .index("by_name", ["name"])
    .index("by_active", ["isActive"]),

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
    email: v.optional(v.string()),
    role: v.optional(v.union(v.literal("user"), v.literal("admin"))),
    createdAt: v.number(),
    lastActiveAt: v.number(),
  })
    .index("by_workos_id", ["workosId"])
    .index("by_guest_id", ["guestId"])
    .index("by_role", ["role"]),

  user_favorites: defineTable({
    userId: v.id("users"),
    gestureId: v.id("gestures"),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_gesture", ["gestureId"])
    .index("by_user_gesture", ["userId", "gestureId"]),

  gesture_lists: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    visibility: v.union(v.literal("private"), v.literal("shared")),
    viewShareToken: v.optional(v.string()),
    editShareToken: v.optional(v.string()),
    allowSharedEditing: v.boolean(),
    isDefaultFavorites: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_created_at", ["ownerId", "createdAt"])
    .index("by_owner_default", ["ownerId", "isDefaultFavorites"])
    .index("by_view_share_token", ["viewShareToken"])
    .index("by_edit_share_token", ["editShareToken"]),

  gesture_list_items: defineTable({
    listId: v.id("gesture_lists"),
    gestureId: v.id("gestures"),
    addedBy: v.optional(v.id("users")),
    position: v.number(),
    createdAt: v.number(),
  })
    .index("by_list", ["listId"])
    .index("by_gesture", ["gestureId"])
    .index("by_list_gesture", ["listId", "gestureId"])
    .index("by_list_position", ["listId", "position"]),

  sponsorships: defineTable({
    gestureId: v.id("gestures"),
    sponsorName: v.string(),
    sponsorEmail: v.string(),
    overlayImageStorageId: v.optional(v.string()), // Optional: only if logo is included
    overlayText: v.string(),
    sponsoredVideoPlaybackId: v.optional(v.string()),
    originalVideoPlaybackId: v.string(),
    previewVideoPlaybackId: v.optional(v.string()), // Preview video from wizard
    startDate: v.number(),
    endDate: v.number(),
    durationYears: v.number(), // Always 1 in simplified flow
    hasLogo: v.optional(v.boolean()), // Whether user paid for logo
    contactFullName: v.string(), // Full name collected before payment
    contactCompany: v.optional(v.string()), // Company name (optional)
    status: v.string(), // pending | pending_payment | pending_approval | pending_resubmission | active | expired | rejected | cancelled
    molliePaymentId: v.optional(v.string()),
    paymentAmount: v.number(),
    rejectionReason: v.optional(v.string()),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    // Re-edit token: set by admin to let sponsor resubmit video without paying
    reEditToken: v.optional(v.string()),
    reEditTokenExpiresAt: v.optional(v.number()),
    // Invoice fields: collected when sponsor requests a factuur
    invoiceRequested: v.optional(v.boolean()),
    invoiceName: v.optional(v.string()),
    invoiceVatNumber: v.optional(v.string()),
    invoiceEmail: v.optional(v.string()),
    // Renewal reminder tracking: set when a reminder email has been sent
    renewalReminderSentAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_gesture", ["gestureId"])
    .index("by_status", ["status"])
    .index("by_gesture_and_status", ["gestureId", "status"])
    .index("by_end_date", ["endDate"])
    .index("by_payment_id", ["molliePaymentId"])
    .index("by_re_edit_token", ["reEditToken"]),

  adminLogs: defineTable({
    userId: v.id("users"),
    action: v.string(),
    targetId: v.string(),
    targetType: v.string(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_action", ["action"])
    .index("by_target", ["targetType", "targetId"])
    .index("by_created_at", ["createdAt"]),

  user_consents: defineTable({
    userId: v.id("users"),
    analyticsConsent: v.boolean(),
    marketingConsent: v.optional(v.boolean()),
    consentVersion: v.string(),
    consentDate: v.number(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_consent_date", ["consentDate"]),
});
