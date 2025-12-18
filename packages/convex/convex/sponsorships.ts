import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create a new sponsorship (called from web app after video composition)
export const create = mutation({
  args: {
    gestureId: v.id("gestures"),
    sponsorName: v.string(),
    sponsorEmail: v.string(),
    overlayImageStorageId: v.string(),
    overlayText: v.string(),
    sponsoredVideoPlaybackId: v.string(), // Mux playback ID
    durationWeeks: v.number(),
    paymentAmount: v.number(),
  },
  returns: v.id("sponsorships"),
  handler: async (ctx, args) => {
    // Get gesture to backup original playbackId
    const gesture = await ctx.db.get(args.gestureId);
    if (!gesture) {
      throw new Error("Gesture not found");
    }

    // Check if gesture is already sponsored
    const existing = await ctx.db
      .query("sponsorships")
      .withIndex("by_gesture_and_status", (q) =>
        q.eq("gestureId", args.gestureId).eq("status", "active")
      )
      .first();

    if (existing) {
      throw new Error(
        `This gesture is already sponsored until ${new Date(existing.endDate).toLocaleDateString()}`
      );
    }

    // Create sponsorship with pending status
    const endDate = Date.now() + args.durationWeeks * 7 * 24 * 60 * 60 * 1000;

    return await ctx.db.insert("sponsorships", {
      gestureId: args.gestureId,
      sponsorName: args.sponsorName,
      sponsorEmail: args.sponsorEmail,
      overlayImageStorageId: args.overlayImageStorageId,
      overlayText: args.overlayText,
      sponsoredVideoPlaybackId: args.sponsoredVideoPlaybackId,
      originalVideoPlaybackId: gesture.playbackId,
      startDate: 0, // Set after payment
      endDate,
      durationWeeks: args.durationWeeks,
      status: "pending",
      paymentAmount: args.paymentAmount,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

// Update sponsorship status and payment info
export const updateAfterPayment = mutation({
  args: {
    sponsorshipId: v.id("sponsorships"),
    molliePaymentId: v.string(),
    sponsoredVideoPlaybackId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sponsorship = await ctx.db.get(args.sponsorshipId);
    if (!sponsorship) {
      throw new Error("Sponsorship not found");
    }

    const startDate = Date.now();
    const endDate =
      startDate + sponsorship.durationWeeks * 7 * 24 * 60 * 60 * 1000;

    await ctx.db.patch(args.sponsorshipId, {
      molliePaymentId: args.molliePaymentId,
      sponsoredVideoPlaybackId: args.sponsoredVideoPlaybackId,
      status: "active",
      startDate,
      endDate,
      updatedAt: Date.now(),
    });

    // Update gesture to use sponsored video
    await ctx.db.patch(sponsorship.gestureId, {
      playbackId: args.sponsoredVideoPlaybackId,
      lastUpdated: Date.now(),
    });
  },
});

// Get sponsorship by payment ID (for webhook)
export const getByPaymentId = query({
  args: { molliePaymentId: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("sponsorships"),
      _creationTime: v.number(),
      gestureId: v.id("gestures"),
      sponsorName: v.string(),
      sponsorEmail: v.string(),
      overlayImageStorageId: v.string(),
      overlayText: v.string(),
      sponsoredVideoPlaybackId: v.optional(v.string()),
      originalVideoPlaybackId: v.string(),
      startDate: v.number(),
      endDate: v.number(),
      durationWeeks: v.number(),
      status: v.string(),
      molliePaymentId: v.optional(v.string()),
      paymentAmount: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) =>
    await ctx.db
      .query("sponsorships")
      .withIndex("by_payment_id", (q) =>
        q.eq("molliePaymentId", args.molliePaymentId)
      )
      .first(),
});

// Get sponsorship by ID
export const getById = query({
  args: { id: v.id("sponsorships") },
  returns: v.union(
    v.object({
      _id: v.id("sponsorships"),
      _creationTime: v.number(),
      gestureId: v.id("gestures"),
      sponsorName: v.string(),
      sponsorEmail: v.string(),
      overlayImageStorageId: v.string(),
      overlayText: v.string(),
      sponsoredVideoPlaybackId: v.optional(v.string()),
      originalVideoPlaybackId: v.string(),
      startDate: v.number(),
      endDate: v.number(),
      durationWeeks: v.number(),
      status: v.string(),
      molliePaymentId: v.optional(v.string()),
      paymentAmount: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => await ctx.db.get(args.id),
});

// Get active sponsorship for a gesture
export const getActiveByGesture = query({
  args: { gestureId: v.id("gestures") },
  returns: v.union(
    v.object({
      _id: v.id("sponsorships"),
      _creationTime: v.number(),
      gestureId: v.id("gestures"),
      sponsorName: v.string(),
      sponsorEmail: v.string(),
      overlayImageStorageId: v.string(),
      overlayText: v.string(),
      sponsoredVideoPlaybackId: v.optional(v.string()),
      originalVideoPlaybackId: v.string(),
      startDate: v.number(),
      endDate: v.number(),
      durationWeeks: v.number(),
      status: v.string(),
      molliePaymentId: v.optional(v.string()),
      paymentAmount: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) =>
    await ctx.db
      .query("sponsorships")
      .withIndex("by_gesture_and_status", (q) =>
        q.eq("gestureId", args.gestureId).eq("status", "active")
      )
      .first(),
});

// List all gestures with their sponsorship status
export const listGesturesWithSponsorship = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("gestures"),
      _creationTime: v.number(),
      name: v.string(),
      categoryIds: v.array(v.id("categories")),
      playbackId: v.string(),
      concept: v.array(v.string()),
      info: v.string(),
      isActive: v.boolean(),
      lastUpdated: v.number(),
      sponsorship: v.union(
        v.object({
          _id: v.id("sponsorships"),
          _creationTime: v.number(),
          gestureId: v.id("gestures"),
          sponsorName: v.string(),
          sponsorEmail: v.string(),
          overlayImageStorageId: v.string(),
          overlayText: v.string(),
          sponsoredVideoPlaybackId: v.optional(v.string()),
          originalVideoPlaybackId: v.string(),
          startDate: v.number(),
          endDate: v.number(),
          durationWeeks: v.number(),
          status: v.string(),
          molliePaymentId: v.optional(v.string()),
          paymentAmount: v.number(),
          createdAt: v.number(),
          updatedAt: v.number(),
        }),
        v.null()
      ),
    })
  ),
  handler: async (ctx) => {
    const gestures = await ctx.db
      .query("gestures")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    const sponsorships = await ctx.db
      .query("sponsorships")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    return gestures.map((gesture) => {
      const sponsorship =
        sponsorships.find((s) => s.gestureId === gesture._id) || null;
      return {
        ...gesture,
        sponsorship,
      };
    });
  },
});

// Get expired sponsorships (for scheduled job)
export const getExpired = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("sponsorships"),
      _creationTime: v.number(),
      gestureId: v.id("gestures"),
      sponsorName: v.string(),
      sponsorEmail: v.string(),
      overlayImageStorageId: v.string(),
      overlayText: v.string(),
      sponsoredVideoPlaybackId: v.optional(v.string()),
      originalVideoPlaybackId: v.string(),
      startDate: v.number(),
      endDate: v.number(),
      durationWeeks: v.number(),
      status: v.string(),
      molliePaymentId: v.optional(v.string()),
      paymentAmount: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
  ),
  handler: async (ctx) => {
    const now = Date.now();
    const activeSponsors = await ctx.db
      .query("sponsorships")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    return activeSponsors.filter((s) => s.endDate < now);
  },
});

// Expire a sponsorship (restore original video)
export const expire = mutation({
  args: { sponsorshipId: v.id("sponsorships") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sponsorship = await ctx.db.get(args.sponsorshipId);
    if (!sponsorship) {
      throw new Error("Sponsorship not found");
    }

    // Restore original video
    await ctx.db.patch(sponsorship.gestureId, {
      playbackId: sponsorship.originalVideoPlaybackId,
      lastUpdated: Date.now(),
    });

    // Mark as expired
    await ctx.db.patch(args.sponsorshipId, {
      status: "expired",
      updatedAt: Date.now(),
    });
  },
});

// Update sponsorship payment ID (after creating Mollie payment)
export const updatePaymentId = mutation({
  args: {
    sponsorshipId: v.id("sponsorships"),
    molliePaymentId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sponsorshipId, {
      molliePaymentId: args.molliePaymentId,
      status: "pending_payment",
      updatedAt: Date.now(),
    });
    return null;
  },
});

// Admin: List all sponsorships with filters
export const listAll = query({
  args: {
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("sponsorships"),
      _creationTime: v.number(),
      gestureId: v.id("gestures"),
      gestureName: v.optional(v.string()),
      sponsorName: v.string(),
      sponsorEmail: v.string(),
      overlayImageStorageId: v.string(),
      overlayText: v.string(),
      sponsoredVideoPlaybackId: v.optional(v.string()),
      originalVideoPlaybackId: v.string(),
      startDate: v.number(),
      endDate: v.number(),
      durationWeeks: v.number(),
      status: v.string(),
      molliePaymentId: v.optional(v.string()),
      paymentAmount: v.number(),
      rejectionReason: v.optional(v.string()),
      reviewedBy: v.optional(v.id("users")),
      reviewedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const limit = args.limit || 100;

    let query = ctx.db.query("sponsorships");

    if (args.status) {
      query = query.withIndex("by_status", (q) => q.eq("status", args.status));
    }

    const sponsorships = await query.order("desc").take(limit);

    // Enrich with gesture names
    const enriched = await Promise.all(
      sponsorships.map(async (s) => {
        const gesture = await ctx.db.get(s.gestureId);
        return {
          ...s,
          gestureName: gesture?.name,
        };
      })
    );

    return enriched;
  },
});

// Admin: List pending payment sponsorships (paid but not approved yet)
export const listPendingApproval = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("sponsorships"),
      _creationTime: v.number(),
      gestureId: v.id("gestures"),
      gestureName: v.optional(v.string()),
      sponsorName: v.string(),
      sponsorEmail: v.string(),
      overlayImageStorageId: v.string(),
      overlayText: v.string(),
      sponsoredVideoPlaybackId: v.optional(v.string()),
      originalVideoPlaybackId: v.string(),
      startDate: v.number(),
      endDate: v.number(),
      durationWeeks: v.number(),
      status: v.string(),
      molliePaymentId: v.optional(v.string()),
      paymentAmount: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
  ),
  handler: async (ctx) => {
    const sponsorships = await ctx.db
      .query("sponsorships")
      .withIndex("by_status", (q) => q.eq("status", "pending_payment"))
      .order("desc")
      .collect();

    // Enrich with gesture names
    const enriched = await Promise.all(
      sponsorships.map(async (s) => {
        const gesture = await ctx.db.get(s.gestureId);
        return {
          ...s,
          gestureName: gesture?.name,
        };
      })
    );

    return enriched;
  },
});

// Admin: Approve sponsorship (activate it)
export const approve = mutation({
  args: {
    sponsorshipId: v.id("sponsorships"),
    adminUserId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sponsorship = await ctx.db.get(args.sponsorshipId);
    if (!sponsorship) {
      throw new Error("Sponsorship not found");
    }

    if (sponsorship.status !== "pending_payment") {
      throw new Error(
        `Cannot approve sponsorship with status: ${sponsorship.status}`
      );
    }

    if (!sponsorship.sponsoredVideoPlaybackId) {
      throw new Error("Sponsored video playback ID is missing");
    }

    const startDate = Date.now();
    const endDate =
      startDate + sponsorship.durationWeeks * 7 * 24 * 60 * 60 * 1000;

    // Update sponsorship status
    await ctx.db.patch(args.sponsorshipId, {
      status: "active",
      startDate,
      endDate,
      reviewedBy: args.adminUserId,
      reviewedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Update gesture to use sponsored video
    await ctx.db.patch(sponsorship.gestureId, {
      playbackId: sponsorship.sponsoredVideoPlaybackId,
      lastUpdated: Date.now(),
    });

    return null;
  },
});

// Admin: Reject sponsorship
export const reject = mutation({
  args: {
    sponsorshipId: v.id("sponsorships"),
    adminUserId: v.id("users"),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sponsorship = await ctx.db.get(args.sponsorshipId);
    if (!sponsorship) {
      throw new Error("Sponsorship not found");
    }

    await ctx.db.patch(args.sponsorshipId, {
      status: "rejected",
      rejectionReason: args.reason,
      reviewedBy: args.adminUserId,
      reviewedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return null;
  },
});

// Admin: Manually expire a sponsorship
export const forceExpire = mutation({
  args: {
    sponsorshipId: v.id("sponsorships"),
    adminUserId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sponsorship = await ctx.db.get(args.sponsorshipId);
    if (!sponsorship) {
      throw new Error("Sponsorship not found");
    }

    if (sponsorship.status !== "active") {
      throw new Error("Only active sponsorships can be expired");
    }

    // Restore original video
    await ctx.db.patch(sponsorship.gestureId, {
      playbackId: sponsorship.originalVideoPlaybackId,
      lastUpdated: Date.now(),
    });

    // Mark as expired
    await ctx.db.patch(args.sponsorshipId, {
      status: "expired",
      reviewedBy: args.adminUserId,
      reviewedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return null;
  },
});
