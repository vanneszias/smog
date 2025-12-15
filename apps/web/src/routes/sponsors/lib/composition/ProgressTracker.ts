/**
 * Progress Tracker
 * Single responsibility: Map job progress to composition steps
 */

import type { CompositionStep } from "./types";

export class ProgressTracker {
  private currentStep: CompositionStep = "idle";
  private currentProgress = 0;

  /**
   * Update progress and determine current step
   */
  update(progress: number): {
    step: CompositionStep;
    hasStepChanged: boolean;
  } {
    const previousStep = this.currentStep;
    this.currentProgress = progress;
    this.currentStep = this.determineStep(progress);

    return {
      step: this.currentStep,
      hasStepChanged: previousStep !== this.currentStep,
    };
  }

  getCurrentStep(): CompositionStep {
    return this.currentStep;
  }

  getCurrentProgress(): number {
    return this.currentProgress;
  }

  reset(): void {
    this.currentStep = "idle";
    this.currentProgress = 0;
  }

  /**
   * Determine step based on progress percentage
   */
  private determineStep(progress: number): CompositionStep {
    if (progress < 15) {
      return "preparing";
    }
    if (progress >= 15 && progress < 30) {
      return "downloading";
    }
    if (progress >= 30 && progress < 40) {
      return "processing-image";
    }
    if (progress >= 40 && progress < 80) {
      return "composing";
    }
    if (progress >= 80 && progress < 100) {
      return "uploading-result";
    }
    if (progress >= 100) {
      return "completed";
    }
    return this.currentStep;
  }
}
