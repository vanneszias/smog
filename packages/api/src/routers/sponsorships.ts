import { mollieClient } from "@smog/auth";
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
   * Start video composition job using video-worker service
   */
  composeVideo: publicProcedure
    .input(
      z.object({
        playbackId: z.string(),
        overlayImageUrl: z.string(), // Convex storage URL or base64 data URL
        overlayText: z.string().max(100),
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
};
