import { mollieClient } from "@smog/auth";
import { api } from "@smog/convex";
import type { Id } from "@smog/convex/dataModel";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { publicProcedure } from "../index";

// Initialize Convex client for server-side operations
const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

export const sponsorshipsRouter = {
  /**
   * Start video composition job using external service
   *
   * TODO: Implement this to call your external video service
   * Your service should:
   * 1. Download original video from Mux using playbackId
   * 2. Compose video with overlay image and text
   * 3. Upload composed video to Mux
   * 4. Return new Mux playback ID
   */
  composeVideo: publicProcedure
    .input(
      z.object({
        playbackId: z.string(),
        overlayImageUrl: z.string(), // Base64 data URL or blob URL from client
        overlayText: z.string().max(100),
      })
    )
    .handler(async () => {
      try {
        console.log("[SponsorshipsRouter] Starting video composition...");

        // TODO: Call your external video service here
        // const result = await fetch('http://localhost:3002/api/compose', {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify({
        //     playbackId: input.playbackId,
        //     overlayImageUrl: input.overlayImageUrl,
        //     overlayText: input.overlayText
        //   })
        // });

        // For now, return a placeholder job ID
        const jobId = `job-${Date.now()}`;

        return {
          success: true,
          jobId,
        };
      } catch (error) {
        console.error("[SponsorshipsRouter] Compose video error:", error);
        throw new Error(
          `Failed to start video composition: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }),

  /**
   * Get status of video composition job from external service
   *
   * TODO: Implement this to poll your external video service
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

        // TODO: Poll your external video service here
        // const response = await fetch(`http://localhost:3002/api/compose/status/${input.jobId}`);
        // const status = await response.json();
        // return status;

        // For now, return placeholder status
        return {
          state: "waiting" as const,
          progress: 0,
          result: undefined,
        };
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
