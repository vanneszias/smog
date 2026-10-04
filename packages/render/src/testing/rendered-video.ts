/**
 * `@smog/render/testing/video`: the check of a rendered MP4 (fix wave M-4),
 * shared by `test:render` (`test/render/render.e2e.test.ts`) and the
 * site's local render loop (`apps/site/scripts/render-local-loop.ts`):
 * H.264, the source's even size, and its frame count ± 1. Tests and
 * scripts only; its own entry, so `./testing` (the fake renderer, which
 * the features' Workers tests import) carries no `mediabunny`.
 */
import { ALL_FORMATS, BufferSource, Input } from "mediabunny";

/** A rendered file may have one frame more or less than its source. */
export const RENDERED_FRAME_TOLERANCE = 1;

export interface RenderedVideo {
  codec: string | null;
  frames: number;
  height: number;
  width: number;
}

export interface ExpectedVideo {
  frames: number;
  height: number;
  width: number;
}

/** What is wrong with the rendered file against the source (empty: nothing). */
export function checkRenderedVideo(
  video: RenderedVideo | null,
  source: ExpectedVideo
): string[] {
  if (!video) {
    return ["no video track"];
  }
  const problems: string[] = [];
  if (video.codec !== "avc") {
    problems.push(`codec ${video.codec}, expected avc (H.264)`);
  }
  if (video.width !== source.width || video.height !== source.height) {
    problems.push(
      `size ${video.width} × ${video.height}, expected ${source.width} × ${source.height}`
    );
  }
  if (Math.abs(video.frames - source.frames) > RENDERED_FRAME_TOLERANCE) {
    problems.push(
      `${video.frames} frames, expected ${source.frames} ± ${RENDERED_FRAME_TOLERANCE}`
    );
  }
  return problems;
}

/** The file's first video track, read with mediabunny (packets = frames). */
export async function readRenderedVideo(
  bytes: Uint8Array
): Promise<RenderedVideo | null> {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BufferSource(bytes),
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) {
      return null;
    }
    const stats = await track.computePacketStats();
    return {
      codec: track.codec,
      frames: stats.packetCount,
      height: await track.getDisplayHeight(),
      width: await track.getDisplayWidth(),
    };
  } finally {
    input.dispose();
  }
}
