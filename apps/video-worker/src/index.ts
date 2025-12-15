/**
 * Video Processing Pipeline - Public API
 *
 * This file exports all the main components of the refactored video processing pipeline.
 * Use this for importing services, utilities, and the main VideoComposer.
 */

export type {
  VideoComposerOptions,
  VideoComposerResult,
} from "./core/VideoComposer";
// Core
export { createVideoComposer, VideoComposer } from "./core/VideoComposer";
export type {
  FFmpegProgress,
  OverlayImageConfig,
  OverlayTextConfig,
  VideoMetadata,
} from "./services/ffmpeg";
export { FFmpegFilterBuilder, FFmpegService } from "./services/ffmpeg";
export type { ImageProcessingOptions } from "./services/image";
export { ImageService } from "./services/image";
export type {
  MuxCredentials,
  MuxDownloadOptions,
  MuxUploadOptions,
} from "./services/mux";
// Services
export { MuxService } from "./services/mux";
export type { VideoErrorCodeType } from "./types/errors";
// Types & Errors
export {
  createConfigError,
  createDownloadError,
  createFFmpegError,
  createImageProcessingError,
  createUploadError,
  VideoErrorCode,
  VideoProcessingError,
} from "./types/errors";
export type { Point, Size, VideoDimensions } from "./utils/coordinates";
// Utilities
export {
  centerToTopLeft,
  convertOverlayPosition,
  convertTextPosition,
  percentToPixels,
  validatePercentage,
} from "./utils/coordinates";
export type { ProgressEvents } from "./utils/events";
export {
  calculateOverallProgress,
  VideoProcessingEmitter,
} from "./utils/events";
export type { WorkspaceFiles } from "./utils/filesystem";
export {
  cleanupWorkspace,
  createWorkspace,
  formatFileSize,
  getFileSize,
  verifyFileExists,
} from "./utils/filesystem";
export {
  calculateLineHeight,
  splitTextIntoLines,
  wrapText,
} from "./utils/text";
