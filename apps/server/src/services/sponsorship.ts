import { api } from "@smog/convex";
import type { Id } from "@smog/convex/dataModel";
import { getSponsorOverlayConfig } from "@smog/types";
import { ConvexHttpClient } from "convex/browser";

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

export interface ProcessPaymentOptions {
  sponsorshipId: string;
  molliePaymentId: string;
  newPlaybackId?: string; // New Mux playback ID from external worker
}

/**
 * Trigger video composition for a sponsorship
 */
async function triggerVideoComposition(sponsorship: {
  _id: Id<"sponsorships">;
  gestureId: Id<"gestures">;
  sponsorName: string;
  overlayText: string;
  overlayImageStorageId?: string;
  hasLogo?: boolean;
  originalVideoPlaybackId?: string;
}): Promise<string> {
  const videoWorkerUrl =
    process.env.VIDEO_WORKER_URL || "http://localhost:3002";

  if (!sponsorship.originalVideoPlaybackId) {
    throw new Error("Original video playback ID is missing");
  }

  // Get the fixed sponsor overlay configuration
  const overlayConfig = getSponsorOverlayConfig();

  // Build overlay image URL if logo is included
  // Note: overlayImageStorageId contains the base64 data URL, pass it directly
  let overlayImageUrl: string | undefined;
  if (sponsorship.hasLogo && sponsorship.overlayImageStorageId) {
    overlayImageUrl = sponsorship.overlayImageStorageId;
  }

  console.log(
    `[Sponsorship] Triggering video composition for ${sponsorship._id}:`,
    {
      playbackId: sponsorship.originalVideoPlaybackId,
      hasLogo: !!overlayImageUrl,
      overlayText: sponsorship.overlayText,
    }
  );

  // Call video-worker to compose video
  const response = await fetch(`${videoWorkerUrl}/api/compose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      playbackId: sponsorship.originalVideoPlaybackId,
      overlayImageUrl: overlayImageUrl || "", // Empty string if no logo
      overlayText: sponsorship.overlayText,
      overlayConfig,
    }),
  });

  if (!response.ok) {
    const errorData = (await response.json()) as { error?: string };
    throw new Error(
      `Video composition failed: ${errorData.error || response.statusText}`
    );
  }

  const result = (await response.json()) as {
    success: boolean;
    jobId: string;
    message: string;
  };
  console.log(`[Sponsorship] Video composition job queued: ${result.jobId}`);

  // Poll for job completion
  const jobId = result.jobId;
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes max (5s interval)

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
    attempts++;

    const statusResponse = await fetch(
      `${videoWorkerUrl}/api/compose/status/${jobId}`
    );
    if (!statusResponse.ok) {
      console.error(
        `[Sponsorship] Failed to check job status: ${statusResponse.statusText}`
      );
      continue;
    }

    const status = (await statusResponse.json()) as {
      jobId: string;
      state: string;
      progress: number;
      result?: {
        success?: boolean;
        composedVideoPlaybackId?: string;
        error?: string;
      };
    };
    console.log(
      `[Sponsorship] Job ${jobId} status: ${status.state} (${status.progress}%)`
    );

    if (
      status.state === "completed" &&
      status.result?.composedVideoPlaybackId
    ) {
      console.log(
        `[Sponsorship] Video composition completed: ${status.result.composedVideoPlaybackId}`
      );
      return status.result.composedVideoPlaybackId;
    }

    if (status.state === "failed") {
      throw new Error(
        `Video composition job failed: ${JSON.stringify(status.result)}`
      );
    }
  }

  throw new Error("Video composition timed out after 5 minutes");
}

/**
 * Process a successful payment and mark sponsorship as pending approval
 *
 * The workflow is:
 * LEGACY FLOW (sponsoredVideoPlaybackId already exists):
 * 1. User creates sponsorship (video already composed)
 * 2. User completes payment
 * 3. Webhook marks sponsorship as "pending_approval"
 * 4. Admin reviews and approves/rejects
 * 5. If approved, sponsorship becomes "active" and gesture video is swapped
 *
 * SIMPLIFIED FLOW (no sponsoredVideoPlaybackId):
 * 1. User creates sponsorship (NO video composition yet)
 * 2. User completes payment
 * 3. Webhook triggers video composition
 * 4. Webhook marks sponsorship as "pending_approval"
 * 5. Admin reviews and approves/rejects
 * 6. If approved, sponsorship becomes "active" and gesture video is swapped
 */
export async function processSuccessfulPayment(
  options: ProcessPaymentOptions
): Promise<void> {
  try {
    console.log(
      "[Sponsorship] Processing payment for sponsorship:",
      options.sponsorshipId
    );

    // Get sponsorship details from Convex
    const sponsorship = await convex.query(api.sponsorships.getById, {
      id: options.sponsorshipId as Id<"sponsorships">,
    });

    if (!sponsorship) {
      throw new Error(`Sponsorship not found: ${options.sponsorshipId}`);
    }

    // Allow idempotent webhook calls - if already pending_approval, payment was already processed
    if (
      sponsorship.status === "pending_approval" ||
      sponsorship.status === "active"
    ) {
      console.log(
        `[Sponsorship] Sponsorship already processed (status: ${sponsorship.status}), webhook is idempotent - returning success`
      );
      return;
    }

    if (sponsorship.status !== "pending_payment") {
      throw new Error(
        `Invalid sponsorship status for payment processing: ${sponsorship.status}`
      );
    }

    // Check if this is simplified flow (no sponsoredVideoPlaybackId yet)
    if (!sponsorship.sponsoredVideoPlaybackId) {
      console.log(
        "[Sponsorship] Simplified flow detected - triggering video composition"
      );

      // Trigger video composition
      const newPlaybackId = await triggerVideoComposition(sponsorship);

      // Update sponsorship with new playback ID
      await convex.mutation(api.sponsorships.updateVideoPlaybackId, {
        sponsorshipId: options.sponsorshipId as Id<"sponsorships">,
        sponsoredVideoPlaybackId: newPlaybackId,
      });

      console.log(
        `[Sponsorship] Video composed successfully: ${newPlaybackId}`
      );
    }

    console.log(
      "[Sponsorship] Marking sponsorship as paid and awaiting admin approval"
    );

    // Mark sponsorship as paid - changes status from "pending_payment" to "pending_approval"
    // This makes it appear in the admin approval queue
    await convex.mutation(api.sponsorships.markAsAwaitingApproval, {
      sponsorshipId: options.sponsorshipId as Id<"sponsorships">,
    });

    console.log(
      "[Sponsorship] Sponsorship marked as pending approval:",
      options.sponsorshipId
    );
  } catch (error) {
    console.error("[Sponsorship] Error processing payment:", error);
    throw error;
  }
}
