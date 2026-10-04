import {
  readMp4Metadata,
  type SourceMetadata,
} from "@smog/render/metadata/mp4";
import { renditionUrls } from "@smog/video/renditions";
import { useEffect, useState } from "react";

/**
 * The gesture's source for the wizard's Player (phase 7 ruling 8): Mux's
 * public static renditions (`renditionUrls`, the list the render's
 * fallback source tries too), read in the browser with `readMp4Metadata`
 * (`mediabunny`, its MP4 demuxer only; fix wave M-3 and M-4). Only
 * `sponsor-preview.tsx` imports this module, so `mediabunny` stays in the
 * Player's lazy chunk.
 */

export type SourceState =
  | { status: "loading" }
  | { metadata: SourceMetadata; src: string; status: "ready" }
  | { status: "failed" };

type Settled = Exclude<SourceState, { status: "loading" }>;

/** Reads one URL's metadata; the signal aborts it. */
export type ReadRendition = (
  url: string,
  signal: AbortSignal
) => Promise<SourceMetadata>;

/**
 * The shared reader; an abort disposes its input, so its fetches stop. The
 * next rendition, then the image fallback, are the retries.
 */
const readRendition: ReadRendition = (url, signal) =>
  readMp4Metadata(url, { signal });

/** What each playback id gave, for the page's life (failures too). */
const settled = new Map<string, Settled>();

/** Forgets every source (tests only). */
export function forgetSources(): void {
  settled.clear();
}

async function resolveSource(
  playbackId: string,
  read: ReadRendition,
  signal: AbortSignal
): Promise<Settled> {
  for (const src of renditionUrls(playbackId)) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: the second rendition only when the first fails.
      const metadata = await read(src, signal);
      return { metadata, src, status: "ready" };
    } catch {
      if (signal.aborted) {
        break;
      }
      // Not this rendition: try the next.
    }
  }
  return { status: "failed" };
}

/**
 * The first static rendition of `playbackId` that reads, with its duration
 * and even size, or `failed` when none does (the Player then shows the
 * image fallback). An unmount or a new id aborts the read in flight.
 */
export function useSourceMetadata(
  playbackId: string,
  read: ReadRendition = readRendition
): SourceState {
  const [result, setResult] = useState<{
    playbackId: string;
    state: Settled;
  } | null>(null);
  const known = settled.get(playbackId);
  useEffect(() => {
    if (settled.has(playbackId)) {
      return;
    }
    const controller = new AbortController();
    resolveSource(playbackId, read, controller.signal).then((state) => {
      if (controller.signal.aborted) {
        return;
      }
      settled.set(playbackId, state);
      setResult({ playbackId, state });
    });
    return () => controller.abort();
  }, [playbackId, read]);
  if (known) {
    return known;
  }
  return result?.playbackId === playbackId
    ? result.state
    : { status: "loading" };
}
