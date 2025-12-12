import { mollieClient } from "@smog/auth";
import { api } from "@smog/convex";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { publicProcedure } from "../index";

// This will be imported from the server package in the server context
// We'll dynamically import to avoid bundling server code in the client
let addVideoCompositionJob: (data: {
  playbackId: string;
  overlayImageStorageId: string;
  overlayText: string;
  uploadUrl: string;
}) => Promise<string>;

let getJobStatus: (
  jobId: string
) => Promise<{ state: string; progress: number; result?: unknown }>;

// Initialize Convex client for server-side operations
const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

export const sponsorshipsRouter = {
  /**
   * Start video composition job
   * Returns job ID for status polling
   */
  composeVideo: publicProcedure
    .input(
      z.object({
        playbackId: z.string(),
        overlayImageStorageId: z.string(),
        overlayText: z.string().max(100),
      })
    )
    .handler(async ({ input }) => {
      try {
        // Lazy load the server-only modules
        if (!addVideoCompositionJob) {
          const queueModule = await import(
            "../../../apps/server/src/services/video-composition-queue.js"
          );
          addVideoCompositionJob = queueModule.addVideoCompositionJob;
          getJobStatus = queueModule.getJobStatus;
        }

        // Generate signed upload URL from Convex
        const uploadUrl = await convex.mutation(
          api.sponsorships.generateUploadUrl
        );

        // Add job to queue
        const jobId = await addVideoCompositionJob({
          playbackId: input.playbackId,
          overlayImageStorageId: input.overlayImageStorageId,
          overlayText: input.overlayText,
          uploadUrl,
        });

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
   * Get status of video composition job
   */
  getCompositionStatus: publicProcedure
    .input(
      z.object({
        jobId: z.string(),
      })
    )
    .handler(async ({ input }) => {
      try {
        // Lazy load the server-only modules
        if (!getJobStatus) {
          const queueModule = await import(
            "../../../apps/server/src/services/video-composition-queue.js"
          );
          getJobStatus = queueModule.getJobStatus;
        }

        const status = await getJobStatus(input.jobId);
        return status;
      } catch (error) {
        console.error("[SponsorshipsRouter] Get status error:", error);
        throw new Error(
          `Failed to get job status: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }),

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
