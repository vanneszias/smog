/**
 * The rejected video's retention (phase 8 ruling 13, carry 4). A rejected
 * sponsorship keeps its rendered video while the admin may still ask for
 * changes; after `REJECTED_VIDEO_RETENTION_DAYS` from its `rejected` event
 * the request is refused (`rejectedTooLongAgo`) and the daily purge
 * deletes the Mux asset. The days are a proposed default, open in
 * `docs/LEGAL-SIGNOFF.md`.
 */
import { DAY_MS } from "@smog/utils";

/** Days from the `rejected` event until the video is deleted. */
export const REJECTED_VIDEO_RETENTION_DAYS = 30;

export const REJECTED_VIDEO_RETENTION_MS =
  REJECTED_VIDEO_RETENTION_DAYS * DAY_MS;

/** Mux assets the daily purge deletes per run at most; the rest wait a night. */
export const REJECTED_VIDEO_PURGE_PER_RUN = 20;
