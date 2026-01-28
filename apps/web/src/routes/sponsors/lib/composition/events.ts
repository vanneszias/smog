/**
 * Composition event definitions
 * Single responsibility: Define event types and payload structures
 */

import type { CompositionStep } from "./types";

export type CompositionEventType =
  | "progress"
  | "step-change"
  | "error"
  | "complete";

export interface CompositionProgressEvent {
  type: "progress";
  step: CompositionStep;
  progress: number;
  message: string;
}

export interface CompositionStepChangeEvent {
  type: "step-change";
  previousStep: CompositionStep;
  currentStep: CompositionStep;
  progress: number;
}

export interface CompositionErrorEvent {
  type: "error";
  step: CompositionStep;
  message: string;
  suggestion?: string;
  error?: Error;
}

export interface CompositionCompleteEvent {
  type: "complete";
  playbackId: string;
  duration: number;
}

export type CompositionEvent =
  | CompositionProgressEvent
  | CompositionStepChangeEvent
  | CompositionErrorEvent
  | CompositionCompleteEvent;

export type CompositionEventListener = (event: CompositionEvent) => void;
