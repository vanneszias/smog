/**
 * React hook for video composition with event-based progress
 * Single responsibility: Provide React integration for VideoCompositionService
 */

import type { OverlayConfig } from "@smog/types";
import { useEffect, useRef, useState } from "react";
import { client } from "@/utils/orpc";
import type { CompositionStep } from "../lib/composition/types";
import {
  type ComposeOptions,
  type ComposeResult,
  VideoCompositionService,
} from "../lib/composition/VideoCompositionService";

export type UseVideoCompositionState = {
  // Status
  isComposing: boolean;
  isComplete: boolean;
  hasError: boolean;

  // Progress
  step: CompositionStep;
  progress: number;
  message: string;

  // Result
  playbackId?: string;
  error?: string;
  duration?: number;
};

export type UseVideoCompositionActions = {
  compose: (
    options: Omit<ComposeOptions, "overlayConfig"> & {
      overlayConfig: OverlayConfig;
    }
  ) => Promise<ComposeResult>;
  cancel: () => void;
  reset: () => void;
};

export type UseVideoCompositionReturn = UseVideoCompositionState &
  UseVideoCompositionActions;

const initialState: UseVideoCompositionState = {
  isComposing: false,
  isComplete: false,
  hasError: false,
  step: "idle",
  progress: 0,
  message: "",
};

/**
 * Hook for composing videos with real-time progress updates
 */
export function useVideoComposition(): UseVideoCompositionReturn {
  const [state, setState] = useState<UseVideoCompositionState>(initialState);
  const serviceRef = useRef<VideoCompositionService | null>(null);

  // Initialize service
  useEffect(() => {
    const service = new VideoCompositionService(client);
    const emitter = service.getEmitter();

    // Subscribe to all events
    const unsubscribe = emitter.subscribe((event) => {
      if (event.type === "progress") {
        setState((prev) => ({
          ...prev,
          step: event.step,
          progress: event.progress,
          message: event.message,
        }));
      } else if (event.type === "step-change") {
        setState((prev) => ({
          ...prev,
          step: event.currentStep,
          progress: event.progress,
        }));
      } else if (event.type === "error") {
        setState((prev) => ({
          ...prev,
          hasError: true,
          error: event.message,
          isComposing: false,
        }));
      } else if (event.type === "complete") {
        setState((prev) => ({
          ...prev,
          isComplete: true,
          isComposing: false,
          playbackId: event.playbackId,
          duration: event.duration,
          progress: 100,
        }));
      }
    });

    serviceRef.current = service;

    // Cleanup on unmount
    return () => {
      unsubscribe();
      service.cancel();
    };
  }, []);

  const compose = async (
    options: Omit<ComposeOptions, "overlayConfig"> & {
      overlayConfig: OverlayConfig;
    }
  ): Promise<ComposeResult> => {
    if (!serviceRef.current) {
      throw new Error("Service not initialized");
    }

    setState({
      ...initialState,
      isComposing: true,
    });

    const result = await serviceRef.current.compose(options);

    return result;
  };

  const cancel = (): void => {
    if (serviceRef.current) {
      serviceRef.current.cancel();
      setState({
        ...initialState,
      });
    }
  };

  const reset = (): void => {
    setState(initialState);
  };

  return {
    ...state,
    compose,
    cancel,
    reset,
  };
}
