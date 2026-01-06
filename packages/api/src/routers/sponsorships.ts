import { mollieClient } from "@smog/auth/server";
import { api } from "@smog/convex";
import type { Id } from "@smog/convex/dataModel";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { publicProcedure } from "../index";

// Initialize Convex client for server-side operations
const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

// Get video worker URL from environment
const VIDEO_WORKER_URL =
  process.env.VIDEO_WORKER_URL || "http://localhost:3002";

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
   * Create bulk sponsorships for multiple gestures
   */
  createBulkSponsorships: publicProcedure
    .input(
      z.object({
        gestureIds: z.array(z.string()),
        sponsorName: z.string(),
        sponsorEmail: z.string(),
        overlayImageStorageId: z.string(),
        overlayText: z.string(),
        sponsoredVideoPlaybackIds: z.array(z.string()),
        durationWeeks: z.number(),
        paymentAmountPerGesture: z.number(),
      })
    )
    .handler(async ({ input }) => {
      try {
        console.log("[SponsorshipsRouter] Creating bulk sponsorships...");

        const sponsorshipIds = await convex.mutation(
          api.sponsorships.createBulk,
          {
            gestureIds: input.gestureIds as Id<"gestures">[],
            sponsorName: input.sponsorName,
            sponsorEmail: input.sponsorEmail,
            overlayImageStorageId: input.overlayImageStorageId,
            overlayText: input.overlayText,
            sponsoredVideoPlaybackIds: input.sponsoredVideoPlaybackIds,
            durationWeeks: input.durationWeeks,
            paymentAmountPerGesture: input.paymentAmountPerGesture,
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
   * Start video composition job using video-worker service
   */
  composeVideo: publicProcedure
    .input(
      z.object({
        playbackId: z.string(),
        overlayImageUrl: z.string(), // Convex storage URL or base64 data URL
        overlayText: z.string().max(100),
        overlayConfig: z.object({
          image: z.object({
            x: z.number().min(0).max(100),
            y: z.number().min(0).max(100),
            width: z.number().min(1).max(100),
            height: z.number().min(1).max(100),
          }),
          text: z.object({
            x: z.number().min(0).max(100),
            y: z.number().min(0).max(100),
            fontSize: z.number().min(0.5).max(20),
            color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
          }),
          animation: z.object({
            startTime: z.number().min(1).max(60),
            fadeInDuration: z.number().min(0).max(5),
          }),
        }),
      })
    )
    .handler(async ({ input }) => {
      try {
        console.log("[SponsorshipsRouter] Starting video composition...");
        console.log("[SponsorshipsRouter] Video worker URL:", VIDEO_WORKER_URL);

        // Call video-worker service
        const response = await fetch(`${VIDEO_WORKER_URL}/api/compose`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playbackId: input.playbackId,
            overlayImageUrl: input.overlayImageUrl,
            overlayText: input.overlayText,
            overlayConfig: input.overlayConfig,
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Video worker returned ${response.status}: ${error}`);
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

        return {
          success: result.success,
          jobId: result.jobId,
        };
      } catch (error) {
        console.error("[SponsorshipsRouter] Compose video error:", error);
        throw new Error(
          `Failed to start video composition: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }),

  /**
   * Get status of video composition job from video-worker service
   */
  getCompositionStatus: publicProcedure
    .input(
      z.object({
        jobId: z.string(),
      })
    )
    .handler(async ({ input }) => {
      try {
        console.log("[SponsorshipsRouter] Checking job status:", input.jobId);

        // Poll video-worker service
        const response = await fetch(
          `${VIDEO_WORKER_URL}/api/compose/status/${input.jobId}`
        );

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Video worker returned ${response.status}: ${error}`);
        }

        const status = (await response.json()) as {
          jobId: string;
          state: string;
          progress: number;
          result?: {
            success: boolean;
            composedVideoPlaybackId?: string;
            error?: string;
          };
        };

        console.log(
          `[SponsorshipsRouter] Job ${input.jobId} status: ${status.state} (${status.progress}%)`
        );

        return status;
      } catch (error) {
        console.error("[SponsorshipsRouter] Get status error:", error);
        throw new Error(
          `Failed to get job status: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }),

  /**
   * Create Mollie payment
   */
  createPayment: publicProcedure
    .input(
      z.object({
        sponsorshipId: z.string(),
        amount: z.number(),
        description: z.string(),
        redirectUrl: z.string(),
      })
    )
    .handler(async ({ input }) => {
      // Verify sponsorship exists
      const sponsorship = await convex.query(api.sponsorships.getById, {
        id: input.sponsorshipId as Id<"sponsorships">,
      });

      if (!sponsorship) {
        throw new Error("Sponsorship not found");
      }

      if (sponsorship.status !== "pending") {
        throw new Error("Sponsorship is not in pending state");
      }

      // Create Mollie payment
      const payment = await mollieClient.payments.create({
        amount: {
          currency: "EUR",
          value: (input.amount / 100).toFixed(2),
        },
        description: input.description,
        redirectUrl: input.redirectUrl,
        webhookUrl: `${process.env.CORS_ORIGIN || "http://localhost:3000"}/webhooks/mollie`,
        metadata: {
          sponsorshipId: input.sponsorshipId,
        },
      });

      return {
        paymentId: payment.id,
        checkoutUrl: payment._links.checkout?.href,
      };
    }),

  /**
   * Create Mollie payment for multiple sponsorships
   */
  createBulkPayment: publicProcedure
    .input(
      z.object({
        sponsorshipIds: z.array(z.string()),
        totalAmount: z.number(),
        description: z.string(),
        redirectUrl: z.string(),
      })
    )
    .handler(async ({ input }) => {
      console.log(
        `[SponsorshipsRouter] Creating bulk payment for ${input.sponsorshipIds.length} sponsorships`
      );

      // Verify all sponsorships exist and are in pending state
      const sponsorships = await Promise.all(
        input.sponsorshipIds.map((id) =>
          convex.query(api.sponsorships.getById, {
            id: id as Id<"sponsorships">,
          })
        )
      );

      const invalidSponsorships = sponsorships.filter(
        (s) => !s || s.status !== "pending"
      );
      if (invalidSponsorships.length > 0) {
        throw new Error(
          "Some sponsorships are not found or not in pending state"
        );
      }

      // Create Mollie payment with all sponsorship IDs in metadata
      const payment = await mollieClient.payments.create({
        amount: {
          currency: "EUR",
          value: (input.totalAmount / 100).toFixed(2),
        },
        description: input.description,
        redirectUrl: input.redirectUrl,
        webhookUrl: `${process.env.CORS_ORIGIN || "http://localhost:3000"}/webhooks/mollie`,
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
        checkoutUrl: payment._links.checkout?.href,
      };
    }),
};
