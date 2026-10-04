/**
 * `@smog/render/metadata` (phase 7 ruling 5): the source video's duration
 * and size, which the caller passes to `SponsoredVideo`. It runs in Bun (the
 * render server) and in the browser (the wizard's Player), never in workerd.
 */
import {
  ALL_FORMATS,
  Input,
  UnsupportedInputFormatError,
  UrlSource,
} from "mediabunny";
import { RENDER_FPS } from "../contract";

export interface SourceMetadata {
  /** `max(1, ceil(duration × 30))`. */
  durationInFrames: number;
  durationInSeconds: number;
  /** The display height, rounded down to even (H.264). */
  height: number;
  /** The display width, rounded down to even (H.264). */
  width: number;
}

/** What `readSourceMetadata` reads (a `mediabunny` `Input`, or a fake). */
export interface MetadataInput {
  computeDuration: () => Promise<number>;
  dispose: () => void;
  getPrimaryVideoTrack: () => Promise<{
    getDisplayHeight: () => Promise<number>;
    getDisplayWidth: () => Promise<number>;
  } | null>;
}

/**
 * The source cannot be rendered: no video track, an unrecognised format, or
 * a size or duration that makes no video. Final (the render server answers
 * `sourceUnreadable`); its message never holds the URL.
 */
export class SourceUnreadableError extends Error {
  override readonly name = "SourceUnreadableError";
}

function openUrl(url: string): MetadataInput {
  return new Input({
    formats: ALL_FORMATS,
    // The caller retries (the Workflow's step, the Player's fallback).
    source: new UrlSource(url, { getRetryDelay: () => null }),
  });
}

function evenFloor(size: number): number {
  return Math.floor(size / 2) * 2;
}

async function read(input: MetadataInput): Promise<SourceMetadata> {
  const durationInSeconds = await input.computeDuration();
  if (!Number.isFinite(durationInSeconds) || durationInSeconds < 0) {
    throw new SourceUnreadableError("the source has no usable duration");
  }
  const track = await input.getPrimaryVideoTrack();
  if (!track) {
    throw new SourceUnreadableError("the source has no video track");
  }
  const width = evenFloor(await track.getDisplayWidth());
  const height = evenFloor(await track.getDisplayHeight());
  if (!(width >= 2 && height >= 2)) {
    throw new SourceUnreadableError("the source's video has no usable size");
  }
  return {
    durationInFrames: Math.max(1, Math.ceil(durationInSeconds * RENDER_FPS)),
    durationInSeconds,
    height,
    width,
  };
}

/**
 * Reads the source's duration and its primary video track's display size
 * (after rotation and aspect ratio), as the old `get-media-metadata.ts` did,
 * and disposes the input whatever happens. An unrecognised format is a
 * `SourceUnreadableError`; any other failure (a network fault) is rethrown.
 */
export async function readSourceMetadata(
  url: string,
  { openInput = openUrl }: { openInput?: (url: string) => MetadataInput } = {}
): Promise<SourceMetadata> {
  const input = openInput(url);
  try {
    return await read(input);
  } catch (error) {
    if (error instanceof UnsupportedInputFormatError) {
      // Mediabunny's message names no URL.
      throw new SourceUnreadableError("the source's format is not readable", {
        cause: error,
      });
    }
    throw error;
  } finally {
    input.dispose();
  }
}
