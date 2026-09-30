/** Seconds before the end at which a gesture video reports `onNearEnd`. */
export const NEAR_END_SECONDS = 5;

/** A jump back of more than this (seconds) is a new loop or a seek back. */
const REWIND_SECONDS = 1;

/** The HLS stream of a Mux playback id (native players; web uses mux-player). */
export function muxStreamUrl(playbackId: string): string {
  return `https://stream.mux.com/${encodeURIComponent(playbackId)}.m3u8`;
}

export interface MuxThumbnailOptions {
  /** Seconds into the video. */
  time?: number;
  /** Width in pixels (Mux keeps the aspect ratio). */
  width?: number;
}

/** A still of a Mux playback id, for cards and posters. */
export function muxThumbnailUrl(
  playbackId: string,
  options: MuxThumbnailOptions = {}
): string {
  const params = new URLSearchParams();
  if (options.width !== undefined) {
    params.set("width", String(options.width));
  }
  if (options.time !== undefined) {
    params.set("time", String(options.time));
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return `https://image.mux.com/${encodeURIComponent(playbackId)}/thumbnail.webp${query}`;
}

export interface NearEndTracker {
  /** Re-arms the tracker (the video was restarted by hand). */
  reset: () => void;
  /** Feed every time update; `true` exactly once per loop, at ≤ `threshold` s left. */
  update: (currentTime: number, duration: number) => boolean;
}

/**
 * The `onNearEnd` rule both VideoPlayers share: it fires once per playthrough
 * when `threshold` seconds or less are left, and re-arms when the time jumps
 * back (the next loop, or a seek back). A video of `threshold` seconds or
 * less fires on its first update (as the old `≤ 5 s left` rule did).
 */
export function createNearEndTracker(
  threshold: number = NEAR_END_SECONDS
): NearEndTracker {
  let fired = false;
  let last = 0;
  return {
    reset: (): void => {
      fired = false;
      last = 0;
    },
    update: (currentTime: number, duration: number): boolean => {
      if (currentTime < last - REWIND_SECONDS) {
        fired = false;
      }
      last = currentTime;
      if (fired || !Number.isFinite(duration) || duration <= 0) {
        return false;
      }
      if (duration - currentTime <= threshold) {
        fired = true;
        return true;
      }
      return false;
    },
  };
}
