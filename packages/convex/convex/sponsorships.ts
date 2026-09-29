/**
 * @fileoverview Convex mutations and queries for the sponsorships table.
 *
 * Implements the full sponsorship lifecycle:
 * - create / createBulk — new sponsorship records (pending state)
 * - Payment linking (Mollie payment ID)
 * - Admin approval / rejection / re-edit flows
 * - Status expiry and cleanup (triggered by cron)
 * - Sponsor re-submission flow
 *
 * Status machine:
 *   pending → pending_payment → pending_approval → active → expired
 *                                               ↘ rejected
 *                                               ↘ pending_resubmission → pending_approval
 *
 * @see packages/convex/convex/cron.ts for scheduled expiry jobs
 * @see packages/api/src/routers/sponsorships.ts for HTTP API wrappers
 */

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireServiceAuth } from "./lib/serviceAuth";
import {
  calculateEndDateFromWeeks,
  weeksToYears,
} from "./lib/sponsorshipDates";
import {
  checkExistingSponsorship,
  checkExistingSponsorshipStrict,
} from "./lib/sponsorshipValidation";

// Create a new sponsorship (called from web app after video composition)
export const create = mutation({
  args: {
    durationWeeks: v.number(),
    gestureId: v.id("gestures"),
    overlayImageStorageId: v.string(),
    overlayText: v.string(),
    paymentAmount: v.number(),
    serviceToken: v.string(),
    sponsorEmail: v.string(),
    sponsoredVideoPlaybackId: v.string(), // Mux playback ID
    sponsorName: v.string(),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "sponsorships.create");
    // Get gesture to backup original playbackId
    const gesture = await ctx.db.get(args.gestureId);
    if (!gesture) {
      throw new Error("Gesture not found");
    }

    // Check if gesture already has a conflicting sponsorship
    const conflictError = await checkExistingSponsorshipStrict(
      ctx.db,
      args.gestureId
    );
    if (conflictError) {
      throw new Error(conflictError);
    }

    // Create sponsorship with pending status
    const endDate = calculateEndDateFromWeeks(args.durationWeeks);
    const durationYears = weeksToYears(args.durationWeeks);

    return await ctx.db.insert("sponsorships", {
      contactFullName: args.sponsorName, // Legacy: use sponsor name as contact
      createdAt: Date.now(),
      durationYears,
      endDate,
      gestureId: args.gestureId,
      originalVideoPlaybackId: gesture.playbackId,
      overlayImageStorageId: args.overlayImageStorageId,
      overlayText: args.overlayText,
      paymentAmount: args.paymentAmount,
      sponsorEmail: args.sponsorEmail,
      sponsoredVideoPlaybackId: args.sponsoredVideoPlaybackId,
      sponsorName: args.sponsorName,
      startDate: 0, // Set after payment
      status: "pending",
      updatedAt: Date.now(),
    });
  },
  returns: v.id("sponsorships"),
});

// Create multiple sponsorships for multiple gestures (bulk sponsoring)
export const createBulk = mutation({
  args: {
    durationWeeks: v.number(),
    gestureIds: v.array(v.id("gestures")),
    overlayImageStorageId: v.string(),
    overlayText: v.string(),
    paymentAmountPerGesture: v.number(),
    serviceToken: v.string(),
    sponsorEmail: v.string(),
    sponsoredVideoPlaybackIds: v.array(v.string()), // Mux playback IDs, one per gesture
    sponsorName: v.string(),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "sponsorships.createBulk");
    if (args.gestureIds.length !== args.sponsoredVideoPlaybackIds.length) {
      throw new Error(
        "Number of gesture IDs must match number of sponsored video playback IDs"
      );
    }

    const sponsorshipIds: Id<"sponsorships">[] = [];
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
        // biome-ignore lint/performance/noAwaitInLoops: sequential so each conflict check sees sponsorships inserted by earlier iterations and results stay ordered
        const gesture = await ctx.db.get(gestureId);
        if (!gesture) {
          errors.push(`Gesture ${gestureId} not found`);
          continue;
        }

        // Check if gesture already has a conflicting sponsorship
        const conflictError = await checkExistingSponsorship(
          ctx.db,
          gestureId,
          gesture.name
        );
        if (conflictError) {
          errors.push(conflictError);
          continue;
        }

        // Create sponsorship with pending status
        const endDate = calculateEndDateFromWeeks(args.durationWeeks);
        const durationYears = weeksToYears(args.durationWeeks);

        const sponsorshipId = await ctx.db.insert("sponsorships", {
          contactFullName: args.sponsorName, // Legacy: use sponsor name as contact
          createdAt: Date.now(),
          durationYears,
          endDate,
          gestureId,
          originalVideoPlaybackId: gesture.playbackId,
          overlayImageStorageId: args.overlayImageStorageId,
          overlayText: args.overlayText,
          paymentAmount: args.paymentAmountPerGesture,
          sponsorEmail: args.sponsorEmail,
          sponsoredVideoPlaybackId,
          sponsorName: args.sponsorName,
          startDate: 0, // Set after payment
          status: "pending",
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
  returns: v.array(v.id("sponsorships")),
});

// Create multiple sponsorships for simplified flow (no video composition before payment)
export const createBulkSimplified = mutation({
  args: {
    contactCompany: v.optional(v.string()),
    contactFullName: v.string(),
    durationYears: v.number(), // Always 1
    gestureIds: v.array(v.id("gestures")),
    includeLogo: v.boolean(),
    invoiceEmail: v.optional(v.string()),
    invoiceName: v.optional(v.string()),
    // Note: logoImage is not stored - it's already baked into the preview videos
    // Invoice fields: collected when sponsor requests a factuur
    invoiceRequested: v.optional(v.boolean()),
    invoiceVatNumber: v.optional(v.string()),
    overlayText: v.string(),
    // One pre-composed preview playback ID per gesture, in the same order as gestureIds.
    // Each entry is the Mux playback ID for that gesture's composed preview video.
    previewVideoPlaybackIds: v.array(v.string()),
    serviceToken: v.string(),
    sponsorEmail: v.string(),
    sponsorName: v.string(),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "sponsorships.createBulkSimplified");
    if (
      args.gestureIds.length === 0 ||
      args.gestureIds.length > 20 ||
      args.gestureIds.length !== args.previewVideoPlaybackIds.length ||
      new Set(args.gestureIds).size !== args.gestureIds.length ||
      args.previewVideoPlaybackIds.some((id) => id.trim().length === 0) ||
      args.durationYears !== 1
    ) {
      throw new Error("Invalid sponsorship selection");
    }
    const sponsorshipIds: Id<"sponsorships">[] = [];
    const errors: string[] = [];

    // Pricing constants — kept local to avoid adding a dependency on @smog/config
    // inside Convex functions (which run server-side in the Convex runtime).
    const PRICE_PER_YEAR_CENTS = 5000;
    const LOGO_ADDON_CENTS = 1000;
    const paymentAmountPerGesture = args.includeLogo
      ? PRICE_PER_YEAR_CENTS + LOGO_ADDON_CENTS
      : PRICE_PER_YEAR_CENTS;

    for (let i = 0; i < args.gestureIds.length; i++) {
      const gestureId = args.gestureIds[i] as (typeof args.gestureIds)[number];
      const previewVideoPlaybackId = args.previewVideoPlaybackIds[i] ?? "";
      try {
        // Get gesture to backup original playbackId
        // biome-ignore lint/performance/noAwaitInLoops: sequential so each conflict check sees sponsorships inserted by earlier iterations and results stay ordered
        const gesture = await ctx.db.get(gestureId);
        if (!gesture) {
          errors.push(`Gesture ${gestureId} not found`);
          continue;
        }

        // Check if gesture already has a conflicting sponsorship
        const conflictError = await checkExistingSponsorship(
          ctx.db,
          gestureId,
          gesture.name
        );
        if (conflictError) {
          errors.push(conflictError);
          continue;
        }

        // Calculate end date (durationYears from now)
        const endDate =
          Date.now() + args.durationYears * 365 * 24 * 60 * 60 * 1000;

        // Note: We don't store the base64 logo image to avoid exceeding Convex's
        // document size limits. The logo is already baked into the preview video.
        const sponsorshipId = await ctx.db.insert("sponsorships", {
          contactCompany: args.contactCompany,
          contactFullName: args.contactFullName,
          createdAt: Date.now(),
          durationYears: args.durationYears,
          endDate,
          gestureId,
          hasLogo: args.includeLogo,
          invoiceEmail: args.invoiceEmail,
          invoiceName: args.invoiceName,
          invoiceRequested: args.invoiceRequested,
          invoiceVatNumber: args.invoiceVatNumber,
          originalVideoPlaybackId: gesture.playbackId,
          overlayText: args.overlayText,
          paymentAmount: paymentAmountPerGesture,
          previewVideoPlaybackId,
          sponsorEmail: args.sponsorEmail,
          sponsorName: args.sponsorName,
          startDate: 0, // Set after payment is confirmed
          status: "pending_payment", // Will be updated to pending_approval after payment
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
  returns: v.array(v.id("sponsorships")),
});

// Update sponsorship status and payment info
export const updateAfterPayment = mutation({
  args: {
    molliePaymentId: v.string(),
    serviceToken: v.string(),
    sponsoredVideoPlaybackId: v.string(),
    sponsorshipId: v.id("sponsorships"),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "sponsorships.updateAfterPayment");
    const sponsorship = await ctx.db.get(args.sponsorshipId);
    if (!sponsorship) {
      throw new Error("Sponsorship not found");
    }

    const startDate = Date.now();
    const endDate =
      startDate + (sponsorship.durationYears || 1) * 365 * 24 * 60 * 60 * 1000;

    await ctx.db.patch(args.sponsorshipId, {
      endDate,
      molliePaymentId: args.molliePaymentId,
      sponsoredVideoPlaybackId: args.sponsoredVideoPlaybackId,
      startDate,
      status: "active",
      updatedAt: Date.now(),
    });

    // Update gesture to use sponsored video
    await ctx.db.patch(sponsorship.gestureId, {
      lastUpdated: Date.now(),
      playbackId: args.sponsoredVideoPlaybackId,
    });
  },
  returns: v.null(),
});

// Get sponsorship by payment ID (for webhook)
export const getByPaymentId = query({
  args: { molliePaymentId: v.string(), serviceToken: v.string() },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "sponsorships.getByPaymentId");
    return await ctx.db
      .query("sponsorships")
      .withIndex("by_payment_id", (q) =>
        q.eq("molliePaymentId", args.molliePaymentId)
      )
      .first();
  },
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
    return await Promise.all(
      sponsorships.map(async (s) => {
        const gesture = await ctx.db.get(s.gestureId);
        return {
          durationYears: s.durationYears,
          gestureName: gesture?.name,
          paymentAmount: s.paymentAmount,
          sponsorName: s.sponsorName,
          status: s.status,
        };
      })
    );
  },
});

// Update contact info for sponsorships after payment
export const updateContactInfo = mutation({
  args: {
    company: v.optional(v.string()),
    email: v.string(),
    fullName: v.string(),
    molliePaymentId: v.string(),
    serviceToken: v.string(),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "sponsorships.updateContactInfo");
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
    await Promise.all(
      sponsorships.map((sponsorship) =>
        ctx.db.patch(sponsorship._id, {
          contactCompany: args.company,
          contactFullName: args.fullName,
          sponsorEmail: args.email,
          updatedAt: Date.now(),
        })
      )
    );

    return null;
  },
  returns: v.null(),
});

// Get sponsorship by ID
export const getById = query({
  args: { id: v.id("sponsorships"), serviceToken: v.string() },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "sponsorships.getById");
    return await ctx.db.get(args.id);
  },
});

// Get active sponsorship for a gesture
export const getActiveByGesture = query({
  args: { gestureId: v.id("gestures") },
  handler: async (ctx, args) => {
    const sponsorship = await ctx.db
      .query("sponsorships")
      .withIndex("by_gesture_and_status", (q) =>
        q.eq("gestureId", args.gestureId).eq("status", "active")
      )
      .first();
    return sponsorship
      ? {
          endDate: sponsorship.endDate,
          sponsorName: sponsorship.sponsorName,
          status: sponsorship.status,
        }
      : null;
  },
});

export const getActiveByGestureForService = query({
  args: {
    gestureId: v.id("gestures"),
    serviceToken: v.string(),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(
      args.serviceToken,
      "sponsorships.getActiveByGestureForService"
    );
    return await ctx.db
      .query("sponsorships")
      .withIndex("by_gesture_and_status", (q) =>
        q.eq("gestureId", args.gestureId).eq("status", "active")
      )
      .first();
  },
});

// Get active sponsorships for multiple gestures (batch query)
export const getActiveByGestures = query({
  args: { gestureIds: v.array(v.id("gestures")) },
  handler: async (ctx, args) => {
    if (args.gestureIds.length > 200) {
      throw new Error("Too many gesture IDs");
    }
    const activeSponsorships = await Promise.all(
      args.gestureIds.map((gestureId) =>
        ctx.db
          .query("sponsorships")
          .withIndex("by_gesture_and_status", (q) =>
            q.eq("gestureId", gestureId).eq("status", "active")
          )
          .first()
      )
    );

    const sponsorshipMap: Record<
      string,
      { status: string; sponsorName?: string; endDate: number }
    > = {};

    for (const sponsorship of activeSponsorships) {
      if (sponsorship) {
        sponsorshipMap[sponsorship.gestureId] = {
          endDate: sponsorship.endDate,
          sponsorName: sponsorship.sponsorName,
          status: sponsorship.status,
        };
      }
    }

    return sponsorshipMap;
  },
});

// List all gestures with their sponsorship status
export const listGesturesWithSponsorship = query({
  args: {},
  handler: async (ctx) => {
    const gestures = await ctx.db
      .query("gestures")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    const statuses = [
      "pending",
      "pending_payment",
      "pending_approval",
      "active",
    ] as const;
    const relevantSponsorships = (
      await Promise.all(
        statuses.map((status) =>
          ctx.db
            .query("sponsorships")
            .withIndex("by_status", (q) => q.eq("status", status))
            .collect()
        )
      )
    ).flat();
    const sponsorshipByGesture = new Map(
      relevantSponsorships.map((sponsorship) => [
        sponsorship.gestureId,
        sponsorship,
      ])
    );

    return gestures.map((gesture) => {
      const sponsorship = sponsorshipByGesture.get(gesture._id) ?? null;
      return {
        ...gesture,
        sponsorship: sponsorship
          ? {
              endDate: sponsorship.endDate,
              sponsorName:
                sponsorship.status === "active"
                  ? sponsorship.sponsorName
                  : undefined,
              status: sponsorship.status,
            }
          : null,
      };
    });
  },
});

// Get expired sponsorships (for scheduled job)
export const getExpired = query({
  args: { serviceToken: v.string() },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "sponsorships.getExpired");
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
  args: {
    serviceToken: v.string(),
    sponsorshipId: v.id("sponsorships"),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "sponsorships.expire");
    const sponsorship = await ctx.db.get(args.sponsorshipId);
    if (!sponsorship) {
      throw new Error("Sponsorship not found");
    }

    // Restore original video
    await ctx.db.patch(sponsorship.gestureId, {
      lastUpdated: Date.now(),
      playbackId: sponsorship.originalVideoPlaybackId,
    });

    // Mark as expired
    await ctx.db.patch(args.sponsorshipId, {
      status: "expired",
      updatedAt: Date.now(),
    });
  },
  returns: v.null(),
});

// Update sponsorship payment ID (after creating Mollie payment)
export const updatePaymentId = mutation({
  args: {
    molliePaymentId: v.string(),
    serviceToken: v.string(),
    sponsorshipId: v.id("sponsorships"),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "sponsorships.updatePaymentId");
    await ctx.db.patch(args.sponsorshipId, {
      molliePaymentId: args.molliePaymentId,
      status: "pending_payment", // Waiting for payment confirmation
      updatedAt: Date.now(),
    });
    return null;
  },
  returns: v.null(),
});

// Update sponsorship with composed video playback ID (called by webhook after video composition)
export const updateVideoPlaybackId = mutation({
  args: {
    serviceToken: v.string(),
    sponsoredVideoPlaybackId: v.string(),
    sponsorshipId: v.id("sponsorships"),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "sponsorships.updateVideoPlaybackId");
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
  returns: v.null(),
});

// Mark sponsorship as paid and awaiting approval (called by webhook after payment confirmation)
export const markAsAwaitingApproval = mutation({
  args: {
    serviceToken: v.string(),
    sponsorshipId: v.id("sponsorships"),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(
      args.serviceToken,
      "sponsorships.markAsAwaitingApproval"
    );
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
  returns: v.null(),
});

// Admin: List all sponsorships with filters
export const listAll = query({
  args: {
    limit: v.optional(v.number()),
    serviceToken: v.string(),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "sponsorships.listAll");
    const limit = Math.min(Math.max(args.limit || 100, 1), 1000);

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
  args: { serviceToken: v.string() },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "sponsorships.listPendingApproval");
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
    adminUserId: v.id("users"),
    serviceToken: v.string(),
    sponsorshipId: v.id("sponsorships"),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "sponsorships.approve");
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
      endDate,
      reviewedAt: Date.now(),
      reviewedBy: args.adminUserId,
      startDate,
      status: "active",
      updatedAt: Date.now(),
    });

    // Update gesture to use sponsored video
    await ctx.db.patch(sponsorship.gestureId, {
      lastUpdated: Date.now(),
      playbackId: sponsorship.sponsoredVideoPlaybackId,
    });

    return null;
  },
  returns: v.null(),
});

// Admin: Reject sponsorship
export const reject = mutation({
  args: {
    adminUserId: v.id("users"),
    reason: v.string(),
    serviceToken: v.string(),
    sponsorshipId: v.id("sponsorships"),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "sponsorships.reject");
    const sponsorship = await ctx.db.get(args.sponsorshipId);
    if (!sponsorship) {
      throw new Error("Sponsorship not found");
    }

    await ctx.db.patch(args.sponsorshipId, {
      rejectionReason: args.reason,
      reviewedAt: Date.now(),
      reviewedBy: args.adminUserId,
      status: "rejected",
      updatedAt: Date.now(),
    });

    return null;
  },
  returns: v.null(),
});

// Admin: Set a re-edit token so the sponsor can resubmit video without paying
// Status transitions: pending_approval → pending_resubmission
export const setReEditToken = mutation({
  args: {
    expiresAt: v.number(),
    serviceToken: v.string(),
    sponsorshipId: v.id("sponsorships"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "sponsorships.setReEditToken");
    const sponsorship = await ctx.db.get(args.sponsorshipId);
    if (!sponsorship) {
      throw new Error("Sponsorship not found");
    }

    const allowedStatuses = [
      "pending_approval",
      "pending_resubmission",
      "rejected",
    ];
    if (!allowedStatuses.includes(sponsorship.status)) {
      throw new Error(
        `Cannot generate re-edit link for sponsorship with status: ${sponsorship.status}`
      );
    }

    await ctx.db.patch(args.sponsorshipId, {
      reEditToken: args.token,
      reEditTokenExpiresAt: args.expiresAt,
      status: "pending_resubmission",
      updatedAt: Date.now(),
    });

    return null;
  },
  returns: v.null(),
});

// Get a sponsorship by its re-edit token (public — token is the secret)
export const getByReEditToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const sponsorship = await ctx.db
      .query("sponsorships")
      .withIndex("by_re_edit_token", (q) => q.eq("reEditToken", args.token))
      .first();

    if (!sponsorship) {
      return null;
    }

    // Check expiry
    if (
      sponsorship.reEditTokenExpiresAt &&
      Date.now() > sponsorship.reEditTokenExpiresAt
    ) {
      return { expired: true as const };
    }

    // Enrich with gesture info
    const gesture = await ctx.db.get(sponsorship.gestureId);

    return {
      expired: false as const,
      sponsorship: {
        _id: sponsorship._id,
        contactCompany: sponsorship.contactCompany,
        contactFullName: sponsorship.contactFullName,
        gestureId: sponsorship.gestureId,
        gestureName: gesture?.name,
        hasLogo: sponsorship.hasLogo,
        originalVideoPlaybackId: sponsorship.originalVideoPlaybackId,
        overlayText: sponsorship.overlayText,
        reEditTokenExpiresAt: sponsorship.reEditTokenExpiresAt,
        sponsorEmail: sponsorship.sponsorEmail,
        sponsorName: sponsorship.sponsorName,
        status: sponsorship.status,
      },
    };
  },
});

// Sponsor resubmits video using re-edit token (no payment required)
// Status transitions: pending_resubmission → pending_approval
export const reSubmitSponsorshipVideo = mutation({
  args: {
    // Optional editable fields the sponsor may have changed
    overlayText: v.optional(v.string()),
    previewVideoPlaybackId: v.string(),
    serviceToken: v.string(),
    sponsoredVideoPlaybackId: v.string(),
    sponsorName: v.optional(v.string()),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(
      args.serviceToken,
      "sponsorships.reSubmitSponsorshipVideo"
    );
    const sponsorship = await ctx.db
      .query("sponsorships")
      .withIndex("by_re_edit_token", (q) => q.eq("reEditToken", args.token))
      .first();

    if (!sponsorship) {
      throw new Error("Invalid re-edit token");
    }

    if (
      sponsorship.reEditTokenExpiresAt &&
      Date.now() > sponsorship.reEditTokenExpiresAt
    ) {
      throw new Error("Re-edit token has expired");
    }

    if (sponsorship.status !== "pending_resubmission") {
      throw new Error(
        `Cannot resubmit video for sponsorship with status: ${sponsorship.status}`
      );
    }

    await ctx.db.patch(sponsorship._id, {
      previewVideoPlaybackId: args.previewVideoPlaybackId,
      sponsoredVideoPlaybackId: args.sponsoredVideoPlaybackId,
      ...(args.overlayText !== undefined && { overlayText: args.overlayText }),
      ...(args.sponsorName !== undefined && { sponsorName: args.sponsorName }),
      // Clear the token once used
      reEditToken: undefined,
      reEditTokenExpiresAt: undefined,
      status: "pending_approval",
      updatedAt: Date.now(),
    });

    return null;
  },
  returns: v.null(),
});

// Admin: Retrieve the current re-edit link token for a sponsorship (to copy it again)
export const getReEditLinkForAdmin = query({
  args: {
    serviceToken: v.string(),
    sponsorshipId: v.id("sponsorships"),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "sponsorships.getReEditLinkForAdmin");
    const sponsorship = await ctx.db.get(args.sponsorshipId);
    if (!(sponsorship?.reEditToken && sponsorship.reEditTokenExpiresAt)) {
      return null;
    }
    return {
      expired: Date.now() > sponsorship.reEditTokenExpiresAt,
      expiresAt: sponsorship.reEditTokenExpiresAt,
      token: sponsorship.reEditToken,
    };
  },
});

// Query active sponsorships expiring within the given number of days
// that haven't had a renewal reminder sent yet
export const getExpiringSoon = query({
  args: {
    daysUntilExpiry: v.number(),
    serviceToken: v.string(),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "sponsorships.getExpiringSoon");
    const now = Date.now();
    const cutoff = now + args.daysUntilExpiry * 24 * 60 * 60 * 1000;

    return await ctx.db
      .query("sponsorships")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .filter((q) =>
        q.and(
          q.gt(q.field("endDate"), now),
          q.lte(q.field("endDate"), cutoff),
          q.eq(q.field("renewalReminderSentAt"), undefined)
        )
      )
      .collect();
  },
});

// Mark that a renewal reminder email has been sent for a sponsorship
export const markRenewalReminderSent = mutation({
  args: {
    serviceToken: v.string(),
    sponsorshipId: v.id("sponsorships"),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(
      args.serviceToken,
      "sponsorships.markRenewalReminderSent"
    );
    await ctx.db.patch(args.sponsorshipId, {
      renewalReminderSentAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
  returns: v.null(),
});

// Get stale pending_payment sponsorships (for scheduled cleanup job)
// A sponsorship is considered stale if it has been in pending_payment for more than 24 hours
export const getStalePendingPayments = query({
  args: { serviceToken: v.string() },
  handler: async (ctx, args) => {
    requireServiceAuth(
      args.serviceToken,
      "sponsorships.getStalePendingPayments"
    );
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const pending = await ctx.db
      .query("sponsorships")
      .withIndex("by_status", (q) => q.eq("status", "pending_payment"))
      .collect();
    return pending.filter((s) => s.updatedAt < cutoff);
  },
});

// Cancel a pending_payment sponsorship (no payment was received)
export const cancelPendingPayment = mutation({
  args: {
    serviceToken: v.string(),
    sponsorshipId: v.id("sponsorships"),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "sponsorships.cancelPendingPayment");
    const sponsorship = await ctx.db.get(args.sponsorshipId);
    if (!sponsorship) {
      throw new Error("Sponsorship not found");
    }

    if (sponsorship.status !== "pending_payment") {
      throw new Error(
        `Cannot cancel sponsorship with status: ${sponsorship.status}`
      );
    }

    await ctx.db.patch(args.sponsorshipId, {
      status: "cancelled",
      updatedAt: Date.now(),
    });

    return null;
  },
  returns: v.null(),
});

// Admin: Manually expire a sponsorship
export const forceExpire = mutation({
  args: {
    adminUserId: v.id("users"),
    serviceToken: v.string(),
    sponsorshipId: v.id("sponsorships"),
  },
  handler: async (ctx, args) => {
    requireServiceAuth(args.serviceToken, "sponsorships.forceExpire");
    const sponsorship = await ctx.db.get(args.sponsorshipId);
    if (!sponsorship) {
      throw new Error("Sponsorship not found");
    }

    if (sponsorship.status !== "active") {
      throw new Error("Only active sponsorships can be expired");
    }

    // Restore original video
    await ctx.db.patch(sponsorship.gestureId, {
      lastUpdated: Date.now(),
      playbackId: sponsorship.originalVideoPlaybackId,
    });

    // Mark as expired
    await ctx.db.patch(args.sponsorshipId, {
      reviewedAt: Date.now(),
      reviewedBy: args.adminUserId,
      status: "expired",
      updatedAt: Date.now(),
    });

    return null;
  },
  returns: v.null(),
});
