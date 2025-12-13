import { api } from "@smog/convex";
import type { Id } from "@smog/convex/dataModel";
import { ConvexHttpClient } from "convex/browser";

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

export type ProcessPaymentOptions = {
  sponsorshipId: string;
  molliePaymentId: string;
  newPlaybackId?: string; // New Mux playback ID from external worker
};

/**
 * Process a successful payment and update sponsorship
 *
 * TODO: Your external worker should have already:
 * 1. Composed the video
 * 2. Uploaded to Mux
 * 3. Returned the new playback ID
 *
 * This function just updates the sponsorship record with the new playback ID
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

    if (sponsorship.status !== "pending") {
      console.warn(
        `[Sponsorship] Sponsorship is not pending (status: ${sponsorship.status}), skipping`
      );
      return;
    }

    // TODO: Get the new playback ID from your external worker
    // This could be:
    // 1. Passed via payment metadata
    // 2. Stored in your database by the worker
    // 3. Retrieved from your worker service API
    const newPlaybackId = options.newPlaybackId || "TODO_GET_FROM_WORKER";

    console.log(
      "[Sponsorship] Updating sponsorship with new playback ID:",
      newPlaybackId
    );

    // Update sponsorship with payment info and new playback ID
    await convex.mutation(api.sponsorships.updateAfterPayment, {
      sponsorshipId: options.sponsorshipId as Id<"sponsorships">,
      molliePaymentId: options.molliePaymentId,
      sponsoredVideoPlaybackId: newPlaybackId,
    });

    console.log(
      "[Sponsorship] Sponsorship activated successfully:",
      options.sponsorshipId
    );
  } catch (error) {
    console.error("[Sponsorship] Error processing payment:", error);
    throw error;
  }
}
