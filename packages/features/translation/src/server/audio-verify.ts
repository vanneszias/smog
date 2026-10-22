// biome-ignore-all lint/suspicious/noBitwiseOperators: the verifier reads the bit fields of binary file formats.
/**
 * What an uploaded audio clip is, read from its bytes (phase 10b ruling 6):
 * the declared type is never trusted. An MP3 is a run of Layer III frames
 * (after an optional ID3v2 tag), an M4A an ISO base media file with an
 * `ftyp` box and audio tracks only. The duration comes from the frames or
 * from `moov/mvhd`, so a clip longer than `AUDIO_MAX_DURATION_MS` is refused
 * whatever its size. Pure: it takes the whole object (at most 1 MiB).
 */
import { AUDIO_MAX_DURATION_MS, type AudioContentType } from "@smog/db/enums";

export type AudioVerdict =
  | { contentType: AudioContentType; durationMs: number; ok: true }
  | { ok: false; reason: "duration" | "format" };

const FORMAT: AudioVerdict = { ok: false, reason: "format" };

/** MPEG-1 Layer III bitrates (kbit/s) by index; index 0 (free) and 15 (bad) are refused. */
const BITRATES_V1 = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
] as const;
/** MPEG-2 and MPEG-2.5 Layer III bitrates. */
const BITRATES_V2 = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160,
] as const;
const SAMPLE_RATES = {
  1: [44_100, 48_000, 32_000],
  2: [22_050, 24_000, 16_000],
  2.5: [11_025, 12_000, 8000],
} as const;

interface Frame {
  length: number;
  sampleRate: number;
  samples: number;
}

function versionOf(bits: number): 1 | 2 | 2.5 {
  if (bits === 3) {
    return 1;
  }
  return bits === 2 ? 2 : 2.5;
}

/** The Layer III frame header at `at`, or `null` when there is none. */
function frameAt(bytes: Uint8Array, at: number): Frame | null {
  const b0 = bytes[at];
  const b1 = bytes[at + 1];
  const b2 = bytes[at + 2];
  if (b0 !== 0xff || b1 === undefined || b2 === undefined) {
    return null;
  }
  const versionBits = (b1 >> 3) & 3;
  const layerBits = (b1 >> 1) & 3;
  if ((b1 & 0xe0) !== 0xe0 || versionBits === 1 || layerBits !== 1) {
    return null;
  }
  const version = versionOf(versionBits);
  const bitrateIndex = b2 >> 4;
  const rateIndex = (b2 >> 2) & 3;
  if (bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) {
    return null;
  }
  const bitrate = (version === 1 ? BITRATES_V1 : BITRATES_V2)[bitrateIndex];
  const sampleRate = SAMPLE_RATES[version][rateIndex];
  if (bitrate === undefined || sampleRate === undefined) {
    return null;
  }
  const padding = (b2 >> 1) & 1;
  const factor = version === 1 ? 144 : 72;
  return {
    length: Math.floor((factor * bitrate * 1000) / sampleRate) + padding,
    sampleRate,
    samples: version === 1 ? 1152 : 576,
  };
}

/** The size of an ID3v2 tag at the start (header, body and footer), or 0. */
function id3Size(bytes: Uint8Array): number {
  if (
    bytes.length < 10 ||
    bytes[0] !== 0x49 ||
    bytes[1] !== 0x44 ||
    bytes[2] !== 0x33
  ) {
    return 0;
  }
  const size =
    ((bytes[6] ?? 0) << 21) |
    ((bytes[7] ?? 0) << 14) |
    ((bytes[8] ?? 0) << 7) |
    (bytes[9] ?? 0);
  const footer = ((bytes[5] ?? 0) & 0x10) === 0 ? 0 : 10;
  return 10 + size + footer;
}

function finish(
  contentType: AudioContentType,
  durationMs: number
): AudioVerdict {
  const rounded = Math.ceil(durationMs);
  if (rounded < 1) {
    return FORMAT;
  }
  return rounded > AUDIO_MAX_DURATION_MS
    ? { ok: false, reason: "duration" }
    : { contentType, durationMs: rounded, ok: true };
}

/** A run of frames from the first byte after the tag; the walk stops at the first byte that is not one. */
function readMp3(bytes: Uint8Array): AudioVerdict {
  const start = id3Size(bytes);
  let at = start;
  let seconds = 0;
  let frames = 0;
  for (;;) {
    const frame = frameAt(bytes, at);
    if (!frame || at + frame.length > bytes.length) {
      break;
    }
    seconds += frame.samples / frame.sampleRate;
    frames += 1;
    at += frame.length;
  }
  // A clip is mostly frames: a document with a few frame-like bytes is not one.
  if (frames === 0 || at - start < (bytes.length - start) * 0.9) {
    return FORMAT;
  }
  return finish("audio/mpeg", seconds * 1000);
}

interface Box {
  end: number;
  start: number;
  type: string;
}

/** The boxes between `from` and `to` (a box that does not fit ends the list). */
function boxes(view: DataView, from: number, to: number): Box[] {
  const found: Box[] = [];
  let at = from;
  while (at + 8 <= to) {
    let size = view.getUint32(at);
    let header = 8;
    if (size === 1) {
      // A 64-bit size: above 4 GiB cannot be in a 1 MiB object.
      if (at + 16 > to || view.getUint32(at + 8) !== 0) {
        break;
      }
      size = view.getUint32(at + 12);
      header = 16;
    } else if (size === 0) {
      size = to - at;
    }
    if (size < header || at + size > to) {
      break;
    }
    const type = String.fromCharCode(
      view.getUint8(at + 4),
      view.getUint8(at + 5),
      view.getUint8(at + 6),
      view.getUint8(at + 7)
    );
    found.push({ end: at + size, start: at + header, type });
    at += size;
  }
  return found;
}

function child(view: DataView, parent: Box, type: string): Box | undefined {
  return boxes(view, parent.start, parent.end).find((box) => box.type === type);
}

/** `moov/mvhd`: the movie's duration in milliseconds, or `null`. */
function movieDurationMs(view: DataView, moov: Box): number | null {
  const mvhd = child(view, moov, "mvhd");
  if (!mvhd || mvhd.end - mvhd.start < 20) {
    return null;
  }
  let timescale: number;
  let duration: number;
  if (view.getUint8(mvhd.start) === 1) {
    if (mvhd.end - mvhd.start < 32) {
      return null;
    }
    timescale = view.getUint32(mvhd.start + 20);
    duration =
      view.getUint32(mvhd.start + 24) * 2 ** 32 +
      view.getUint32(mvhd.start + 28);
  } else {
    timescale = view.getUint32(mvhd.start + 12);
    duration = view.getUint32(mvhd.start + 16);
  }
  return timescale > 0 ? (duration / timescale) * 1000 : null;
}

/** The handler type of each `trak` (`soun`, `vide`, ...). */
function trackKinds(view: DataView, moov: Box): string[] {
  const kinds: string[] = [];
  for (const trak of boxes(view, moov.start, moov.end)) {
    if (trak.type !== "trak") {
      continue;
    }
    const mdia = child(view, trak, "mdia");
    const hdlr = mdia ? child(view, mdia, "hdlr") : undefined;
    // version and flags (4), pre_defined (4), then the handler type.
    if (hdlr && hdlr.end - hdlr.start >= 12) {
      kinds.push(
        String.fromCharCode(
          view.getUint8(hdlr.start + 8),
          view.getUint8(hdlr.start + 9),
          view.getUint8(hdlr.start + 10),
          view.getUint8(hdlr.start + 11)
        )
      );
    }
  }
  return kinds;
}

/** An ISO base media file: `ftyp` first, one `moov` with audio tracks only. */
function readM4a(bytes: Uint8Array): AudioVerdict {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const top = boxes(view, 0, bytes.length);
  if (top[0]?.type !== "ftyp") {
    return FORMAT;
  }
  const moov = top.find((box) => box.type === "moov");
  if (!moov) {
    return FORMAT;
  }
  const kinds = trackKinds(view, moov);
  if (!kinds.includes("soun") || kinds.some((kind) => kind !== "soun")) {
    return FORMAT;
  }
  const duration = movieDurationMs(view, moov);
  return duration === null ? FORMAT : finish("audio/mp4", duration);
}

/** The type and the duration of an MP3 or M4A clip; the reason when it is neither or too long. */
export function inspectAudio(bytes: Uint8Array): AudioVerdict {
  // `ftyp` at offset 4: an ISO base media file.
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74) {
    return readM4a(bytes);
  }
  return readMp3(bytes);
}
