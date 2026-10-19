import type { MuxFetch } from "./client";

/**
 * The render's fallback source (phase 7 ruling 4, `source-resolve`): the
 * first public static MP4 rendition (`renditionUrls`, `./renditions`) that
 * answers.
 */

/** How long one `HEAD` may take before the next URL is tried. */
const FIRST_REACHABLE_TIMEOUT_MS = 10_000;

/** The file name of a URL (`highest.mp4`): what a log may name, never the URL. */
function fileName(url: string): string {
  try {
    return new URL(url).pathname.split("/").at(-1) || "(no name)";
  } catch {
    return "(invalid URL)";
  }
}

/**
 * The first URL that answers a `HEAD` with 200, in order, or `null`. A
 * network error or a request past `timeoutMs` counts as unreachable and the
 * next URL is tried. Logs name only the file (`highest.mp4`), never the
 * URL, so a signed URL passed here cannot leak through a log.
 */
export async function firstReachable(
  urls: readonly string[],
  fetch: MuxFetch,
  { timeoutMs = FIRST_REACHABLE_TIMEOUT_MS }: { timeoutMs?: number } = {}
): Promise<string | null> {
  for (const url of urls) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: in order, stopping at the first that answers.
      const response = await fetch(url, {
        method: "HEAD",
        signal: AbortSignal.timeout(timeoutMs),
      });
      await response.body?.cancel();
      if (response.status === 200) {
        return url;
      }
    } catch (error) {
      const reason = error instanceof Error ? error.name : "error";
      console.warn(
        `[video] Failed to reach rendition ${fileName(url)} (${reason})`
      );
    }
  }
  return null;
}
