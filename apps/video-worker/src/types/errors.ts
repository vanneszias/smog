/**
 * Custom error classes for video processing
 * Provides specific, actionable error messages for better debugging
 */

export const VideoErrorCode = {
  // Download errors
  DOWNLOAD_FAILED: "DOWNLOAD_FAILED",
  INVALID_PLAYBACK_ID: "INVALID_PLAYBACK_ID",
  MASTER_ACCESS_DENIED: "MASTER_ACCESS_DENIED",

  // Image processing errors
  IMAGE_DOWNLOAD_FAILED: "IMAGE_DOWNLOAD_FAILED",
  IMAGE_TOO_LARGE: "IMAGE_TOO_LARGE",
  IMAGE_PROCESSING_FAILED: "IMAGE_PROCESSING_FAILED",
  INVALID_IMAGE_FORMAT: "INVALID_IMAGE_FORMAT",

  // FFmpeg errors
  FFMPEG_PROBE_FAILED: "FFMPEG_PROBE_FAILED",
  FFMPEG_COMPOSITION_FAILED: "FFMPEG_COMPOSITION_FAILED",
  INVALID_VIDEO_FORMAT: "INVALID_VIDEO_FORMAT",

  // Upload errors
  UPLOAD_FAILED: "UPLOAD_FAILED",
  ASSET_CREATION_TIMEOUT: "ASSET_CREATION_TIMEOUT",
  ASSET_PROCESSING_FAILED: "ASSET_PROCESSING_FAILED",

  // Configuration errors
  INVALID_CONFIG: "INVALID_CONFIG",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",

  // General errors
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
  CLEANUP_FAILED: "CLEANUP_FAILED",
} as const;

export type VideoErrorCodeType =
  (typeof VideoErrorCode)[keyof typeof VideoErrorCode];

export class VideoProcessingError extends Error {
  public readonly code: VideoErrorCodeType;
  public readonly details: {
    message: string;
    suggestion?: string;
    originalError?: Error;
    metadata?: Record<string, unknown>;
  };

  constructor(
    code: VideoErrorCodeType,
    details: {
      message: string;
      suggestion?: string;
      originalError?: Error;
      metadata?: Record<string, unknown>;
    }
  ) {
    super(details.message);
    this.code = code;
    this.details = details;
    this.name = "VideoProcessingError";
    Error.captureStackTrace?.(this, VideoProcessingError);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      suggestion: this.details.suggestion,
      metadata: this.details.metadata,
      stack: this.stack,
    };
  }
}

// Helper functions to create specific errors
export const createDownloadError = (
  playbackId: string,
  originalError?: Error
): VideoProcessingError =>
  new VideoProcessingError(VideoErrorCode.DOWNLOAD_FAILED, {
    message: `Failed to download video with playback ID: ${playbackId}`,
    suggestion:
      "Verify that the playback ID is correct and the video exists in Mux",
    originalError,
    metadata: { playbackId },
  });

export const createImageProcessingError = (
  imageUrl: string,
  originalError?: Error
): VideoProcessingError =>
  new VideoProcessingError(VideoErrorCode.IMAGE_PROCESSING_FAILED, {
    message: `Failed to process overlay image from: ${imageUrl}`,
    suggestion: "Ensure the image URL is accessible and in a valid format",
    originalError,
    metadata: { imageUrl },
  });

export const createFFmpegError = (
  operation: string,
  originalError?: Error
): VideoProcessingError =>
  new VideoProcessingError(VideoErrorCode.FFMPEG_COMPOSITION_FAILED, {
    message: `FFmpeg ${operation} failed`,
    suggestion:
      "Check FFmpeg logs for details. Ensure video and overlay files are valid",
    originalError,
  });

export const createUploadError = (
  reason: string,
  originalError?: Error
): VideoProcessingError =>
  new VideoProcessingError(VideoErrorCode.UPLOAD_FAILED, {
    message: `Failed to upload composed video: ${reason}`,
    suggestion: "Check Mux credentials and network connectivity",
    originalError,
  });

export const createConfigError = (
  field: string,
  reason: string
): VideoProcessingError =>
  new VideoProcessingError(VideoErrorCode.INVALID_CONFIG, {
    message: `Invalid configuration for ${field}: ${reason}`,
    suggestion:
      "Check the configuration values and ensure they are within valid ranges",
    metadata: { field, reason },
  });
