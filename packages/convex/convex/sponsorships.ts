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

    // Check if gesture already has an active or pending sponsorship
    const existingActive = await ctx.db
      .query("sponsorships")
      .withIndex("by_gesture_and_status", (q) =>
        q.eq("gestureId", args.gestureId).eq("status", "active")
      )
      .first();

    if (existingActive) {
      throw new Error(
        `This gesture is already sponsored until ${new Date(existingActive.endDate).toLocaleDateString()}`
      );
    }

    // Check for pending/pending_payment/pending_approval sponsorships
    const existingPending = await ctx.db
      .query("sponsorships")
      .withIndex("by_gesture", (q) => q.eq("gestureId", args.gestureId))
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "pending"),
          q.eq(q.field("status"), "pending_payment"),
          q.eq(q.field("status"), "pending_approval")
        )
      )
      .first();

    if (existingPending) {
      throw new Error(
        "This gesture already has a pending sponsorship. Please wait for it to be processed or contact support."
      );
    }

    // Create sponsorship with pending status
    const endDate = Date.now() + args.durationWeeks * 7 * 24 * 60 * 60 * 1000;
    const durationYears = Math.ceil(args.durationWeeks / 52); // Convert weeks to years

    return await ctx.db.insert("sponsorships", {
      gestureId: args.gestureId,
      sponsorName: args.sponsorName,
      sponsorEmail: args.sponsorEmail,
      contactFullName: args.sponsorName, // Legacy: use sponsor name as contact
      overlayImageStorageId: args.overlayImageStorageId,
      overlayText: args.overlayText,
      sponsoredVideoPlaybackId: args.sponsoredVideoPlaybackId,
      originalVideoPlaybackId: gesture.playbackId,
      startDate: 0, // Set after payment
      endDate,
      durationYears,
      status: "pending",
      paymentAmount: args.paymentAmount,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

// Create multiple sponsorships for multiple gestures (bulk sponsoring)
export const createBulk = mutation({
  args: {
    gestureIds: v.array(v.id("gestures")),
    sponsorName: v.string(),
    sponsorEmail: v.string(),
    overlayImageStorageId: v.string(),
    overlayText: v.string(),
    sponsoredVideoPlaybackIds: v.array(v.string()), // Mux playback IDs, one per gesture
    durationWeeks: v.number(),
    paymentAmountPerGesture: v.number(),
  },
  returns: v.array(v.id("sponsorships")),
  handler: async (ctx, args) => {
    if (args.gestureIds.length !== args.sponsoredVideoPlaybackIds.length) {
      throw new Error(
        "Number of gesture IDs must match number of sponsored video playback IDs"
      );
    }

    // biome-ignore lint/suspicious/noExplicitAny: Convex ID type
    const sponsorshipIds: any[] = [];
    const errors: string[] = [];

    for (let i = 0; i < args.gestureIds.length; i++) {
      const gestureId = args.gestureIds[i];
      if (!gestureId) {
        errors.push(`Gesture ID at index ${i} is undefined`);
        continue;
      }

      const sponsoredVideoPlaybackId = args.sponsoredVideoPlaybackIds[i];
      if (!sponsoredVideoPlaybackId) {
        errors.push(`Sponsored video playback ID at index ${i} is undefined`);
        continue;
      }

      try {
        // Get gesture to backup original playbackId
        const gesture = await ctx.db.get(gestureId);
        if (!gesture) {
          errors.push(`Gesture ${gestureId} not found`);
          continue;
        }

        // Check if gesture already has an active or pending sponsorship
        const existingActive = await ctx.db
          .query("sponsorships")
          .withIndex("by_gesture_and_status", (q) =>
            q.eq("gestureId", gestureId).eq("status", "active")
          )
          .first();

        if (existingActive) {
          errors.push(
            `Gesture "${gesture.name}" is already sponsored until ${new Date(existingActive.endDate).toLocaleDateString()}`
          );
          continue;
        }

        // Check for pending/pending_payment/pending_approval sponsorships
        const existingPending = await ctx.db
          .query("sponsorships")
          .withIndex("by_gesture", (q) => q.eq("gestureId", gestureId))
          .filter((q) =>
            q.or(
              q.eq(q.field("status"), "pending"),
              q.eq(q.field("status"), "pending_payment"),
              q.eq(q.field("status"), "pending_approval")
            )
          )
          .first();

        if (existingPending) {
          errors.push(
            `Gesture "${gesture.name}" already has a pending sponsorship`
          );
          continue;
        }

        // Create sponsorship with pending status
        const endDate =
          Date.now() + args.durationWeeks * 7 * 24 * 60 * 60 * 1000;
        const durationYears = Math.ceil(args.durationWeeks / 52); // Convert weeks to years

        const sponsorshipId = await ctx.db.insert("sponsorships", {
          gestureId,
          sponsorName: args.sponsorName,
          sponsorEmail: args.sponsorEmail,
          contactFullName: args.sponsorName, // Legacy: use sponsor name as contact
          overlayImageStorageId: args.overlayImageStorageId,
          overlayText: args.overlayText,
          sponsoredVideoPlaybackId,
          originalVideoPlaybackId: gesture.playbackId,
          startDate: 0, // Set after payment
          endDate,
          durationYears,
          status: "pending",
          paymentAmount: args.paymentAmountPerGesture,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        sponsorshipIds.push(sponsorshipId);
      } catch (error) {
        errors.push(
          `Error creating sponsorship for gesture ${gestureId}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `Failed to create ${errors.length} sponsorship(s): ${errors.join("; ")}`
      );
    }

    return sponsorshipIds;
  },
});

// Create multiple sponsorships for simplified flow (no video composition before payment)
export const createBulkSimplified = mutation({
  args: {
    gestureIds: v.array(v.id("gestures")),
    sponsorName: v.string(),
    sponsorEmail: v.string(),
    contactFullName: v.string(),
    contactCompany: v.optional(v.string()),
    logoImage: v.optional(v.string()), // base64 data URL
    overlayText: v.string(),
    includeLogo: v.boolean(),
    durationYears: v.number(), // Always 1
    previewVideoPlaybackId: v.string(),
  },
  returns: v.array(v.id("sponsorships")),
  handler: async (ctx, args) => {
    // biome-ignore lint/suspicious/noExplicitAny: Convex ID type
    const sponsorshipIds: any[] = [];
    const errors: string[] = [];

    // Calculate payment amount (€50 per gesture + €10 if logo)
    const PRICE_PER_YEAR_CENTS = 5000;
    const LOGO_ADDON_CENTS = 1000;
    const paymentAmountPerGesture = args.includeLogo
      ? PRICE_PER_YEAR_CENTS + LOGO_ADDON_CENTS
      : PRICE_PER_YEAR_CENTS;

    for (const gestureId of args.gestureIds) {
      try {
        // Get gesture to backup original playbackId
        const gesture = await ctx.db.get(gestureId);
        if (!gesture) {
          errors.push(`Gesture ${gestureId} not found`);
          continue;
        }

        // Check if gesture already has an active or pending sponsorship
        const existingActive = await ctx.db
          .query("sponsorships")
          .withIndex("by_gesture_and_status", (q) =>
            q.eq("gestureId", gestureId).eq("status", "active")
          )
          .first();

        if (existingActive) {
          errors.push(
            `Gesture "${gesture.name}" is already sponsored until ${new Date(existingActive.endDate).toLocaleDateString()}`
          );
          continue;
        }

        // Check for pending/pending_payment/pending_approval sponsorships
        const existingPending = await ctx.db
          .query("sponsorships")
          .withIndex("by_gesture", (q) => q.eq("gestureId", gestureId))
          .filter((q) =>
            q.or(
              q.eq(q.field("status"), "pending_payment"),
              q.eq(q.field("status"), "pending_approval")
            )
          )
          .first();

        if (existingPending) {
          errors.push(
            `Gesture "${gesture.name}" already has a pending sponsorship`
          );
          continue;
        }

        // Calculate end date (1 year from now)
        const endDate =
          Date.now() + args.durationYears * 365 * 24 * 60 * 60 * 1000;

        const sponsorshipId = await ctx.db.insert("sponsorships", {
          gestureId,
          sponsorName: args.sponsorName,
          sponsorEmail: args.sponsorEmail,
          contactFullName: args.contactFullName,
          contactCompany: args.contactCompany,
          overlayImageStorageId: args.logoImage,
          overlayText: args.overlayText,
          originalVideoPlaybackId: gesture.playbackId,
          previewVideoPlaybackId: args.previewVideoPlaybackId,
          hasLogo: args.includeLogo,
          durationYears: args.durationYears,
          startDate: 0, // Set after payment is confirmed
          endDate,
          status: "pending_payment", // Will be updated to pending_approval after payment
          paymentAmount: paymentAmountPerGesture,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        sponsorshipIds.push(sponsorshipId);
      } catch (error) {
        errors.push(
          `Error creating sponsorship for gesture ${gestureId}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `Failed to create ${errors.length} sponsorship(s): ${errors.join("; ")}`
      );
    }

    return sponsorshipIds;
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
      startDate + (sponsorship.durationYears || 1) * 365 * 24 * 60 * 60 * 1000;

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
  handler: async (ctx, args) =>
    await ctx.db
      .query("sponsorships")
      .withIndex("by_payment_id", (q) =>
        q.eq("molliePaymentId", args.molliePaymentId)
      )
      .first(),
});

// Get all sponsorships by payment ID (for simplified flow with multiple gestures)
export const getAllByPaymentId = query({
  args: { molliePaymentId: v.string() },
  handler: async (ctx, args) => {
    const sponsorships = await ctx.db
      .query("sponsorships")
      .withIndex("by_payment_id", (q) =>
        q.eq("molliePaymentId", args.molliePaymentId)
      )
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

// Update contact info for sponsorships after payment
export const updateContactInfo = mutation({
  args: {
    molliePaymentId: v.string(),
    fullName: v.string(),
    email: v.string(),
    company: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sponsorships = await ctx.db
      .query("sponsorships")
      .withIndex("by_payment_id", (q) =>
        q.eq("molliePaymentId", args.molliePaymentId)
      )
      .collect();

    if (sponsorships.length === 0) {
      throw new Error("No sponsorships found for this payment ID");
    }

    // Update all sponsorships with contact info
    for (const sponsorship of sponsorships) {
      await ctx.db.patch(sponsorship._id, {
        contactFullName: args.fullName,
        sponsorEmail: args.email,
        contactCompany: args.company,
        updatedAt: Date.now(),
      });
    }

    return null;
  },
});

// Get sponsorship by ID
export const getById = query({
  args: { id: v.id("sponsorships") },
  handler: async (ctx, args) => await ctx.db.get(args.id),
});

// Get active sponsorship for a gesture
export const getActiveByGesture = query({
  args: { gestureId: v.id("gestures") },
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
  handler: async (ctx) => {
    const gestures = await ctx.db
      .query("gestures")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    // Fetch all sponsorships (active and pending states)
    const allSponserships = await ctx.db.query("sponsorships").collect();

    // Filter for active or pending sponsorships
    const relevantSponserships = allSponserships.filter(
      (s) =>
        s.status === "active" ||
        s.status === "pending" ||
        s.status === "pending_payment" ||
        s.status === "pending_approval"
    );

    return gestures.map((gesture) => {
      const sponsorship =
        relevantSponserships.find((s) => s.gestureId === gesture._id) || null;
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
      status: "pending_payment", // Waiting for payment confirmation
      updatedAt: Date.now(),
    });
    return null;
  },
});

// Update sponsorship with composed video playback ID (called by webhook after video composition)
export const updateVideoPlaybackId = mutation({
  args: {
    sponsorshipId: v.id("sponsorships"),
    sponsoredVideoPlaybackId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sponsorship = await ctx.db.get(args.sponsorshipId);
    if (!sponsorship) {
      throw new Error("Sponsorship not found");
    }

    await ctx.db.patch(args.sponsorshipId, {
      sponsoredVideoPlaybackId: args.sponsoredVideoPlaybackId,
      updatedAt: Date.now(),
    });
    return null;
  },
});

// Mark sponsorship as paid and awaiting approval (called by webhook after payment confirmation)
export const markAsAwaitingApproval = mutation({
  args: {
    sponsorshipId: v.id("sponsorships"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sponsorship = await ctx.db.get(args.sponsorshipId);
    if (!sponsorship) {
      throw new Error("Sponsorship not found");
    }

    // Only update if currently pending_payment
    if (sponsorship.status !== "pending_payment") {
      console.log(
        `Sponsorship ${args.sponsorshipId} cannot be marked as awaiting approval (current status: ${sponsorship.status})`
      );
      return null;
    }

    await ctx.db.patch(args.sponsorshipId, {
      status: "pending_approval",
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
  handler: async (ctx, args) => {
    const limit = args.limit || 100;

    const sponsorships = args.status
      ? await ctx.db
          .query("sponsorships")
          .withIndex("by_status", (q) => q.eq("status", args.status as string))
          .order("desc")
          .take(limit)
      : await ctx.db.query("sponsorships").order("desc").take(limit);

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
  handler: async (ctx) => {
    const sponsorships = await ctx.db
      .query("sponsorships")
      .withIndex("by_status", (q) => q.eq("status", "pending_approval"))
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

    if (sponsorship.status !== "pending_approval") {
      throw new Error(
        `Cannot approve sponsorship with status: ${sponsorship.status}`
      );
    }

    if (!sponsorship.sponsoredVideoPlaybackId) {
      throw new Error("Sponsored video playback ID is missing");
    }

    const startDate = Date.now();
    const endDate =
      startDate + (sponsorship.durationYears || 1) * 365 * 24 * 60 * 60 * 1000;

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
