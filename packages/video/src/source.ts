import type { MuxFetch } from "./client";

/**
 * The render's fallback source (phase 7 ruling 4, `source-resolve`): the
 * public static MP4 renditions of a playback id. They are public, not
 * signed, so they may appear in step state and logs.
 */
const MUX_STREAM_ORIGIN = "https://stream.mux.com";

/** `highest.mp4`, then `high.mp4` (the wizard preview tries the same). */
export function renditionUrls(playbackId: string): string[] {
  const base = `${MUX_STREAM_ORIGIN}/${encodeURIComponent(playbackId)}`;
  return [`${base}/highest.mp4`, `${base}/high.mp4`];
}

/**
 * The first URL that answers a `HEAD` with 200, in order, or `null`. A
 * network error counts as unreachable (logged), so the next URL is tried.
 */
export async function firstReachable(
  urls: readonly string[],
  fetch: MuxFetch
): Promise<string | null> {
  for (const url of urls) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: in order, stopping at the first that answers.
      const response = await fetch(url, { method: "HEAD" });
      await response.body?.cancel();
      if (response.status === 200) {
        return url;
      }
    } catch (error) {
      console.warn(`[video] Failed to reach ${url}:`, error);
    }
  }
  return null;
}
