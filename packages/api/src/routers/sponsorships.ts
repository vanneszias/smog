import { mollieClient } from "@smog/auth/server";
import { api } from "@smog/convex";
import type { Id } from "@smog/convex/dataModel";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { publicProcedure } from "../index";

// Fixed sponsor overlay configuration
const SPONSOR_OVERLAY_CONFIG = {
  image: {
    x: 50, // centered
    y: 76, // moved up from 78 for better balance
    width: 22, // increased from 15 to 22 (47% larger)
    height: 22, // increased from 15 to 22
  },
  text: {
    x: 50,
    y: 87, // adjusted for two-line layout
    fontSize: 3.8, // slightly reduced from 4 to fit two lines
    color: "#00805f",
  },
  animation: {
    startTime: 5,
    fadeInDuration: 1,
  },
} as const;

// Initialize Convex client for server-side operations
const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

// Get Remotion service URL from environment
const REMOTION_URL = process.env.REMOTION_URL || "http://localhost:3002";

// Poll Remotion until a composition job completes (max 2 minutes)
async function pollCompositionJob(jobId: string): Promise<string> {
  const maxAttempts = 120;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const statusResponse = await fetch(
      `${REMOTION_URL}/api/compose/status/${jobId}`
    );
    if (!statusResponse.ok) {
      continue;
    }
    const status = (await statusResponse.json()) as {
      jobId: string;
      state: string;
      progress: number;
      result?: {
        success: boolean;
        composedVideoPlaybackId?: string;
        error?: string;
      };
    };
    if (status.state === "completed" && status.result?.success) {
      const playbackId = status.result.composedVideoPlaybackId;
      if (!playbackId) {
        throw new Error("Composition completed but returned no playback ID");
      }
      return playbackId;
    }
    if (status.state === "failed") {
      throw new Error(
        `Video composition failed: ${status.result?.error || "Unknown error"}`
      );
    }
  }
  throw new Error("Video composition timed out after 2 minutes");
}

// Call Remotion to compose a video and poll until done
async function composeVideo({
  playbackId,
  logoImage,
  overlayText,
}: {
  playbackId: string;
  logoImage?: string;
  overlayText: string;
}): Promise<string> {
  const response = await fetch(`${REMOTION_URL}/api/compose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      playbackId,
      overlayImageUrl: logoImage || "",
      overlayText,
      overlayConfig: SPONSOR_OVERLAY_CONFIG,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Remotion service returned ${response.status}: ${error}`);
  }

  const result = (await response.json()) as {
    success: boolean;
    jobId: string;
    message: string;
  };

  return pollCompositionJob(result.jobId);
}

export const sponsorshipsRouter = {
  /**
   * List all gestures with their sponsorship status
   */
  listGesturesWithSponsorship: publicProcedure.handler(async () => {
    try {
      const gestures = await convex.query(
        api.sponsorships.listGesturesWithSponsorship
      );
      return gestures;
    } catch (error) {
      console.error(
        "[SponsorshipsRouter] List gestures with sponsorship error:",
        error
      );
      throw new Error(
        `Failed to list gestures with sponsorship: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }),

  /**
   * Generate preview video for a single gesture
   * Used in the wizard before payment to show the user what the video will look like
   */
  generatePreview: publicProcedure
    .input(
      z.object({
        gestureId: z.string(),
        sponsorName: z.string().max(40),
        logoImage: z.string().optional(), // base64 data URL
        overlayText: z.string().max(100),
      })
    )
    .handler(async ({ input }) => {
      try {
        console.log(
          "[SponsorshipsRouter] Generating preview for gesture:",
          input.gestureId
        );

        // Get gesture details
        const gesture = await convex.query(api.gestures.getById, {
          id: input.gestureId as Id<"gestures">,
        });

        if (!gesture) {
          throw new Error("Gesture not found");
        }

        // Use fixed sponsor overlay config
        const overlayConfig = SPONSOR_OVERLAY_CONFIG;

        // Call Remotion service to compose video
        const response = await fetch(`${REMOTION_URL}/api/compose`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playbackId: gesture.playbackId,
            overlayImageUrl: input.logoImage || "",
            overlayText: input.overlayText,
            overlayConfig,
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(
            `Remotion service returned ${response.status}: ${error}`
          );
        }

        const result = (await response.json()) as {
          success: boolean;
          jobId: string;
          message: string;
        };

        console.log(
          "[SponsorshipsRouter] Video composition job started:",
          result.jobId
        );

        const composedPlaybackId = await pollCompositionJob(result.jobId);

        console.log(
          "[SponsorshipsRouter] Preview video ready:",
          composedPlaybackId
        );

        return {
          playbackId: composedPlaybackId,
        };
      } catch (error) {
        console.error("[SponsorshipsRouter] Generate preview error:", error);
        throw new Error(
          `Failed to generate preview: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }),

  /**
   * Create bulk sponsorships (simplified flow)
   * Creates sponsorships with contact info collected upfront, before payment
   */
  createBulkSponsorshipsSimplified: publicProcedure
    .input(
      z.object({
        gestureIds: z.array(z.string()),
        sponsorName: z.string().max(40),
        sponsorEmail: z.string().email(),
        contactFullName: z.string(),
        contactCompany: z.string().optional(),
        overlayText: z.string(),
        logoImage: z.string().optional(), // base64
        includeLogo: z.boolean(),
        durationYears: z.literal(1),
        previewVideoPlaybackId: z.string(),
        // Invoice fields
        invoiceRequested: z.boolean().optional(),
        invoiceName: z.string().optional(),
        invoiceVatNumber: z.string().optional(),
        invoiceEmail: z.string().email().optional(),
      })
    )
    .handler(async ({ input }) => {
      try {
        console.log(
          "[SponsorshipsRouter] Creating simplified bulk sponsorships..."
        );

        // Note: logoImage is not passed to the mutation - it's already baked
        // into the preview video and storing large base64 data would exceed limits
        const sponsorshipIds = await convex.mutation(
          api.sponsorships.createBulkSimplified,
          {
            gestureIds: input.gestureIds as Id<"gestures">[],
            sponsorName: input.sponsorName,
            sponsorEmail: input.sponsorEmail,
            contactFullName: input.contactFullName,
            contactCompany: input.contactCompany,
            overlayText: input.overlayText,
            includeLogo: input.includeLogo,
            durationYears: input.durationYears,
            previewVideoPlaybackId: input.previewVideoPlaybackId,
            invoiceRequested: input.invoiceRequested,
            invoiceName: input.invoiceName,
            invoiceVatNumber: input.invoiceVatNumber,
            invoiceEmail: input.invoiceEmail,
          }
        );

        console.log(
          `[SponsorshipsRouter] Created ${sponsorshipIds.length} sponsorships`
        );

        return {
          success: true,
          sponsorshipIds,
        };
      } catch (error) {
        console.error(
          "[SponsorshipsRouter] Create bulk sponsorships error:",
          error
        );
        throw new Error(
          `Failed to create bulk sponsorships: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }),

  /**
   * Create Mollie payment for multiple sponsorships
   */
  createBulkPayment: publicProcedure
    .input(
      z.object({
        sponsorshipIds: z.array(z.string()),
        amount: z.number(),
      })
    )
    .handler(async ({ input }) => {
      console.log(
        `[SponsorshipsRouter] Creating bulk payment for ${input.sponsorshipIds.length} sponsorships`
      );

      // Verify all sponsorships exist and are in pending_payment state
      const sponsorships = await Promise.all(
        input.sponsorshipIds.map((id) =>
          convex.query(api.sponsorships.getById, {
            id: id as Id<"sponsorships">,
          })
        )
      );

      const invalidSponsorships = sponsorships.filter(
        (s) => !s || s.status !== "pending_payment"
      );
      if (invalidSponsorships.length > 0) {
        throw new Error(
          "Some sponsorships are not found or not in pending_payment state"
        );
      }

      const baseUrl = process.env.CORS_ORIGIN || "http://localhost:3001";

      // Create Mollie payment with all sponsorship IDs in metadata
      const payment = await mollieClient.payments.create({
        amount: {
          currency: "EUR",
          value: (input.amount / 100).toFixed(2),
        },
        description: `Sponsorship for ${input.sponsorshipIds.length} gesture(s)`,
        redirectUrl: `${baseUrl}/sponsors/success?paymentId={id}`,
        webhookUrl: `${baseUrl}/webhooks/mollie`,
        metadata: {
          sponsorshipIds: JSON.stringify(input.sponsorshipIds),
          isBulkPayment: "true",
        },
      });

      // Update all sponsorships with the payment ID
      await Promise.all(
        input.sponsorshipIds.map((id) =>
          convex.mutation(api.sponsorships.updatePaymentId, {
            sponsorshipId: id as Id<"sponsorships">,
            molliePaymentId: payment.id,
          })
        )
      );

      console.log(
        `[SponsorshipsRouter] Bulk payment created: ${payment.id} for ${input.sponsorshipIds.length} sponsorships`
      );

      return {
        paymentId: payment.id,
        checkoutUrl: payment._links.checkout?.href || "",
      };
    }),

  /**
   * Get all sponsorships by payment ID
   */
  getSponsorshipsByPaymentId: publicProcedure
    .input(
      z.object({
        paymentId: z.string(),
      })
    )
    .handler(async ({ input }) => {
      try {
        const sponsorships = await convex.query(
          api.sponsorships.getAllByPaymentId,
          {
            molliePaymentId: input.paymentId,
          }
        );

        return sponsorships;
      } catch (error) {
        console.error(
          "[SponsorshipsRouter] Get sponsorships by payment ID error:",
          error
        );
        throw new Error(
          `Failed to get sponsorships: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }),

  /**
   * Get sponsorship data by re-edit token (for pre-filling the wizard)
   * Token is the authentication — no user login required
   */
  getByReEditToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .handler(async ({ input }) => {
      try {
        const result = await convex.query(api.sponsorships.getByReEditToken, {
          token: input.token,
        });
        return result;
      } catch (error) {
        console.error(
          "[SponsorshipsRouter] Get by re-edit token error:",
          error
        );
        throw new Error(
          `Failed to validate re-edit token: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }),

  /**
   * Resubmit a sponsorship video using a re-edit token (no payment required)
   * Generates a new preview, then submits it back for admin review
   */
  reSubmitSponsorship: publicProcedure
    .input(
      z.object({
        token: z.string(),
        gestureId: z.string(),
        logoImage: z.string().optional(), // base64 data URL
        overlayText: z.string().max(100),
        sponsorName: z.string().max(40).optional(),
      })
    )
    .handler(async ({ input }) => {
      try {
        console.log("[SponsorshipsRouter] Resubmitting sponsorship with token");

        // Validate token and fetch sponsorship data
        const tokenResult = await convex.query(
          api.sponsorships.getByReEditToken,
          { token: input.token }
        );

        if (!tokenResult) {
          throw new Error("Invalid re-edit token");
        }
        if (tokenResult.expired) {
          throw new Error("Re-edit token has expired");
        }

        const { sponsorship } = tokenResult;

        // Compose new video via Remotion using the original gesture video as base
        const composedPlaybackId = await composeVideo({
          playbackId: sponsorship.originalVideoPlaybackId,
          logoImage: input.logoImage,
          overlayText: input.overlayText,
        });

        console.log(
          "[SponsorshipsRouter] Re-edit video ready:",
          composedPlaybackId
        );

        // Save to Convex — clears token and transitions status → pending_approval
        await convex.mutation(api.sponsorships.reSubmitSponsorshipVideo, {
          token: input.token,
          previewVideoPlaybackId: composedPlaybackId,
          sponsoredVideoPlaybackId: composedPlaybackId,
          overlayText: input.overlayText,
          sponsorName: input.sponsorName,
        });

        return { success: true, playbackId: composedPlaybackId };
      } catch (error) {
        console.error(
          "[SponsorshipsRouter] Re-submit sponsorship error:",
          error
        );
        throw new Error(
          `Failed to resubmit sponsorship: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }),
};
