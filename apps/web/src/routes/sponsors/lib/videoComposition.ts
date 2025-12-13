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

    // TODO: Implement proper polling when external video service is ready
    // For now, return a success indicator that the job was started
    onProgress(100);

    return {
      success: true,
      jobId,
      error:
        "Video composition feature requires an external video service to be implemented.",
    };
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
