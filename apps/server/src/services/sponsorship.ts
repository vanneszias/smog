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
 * Process a successful payment and mark sponsorship as pending approval
 *
 * The workflow is:
 * 1. User creates sponsorship (video already composed)
 * 2. User completes payment
 * 3. Webhook marks sponsorship as "pending_payment"
 * 4. Admin reviews and approves/rejects
 * 5. If approved, sponsorship becomes "active" and gesture video is swapped
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

    if (!sponsorship.sponsoredVideoPlaybackId) {
      throw new Error(
        `Sponsorship missing sponsored video playback ID: ${options.sponsorshipId}`
      );
    }

    console.log(
      "[Sponsorship] Updating sponsorship payment status to pending_payment"
    );

    // Update sponsorship with payment info - mark as pending admin approval
    // The sponsored video playback ID is already stored in the sponsorship record
    await convex.mutation(api.sponsorships.updatePaymentId, {
      sponsorshipId: options.sponsorshipId as Id<"sponsorships">,
      molliePaymentId: options.molliePaymentId,
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
