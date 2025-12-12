import { api } from "@smog/convex";
import type { Id } from "@smog/convex/dataModel";
import { ConvexHttpClient } from "convex/browser";
import { uploadVideoToMux } from "./mux";

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

export type ProcessPaymentOptions = {
  sponsorshipId: string;
  molliePaymentId: string;
};

/**
 * Process a successful payment and upload the sponsored video to MUX
 * This is called from the Mollie webhook after payment is confirmed
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

    console.log("[Sponsorship] Getting composed video from storage");

    // Get the composed video URL from Convex storage
    const videoStorageId = sponsorship.sponsoredVideoStorageId;
    if (!videoStorageId) {
      throw new Error("No video storage ID found in sponsorship");
    }

    const videoUrl = await convex.query(api.sponsorships.getFileUrl, {
      storageId: videoStorageId as Id<"_storage">,
    });

    if (!videoUrl) {
      throw new Error("Could not get video URL from storage");
    }

    console.log("[Sponsorship] Uploading video to MUX");

    // Upload video to MUX
    const playbackId = await uploadVideoToMux({
      videoUrl,
      gestureId: sponsorship.gestureId,
    });

    console.log(
      "[Sponsorship] Video uploaded successfully, playback ID:",
      playbackId
    );

    // Update sponsorship with payment info and playback ID
    await convex.mutation(api.sponsorships.updateAfterPayment, {
      sponsorshipId: options.sponsorshipId as Id<"sponsorships">,
      molliePaymentId: options.molliePaymentId,
      sponsoredVideoPlaybackId: playbackId,
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
