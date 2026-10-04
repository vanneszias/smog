import {
  type MetadataInput,
  readSourceMetadata,
  type SourceMetadata,
} from "@smog/render/metadata";
import { ALL_FORMATS, Input, UrlSource } from "mediabunny";
import { useEffect, useState } from "react";

/**
 * The gesture's source for the wizard's Player (phase 7 ruling 8): Mux's
 * public static renditions, read in the browser with `readSourceMetadata`
 * (`mediabunny`). Only `sponsor-preview.tsx` imports this module, so
 * `mediabunny` stays in the Player's lazy chunk.
 */

const MUX_STREAM_ORIGIN = "https://stream.mux.com";

/** `highest.mp4`, then `high.mp4` (the render's fallback source tries the same). */
export function renditionUrls(playbackId: string): string[] {
  const base = `${MUX_STREAM_ORIGIN}/${encodeURIComponent(playbackId)}`;
  return [`${base}/highest.mp4`, `${base}/high.mp4`];
}

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

/** A `mediabunny` input whose fetches stop when the signal aborts. */
function openInput(url: string, signal: AbortSignal): MetadataInput {
  const input = new Input({
    formats: ALL_FORMATS,
    // The next rendition, then the image fallback, are the retries.
    source: new UrlSource(url, { getRetryDelay: () => null }),
  });
  signal.addEventListener("abort", () => input.dispose(), { once: true });
  return input;
}

const readRendition: ReadRendition = (url, signal) =>
  readSourceMetadata(url, {
    openInput: (source) => openInput(source, signal),
  });

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
