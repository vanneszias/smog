/**
 * Composition step type definitions
 * Single responsibility: Define all step-related types
 */

export type CompositionStep =
  | "idle"
  | "preparing"
  | "uploading"
  | "queued"
  | "downloading"
  | "processing-image"
  | "composing"
  | "uploading-result"
  | "completed"
  | "failed";

export type CompositionState = "waiting" | "active" | "completed" | "failed";

export const STEP_MESSAGES: Record<CompositionStep, string> = {
  idle: "Ready to start",
  preparing: "Preparing overlay...",
  uploading: "Uploading to server...",
  queued: "Waiting for video worker...",
  downloading: "Downloading original video...",
  "processing-image": "Processing overlay image...",
  composing: "Composing video with FFmpeg...",
  "uploading-result": "Uploading composed video...",
  completed: "Video composition complete!",
  failed: "Composition failed",
};

export const STEP_ICONS: Record<CompositionStep, string> = {
  idle: "⏸️",
  preparing: "📋",
  uploading: "📤",
  queued: "⏳",
  downloading: "📥",
  "processing-image": "🖼️",
  composing: "🎬",
  "uploading-result": "📤",
  completed: "✅",
  failed: "❌",
};
