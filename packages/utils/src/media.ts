/** Seconds before the end at which a gesture video reports `onNearEnd`. */
export const NEAR_END_SECONDS = 5;

/** A jump back of more than this (seconds) is a new loop or a seek back. */
const REWIND_SECONDS = 1;

/** `audio/<gestureId>/<locale>/<uuid>`: the R2 key prefix of every gesture clip. */
export const AUDIO_KEY_PREFIX = "audio/";

/**
 * The same-origin path a clip is served from (`GET /api/audio/<gestureId>/
 * <locale>/<uuid>`), for the R2 key `audio/<gestureId>/<locale>/<uuid>`.
 */
export function audioPath(key: string): string {
  return `/api/audio/${key.slice(AUDIO_KEY_PREFIX.length)}`;
}

/** `logos/<uuid>`: the R2 key prefix of every sponsor logo. */
export const LOGO_KEY_PREFIX = "logos/";

/**
 * The same-origin path a running sponsorship's logo is served from
 * (`GET /api/sponsor-logos/<uuid>`), for the R2 key `logos/<uuid>`.
 */
export function sponsorLogoPath(key: string): string {
  return `/api/sponsor-logos/${key.slice(LOGO_KEY_PREFIX.length)}`;
}

/** The longest the sponsor end card shows, in seconds (phase 10b ruling 9). */
export const END_CARD_SECONDS = 4;

/**
 * Where the sponsor end card starts: `END_CARD_SECONDS` before the end of a
 * video, but never earlier than its middle (a 3 s video shows it for its
 * last 1.5 s), so the card never covers the whole sign. `null` for a
 * duration that is not a positive finite number (a stream not loaded yet,
 * a live stream): no card until the length is known.
 */
export function endCardStart(durationSeconds: number): number | null {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return null;
  }
  return durationSeconds - Math.min(END_CARD_SECONDS, durationSeconds / 2);
}

/** Whether the end card shows at `currentSeconds` of a video of `durationSeconds`. */
export function isEndCardVisible(
  currentSeconds: number,
  durationSeconds: number
): boolean {
  const start = endCardStart(durationSeconds);
  return (
    start !== null && Number.isFinite(currentSeconds) && currentSeconds >= start
  );
}

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
