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

/** mediabunny's `UrlSource` failure: "Error fetching <url>: <status> <text>". */
const FETCH_STATUS = /^Error fetching .*: (\d{3})(?: [^:]*)?$/s;

/**
 * The source could not be fetched: an HTTP error (an expired signed master
 * URL answers 403) or a network fault. Retryable (the Workflow resolves the
 * source again). Its message is fixed and never holds the URL; `cause` is
 * the original error, which may (mediabunny's always does), so it must
 * never be logged or answered unscrubbed (task 3 review, I-2).
 */
export class SourceFetchError extends Error {
  override readonly name = "SourceFetchError";
  readonly retryable = true;
  /** The HTTP status when the source answered one, else `null`. */
  readonly status: number | null;

  constructor(status: number | null, options?: ErrorOptions) {
    super(
      status === null
        ? "the source could not be read"
        : `the source could not be read (HTTP ${status})`,
      options
    );
    this.status = status;
  }
}

function fetchStatus(error: unknown): number | null {
  const match =
    error instanceof Error ? FETCH_STATUS.exec(error.message) : null;
  return match?.[1] ? Number(match[1]) : null;
}

/** Below this, a frame count is float noise (62 / 30 × 30 = 62.00000000000001). */
const FRAME_EPSILON = 1e-6;

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
    durationInFrames: Math.max(
      1,
      Math.ceil(durationInSeconds * RENDER_FPS - FRAME_EPSILON)
    ),
    durationInSeconds,
    height,
    width,
  };
}

/**
 * Reads the source's duration and its primary video track's display size
 * (after rotation and aspect ratio), as the old `get-media-metadata.ts` did,
 * and disposes the input whatever happens. An unrecognised format is a
 * `SourceUnreadableError` (final); any other failure (an HTTP error, a
 * network fault) is a `SourceFetchError` (retryable). Neither message holds
 * the URL.
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
    if (error instanceof SourceUnreadableError) {
      throw error;
    }
    throw new SourceFetchError(fetchStatus(error), { cause: error });
  } finally {
    input.dispose();
  }
}
