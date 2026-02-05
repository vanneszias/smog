/**
 * Simple in-memory job queue for video composition
 * Replaces BullMQ/Redis with a lightweight solution
 */

import { randomUUID } from "node:crypto";

export type JobState = "waiting" | "active" | "completed" | "failed";

export interface JobData {
  playbackId: string;
  overlayImageUrl?: string;
  overlayText: string;
  overlayConfig?: unknown;
}

export interface JobResult {
  success: boolean;
  composedVideoPlaybackId?: string;
  error?: string;
}

export interface Job {
  id: string;
  data: JobData;
  state: JobState;
  progress: number;
  result?: JobResult;
  createdAt: Date;
  updatedAt: Date;
}

// In-memory job store
const jobs = new Map<string, Job>();

// Clean up old jobs every 10 minutes (keep for 1 hour)
const JOB_RETENTION_MS = 60 * 60 * 1000; // 1 hour

setInterval(
  () => {
    const cutoff = Date.now() - JOB_RETENTION_MS;
    for (const [id, job] of jobs) {
      if (
        job.updatedAt.getTime() < cutoff &&
        (job.state === "completed" || job.state === "failed")
      ) {
        jobs.delete(id);
        console.log(`[Jobs] Cleaned up old job: ${id}`);
      }
    }
  },
  10 * 60 * 1000
);

export function createJob(data: JobData): Job {
  const job: Job = {
    id: randomUUID(),
    data,
    state: "waiting",
    progress: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function updateJobState(id: string, state: JobState): void {
  const job = jobs.get(id);
  if (job) {
    job.state = state;
    job.updatedAt = new Date();
  }
}

export function updateJobProgress(id: string, progress: number): void {
  const job = jobs.get(id);
  if (job) {
    job.progress = progress;
    job.updatedAt = new Date();
  }
}

export function completeJob(id: string, result: JobResult): void {
  const job = jobs.get(id);
  if (job) {
    job.state = result.success ? "completed" : "failed";
    job.result = result;
    job.progress = 100;
    job.updatedAt = new Date();
  }
}

export function getQueueStats() {
  let waiting = 0;
  let active = 0;
  let completed = 0;
  let failed = 0;

  for (const job of jobs.values()) {
    switch (job.state) {
      case "waiting":
        waiting++;
        break;
      case "active":
        active++;
        break;
      case "completed":
        completed++;
        break;
      case "failed":
        failed++;
        break;
    }
  }

  return { waiting, active, completed, failed };
}
