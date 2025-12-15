/**
 * Composition Module Barrel Export
 * Single responsibility: Export all public APIs from the composition module
 */

// Event System
export { CompositionEventEmitter } from "./EventEmitter";
export type {
  CompositionCompleteEvent,
  CompositionErrorEvent,
  CompositionEvent,
  CompositionEventListener,
  CompositionProgressEvent,
  CompositionStepChangeEvent,
} from "./events";
// Utilities (internal use, but exported for testing)
export { ImageConverter } from "./ImageConverter";
export { ProgressTracker } from "./ProgressTracker";
export {
  type JobStatus,
  type PollerConfig,
  StatusPoller,
} from "./StatusPoller";
// Types
export type { CompositionStep } from "./types";
export { STEP_MESSAGES } from "./types";
// Core Service
export {
  type ComposeOptions,
  type ComposeResult,
  VideoCompositionService,
} from "./VideoCompositionService";
