/**
 * Job Status Poller
 * Single responsibility: Poll video composition job status
 */

import type { client } from "@/utils/orpc";

export interface JobStatus {
  state: "waiting" | "active" | "completed" | "failed";
  progress: number;
  result?: {
    success: boolean;
    composedVideoPlaybackId?: string;
    error?: string;
  };
}

export interface PollerConfig {
  pollInterval?: number;
  maxAttempts?: number;
}

export class StatusPoller {
  private readonly pollInterval: number;
  private readonly maxAttempts: number;
  private attempts = 0;
  private isPolling = false;

  constructor(config: PollerConfig = {}) {
    this.pollInterval = config.pollInterval ?? 1000; // 1 second
    this.maxAttempts = config.maxAttempts ?? 300; // 5 minutes
  }

  async poll(
    jobId: string,
    orpcClient: typeof client,
    onUpdate: (status: JobStatus) => void
  ): Promise<JobStatus> {
    this.isPolling = true;
    this.attempts = 0;

    while (this.attempts < this.maxAttempts && this.isPolling) {
      await this.wait();
      this.attempts++;

      const status = await this.fetchStatus(jobId, orpcClient);
      onUpdate(status);

      if (this.isTerminalState(status.state)) {
        this.isPolling = false;
        return status;
      }
    }

    throw new Error("Job polling timed out after 5 minutes");
  }

  stop(): void {
    this.isPolling = false;
  }

  private async fetchStatus(
    jobId: string,
    orpcClient: typeof client
  ): Promise<JobStatus> {
    const response = await orpcClient.sponsorships.getCompositionStatus({
      jobId,
    });

    // Type assertion - API returns string but we know it's one of these values
    return {
      ...response,
      state: response.state as JobStatus["state"],
    };
  }

  private async wait(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.pollInterval));
  }

  private isTerminalState(state: JobStatus["state"]): boolean {
    return state === "completed" || state === "failed";
  }
}
