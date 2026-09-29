import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  adminLogs: defineTable({
    action: v.string(),
    createdAt: v.number(),
    metadata: v.optional(v.any()),
    targetId: v.string(),
    targetType: v.string(),
    userId: v.id("users"),
  })
    .index("by_user", ["userId"])
    .index("by_action", ["action"])
    .index("by_target", ["targetType", "targetId"])
    .index("by_created_at", ["createdAt"]),
  categories: defineTable({
    isActive: v.boolean(),
    name: v.string(),
  })
    .index("by_name", ["name"])
    .index("by_active", ["isActive"]),

  gesture_list_items: defineTable({
    addedBy: v.optional(v.id("users")),
    createdAt: v.number(),
    gestureId: v.id("gestures"),
    listId: v.id("gesture_lists"),
    position: v.number(),
  })
    .index("by_list", ["listId"])
    .index("by_gesture", ["gestureId"])
    .index("by_list_gesture", ["listId", "gestureId"])
    .index("by_list_position", ["listId", "position"]),

  gesture_lists: defineTable({
    allowSharedEditing: v.boolean(),
    createdAt: v.number(),
    description: v.optional(v.string()),
    editShareToken: v.optional(v.string()),
    isDefaultFavorites: v.boolean(),
    name: v.string(),
    ownerId: v.id("users"),
    updatedAt: v.number(),
    viewShareToken: v.optional(v.string()),
    visibility: v.union(v.literal("private"), v.literal("shared")),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_created_at", ["ownerId", "createdAt"])
    .index("by_owner_default", ["ownerId", "isDefaultFavorites"])
    .index("by_view_share_token", ["viewShareToken"])
    .index("by_edit_share_token", ["editShareToken"]),

  gestures: defineTable({
    categoryIds: v.array(v.id("categories")),
    concept: v.array(v.string()),
    info: v.string(),
    isActive: v.boolean(),
    lastUpdated: v.number(),
    name: v.string(),
    playbackId: v.string(),
  })
    .index("by_name", ["name"])
    .index("by_category", ["categoryIds"])
    .index("by_active", ["isActive"])
    .index("by_last_updated", ["lastUpdated"])
    .searchIndex("search_content", {
      filterFields: ["categoryIds", "isActive"],
      searchField: "name",
    }),

  sponsorships: defineTable({
    contactCompany: v.optional(v.string()), // Company name (optional)
    contactFullName: v.string(), // Full name collected before payment
    createdAt: v.number(),
    durationYears: v.number(), // Always 1 in simplified flow
    endDate: v.number(),
    gestureId: v.id("gestures"),
    hasLogo: v.optional(v.boolean()), // Whether user paid for logo
    invoiceEmail: v.optional(v.string()),
    invoiceName: v.optional(v.string()),
    // Invoice fields: collected when sponsor requests a factuur
    invoiceRequested: v.optional(v.boolean()),
    invoiceVatNumber: v.optional(v.string()),
    molliePaymentId: v.optional(v.string()),
    originalVideoPlaybackId: v.string(),
    overlayImageStorageId: v.optional(v.string()), // Optional: only if logo is included
    overlayText: v.string(),
    paymentAmount: v.number(),
    previewVideoPlaybackId: v.optional(v.string()), // Preview video from wizard
    // Re-edit token: set by admin to let sponsor resubmit video without paying
    reEditToken: v.optional(v.string()),
    reEditTokenExpiresAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    // Renewal reminder tracking: set when a reminder email has been sent
    renewalReminderSentAt: v.optional(v.number()),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.id("users")),
    sponsorEmail: v.string(),
    sponsoredVideoPlaybackId: v.optional(v.string()),
    sponsorName: v.string(),
    startDate: v.number(),
    status: v.string(), // pending | pending_payment | pending_approval | pending_resubmission | active | expired | rejected | cancelled
    updatedAt: v.number(),
  })
    .index("by_gesture", ["gestureId"])
    .index("by_status", ["status"])
    .index("by_gesture_and_status", ["gestureId", "status"])
    .index("by_end_date", ["endDate"])
    .index("by_payment_id", ["molliePaymentId"])
    .index("by_re_edit_token", ["reEditToken"]),

  user_consents: defineTable({
    analyticsConsent: v.boolean(),
    consentDate: v.number(),
    consentVersion: v.string(),
    ipAddress: v.optional(v.string()),
    marketingConsent: v.optional(v.boolean()),
    userAgent: v.optional(v.string()),
    userId: v.id("users"),
  })
    .index("by_user", ["userId"])
    .index("by_consent_date", ["consentDate"]),

  user_favorites: defineTable({
    createdAt: v.number(),
    gestureId: v.id("gestures"),
    userId: v.id("users"),
  })
    .index("by_user", ["userId"])
    .index("by_gesture", ["gestureId"])
    .index("by_user_gesture", ["userId", "gestureId"]),

  users: defineTable({
    createdAt: v.number(),
    email: v.optional(v.string()),
    guestId: v.optional(v.string()),
    lastActiveAt: v.number(),
    role: v.optional(v.union(v.literal("user"), v.literal("admin"))),
    workosId: v.optional(v.string()),
  })
    .index("by_workos_id", ["workosId"])
    .index("by_guest_id", ["guestId"])
    .index("by_role", ["role"]),
});
