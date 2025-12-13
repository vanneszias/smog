import type { Id } from "@smog/convex/dataModel";
import type { client } from "@/utils/orpc";
import { convertFileToBase64 } from "./imageValidation";

export type CreateSponsorshipPaymentParams = {
  gestureId: Id<"gestures">;
  gestureName: string;
  sponsorName: string;
  sponsorEmail: string;
  imageFile: File;
  overlayText: string;
  tempVideoUrl: string;
  durationWeeks: number;
  totalCents: number;
  createSponsorship: (params: {
    gestureId: Id<"gestures">;
    sponsorName: string;
    sponsorEmail: string;
    overlayImageStorageId: string;
    overlayText: string;
    sponsoredVideoStorageId: string;
    durationWeeks: number;
    paymentAmount: number;
  }) => Promise<Id<"sponsorships">>;
  updatePaymentId: (params: {
    sponsorshipId: Id<"sponsorships">;
    molliePaymentId: string;
  }) => Promise<null>;
};

export type CreateSponsorshipPaymentResult = {
  success: boolean;
  checkoutUrl?: string;
  error?: string;
};

export async function createSponsorshipPayment(
  params: CreateSponsorshipPaymentParams,
  orpcClient: typeof client
): Promise<CreateSponsorshipPaymentResult> {
  const {
    gestureId,
    gestureName,
    sponsorName,
    sponsorEmail,
    imageFile,
    overlayText,
    tempVideoUrl,
    durationWeeks,
    totalCents,
    createSponsorship,
    updatePaymentId,
  } = params;

  try {
    // Convert image to base64 for storage
    const base64Image = await convertFileToBase64(imageFile);

    // Note: The video composition will be finalized by the external video service
    // after payment confirmation. The webhook handler will receive the new playback ID
    // from the external service and update the sponsorship record.

    // Create sponsorship with base64 image data
    const sponsorshipId = await createSponsorship({
      gestureId,
      sponsorName,
      sponsorEmail,
      overlayImageStorageId: base64Image, // Store base64 image data
      overlayText,
      sponsoredVideoStorageId: base64Image, // Placeholder - will be updated with Mux playback ID after payment
      durationWeeks,
      paymentAmount: totalCents,
    });

    // Create Mollie payment
    const paymentResponse = await orpcClient.sponsorships.createPayment({
      sponsorshipId,
      amount: totalCents,
      description: `Sponsorship: ${gestureName} (${durationWeeks} weeks)`,
      redirectUrl: `${window.location.origin}/sponsors/success?sponsorshipId=${sponsorshipId}&tempVideoUrl=${encodeURIComponent(tempVideoUrl)}`,
    });

    // Update sponsorship with payment ID
    await updatePaymentId({
      sponsorshipId,
      molliePaymentId: paymentResponse.paymentId,
    });

    if (!paymentResponse.checkoutUrl) {
      throw new Error("No checkout URL received");
    }

    return {
      success: true,
      checkoutUrl: paymentResponse.checkoutUrl,
    };
  } catch (err) {
    console.error("Error creating sponsorship:", err);
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Failed to create sponsorship",
    };
  }
}
