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

    if (!sponsorship.sponsoredVideoPlaybackId) {
      throw new Error(
        `Sponsorship missing sponsored video playback ID: ${options.sponsorshipId}`
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
