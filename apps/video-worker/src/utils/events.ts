/**
 * Event emitter for video processing progress
 * Provides event-based progress tracking instead of callbacks
 */

import { EventEmitter } from "node:events";

export type ProgressEvents = {
  "download:start": () => void;
  "download:progress": (percent: number) => void;
  "download:complete": () => void;
  "image:start": () => void;
  "image:progress": (percent: number) => void;
  "image:complete": () => void;
  "compose:start": () => void;
  "compose:progress": (percent: number) => void;
  "compose:complete": () => void;
  "upload:start": () => void;
  "upload:progress": (percent: number) => void;
  "upload:complete": (playbackId: string) => void;
  "cleanup:start": () => void;
  "cleanup:complete": () => void;
  error: (error: Error) => void;
  complete: (playbackId: string) => void;
};

/**
 * Typed event emitter for video processing events
 */
export class VideoProcessingEmitter extends EventEmitter {
  on<K extends keyof ProgressEvents>(
    event: K,
    listener: ProgressEvents[K]
  ): this {
    return super.on(event, listener);
  }

  emit<K extends keyof ProgressEvents>(
    event: K,
    ...args: Parameters<ProgressEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  once<K extends keyof ProgressEvents>(
    event: K,
    listener: ProgressEvents[K]
  ): this {
    return super.once(event, listener);
  }
}

/**
 * Calculate overall progress percentage across all steps
 */
export const calculateOverallProgress = (
  step: keyof ProgressEvents,
  stepProgress: number
): number => {
  // Weight each step: download (30%), image (10%), compose (40%), upload (20%)
  const weights = {
    download: { start: 0, end: 30 },
    image: { start: 30, end: 40 },
    compose: { start: 40, end: 80 },
    upload: { start: 80, end: 100 },
  };

  const stepName = step.split(":")[0] as keyof typeof weights;
  const weight = weights[stepName];

  if (!weight) {
    return 0;
  }

  return Math.round(
    weight.start + ((weight.end - weight.start) * stepProgress) / 100
  );
};
