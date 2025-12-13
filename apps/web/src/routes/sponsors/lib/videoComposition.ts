import type { client } from "@/utils/orpc";
import { convertFileToBase64 } from "./imageValidation";

export type ComposeVideoParams = {
  imageFile: File;
  overlayText: string;
  playbackId: string;
  onProgress: (progress: number) => void;
};

export type ComposeVideoResult = {
  success: boolean;
  jobId?: string;
  composedVideoPlaybackId?: string;
  error?: string;
};

export async function composeVideo(
  params: ComposeVideoParams,
  orpcClient: typeof client
): Promise<ComposeVideoResult> {
  const { imageFile, overlayText, playbackId, onProgress } = params;

  try {
    console.log("[Sponsors] Starting video composition...");
    onProgress(5);

    // Convert overlay image to base64 data URL
    console.log("[Sponsors] Converting overlay image to base64...");
    const base64Image = await convertFileToBase64(imageFile);

    onProgress(10);
    console.log("[Sponsors] Image converted to base64");

    // Start server-side video composition job
    console.log("[Sponsors] Starting server-side video composition...");
    const composeResponse = await orpcClient.sponsorships.composeVideo({
      playbackId,
      overlayImageUrl: base64Image,
      overlayText,
    });

    if (!(composeResponse.success && composeResponse.jobId)) {
      throw new Error("Failed to start video composition");
    }

    const jobId = composeResponse.jobId;
    console.log("[Sponsors] Job started with ID:", jobId);
    onProgress(15);

    // Poll for job completion
    console.log("[Sponsors] Polling for job completion...");
    let pollAttempts = 0;
    const maxAttempts = 300; // 5 minutes (poll every 1 second)
    const pollInterval = 1000; // 1 second

    while (pollAttempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      pollAttempts++;

      const status = await orpcClient.sponsorships.getCompositionStatus({
        jobId,
      });

      console.log(
        `[Sponsors] Job status: ${status.state} (${status.progress}%)`
      );

      // Update progress (15% to 95% based on actual job progress)
      const progressPercent = 15 + Math.min(80, (status.progress / 100) * 80);
      onProgress(Math.round(progressPercent));

      if (status.state === "completed") {
        if (status.result?.success && status.result?.composedVideoPlaybackId) {
          console.log(
            "[Sponsors] Video composition completed!",
            status.result.composedVideoPlaybackId
          );
          onProgress(100);

          return {
            success: true,
            jobId,
            composedVideoPlaybackId: status.result.composedVideoPlaybackId,
          };
        }
        throw new Error("Composition completed but no playback ID returned");
      }

      if (status.state === "failed") {
        throw new Error(
          `Video composition failed: ${status.result?.error || "Unknown error"}`
        );
      }

      // States: waiting, active, completed, failed
    }

    throw new Error(`Video composition timed out after ${maxAttempts} seconds`);
  } catch (err) {
    console.error("[Sponsors] Video composition error:", err);
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to compose video. Please try again.",
    };
  }
}
