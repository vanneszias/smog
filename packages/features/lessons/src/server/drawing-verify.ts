// biome-ignore-all lint/suspicious/noBitwiseOperators: the verifier reads the bit fields of binary image formats.
/**
 * What an uploaded drawing is, read from its bytes (phase 10c ruling 6): the
 * declared type is never trusted. A PNG is a signature, an `IHDR` chunk with
 * a valid CRC and an `IEND`; a JPEG starts with `SOI` and has a baseline or
 * progressive `SOF` marker. A WebP is refused as a format: `pdf-lib` cannot
 * embed it (task 5b). The width and height come from the header, so a file
 * over `DRAWING_UPLOAD_MAX_PIXELS` (1,200) on a side is refused whatever its
 * size. Pure: it takes the whole object (at most 512 KiB) and never decodes
 * pixels.
 */
import {
  DRAWING_UPLOAD_MAX_BYTES,
  DRAWING_UPLOAD_MAX_PIXELS,
  type DrawingUploadType,
} from "@smog/db/enums";

export type DrawingVerdict =
  | {
      contentType: DrawingUploadType;
      height: number;
      ok: true;
      width: number;
    }
  | { ok: false; reason: "dimensions" | "format" | "tooLarge" };

const FORMAT: DrawingVerdict = { ok: false, reason: "format" };

type Size = { height: number; width: number } | null;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/** The CRC-32 table of PNG chunks (polynomial 0xedb88320). */
const CRC_TABLE: readonly number[] = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let bit = 0; bit < 8; bit += 1) {
    c = c & 1 ? 0xed_b8_83_20 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

/** CRC-32 over `bytes[from, to)`. */
export function crc32(bytes: Uint8Array, from: number, to: number): number {
  let c = 0xff_ff_ff_ff;
  for (let at = from; at < to; at += 1) {
    c = (CRC_TABLE[(c ^ (bytes[at] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xff_ff_ff_ff) >>> 0;
}

function ascii(bytes: Uint8Array, at: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + length));
}

/** The valid colour types and the bit depths each allows (PNG spec table 11.1). */
const PNG_DEPTHS: Readonly<Record<number, readonly number[]>> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
};

function readPng(bytes: Uint8Array): Size {
  if (bytes.length < 33 + 12) {
    return null;
  }
  if (PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The first chunk is IHDR: length 13, type, 13 data bytes, CRC.
  if (view.getUint32(8) !== 13 || ascii(bytes, 12, 4) !== "IHDR") {
    return null;
  }
  if (view.getUint32(29) !== crc32(bytes, 12, 29)) {
    return null;
  }
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const depth = bytes[24] ?? 0;
  const colour = bytes[25] ?? -1;
  if (!(PNG_DEPTHS[colour]?.includes(depth) && bytes[26] === 0)) {
    return null;
  }
  // IEND is the last chunk: length 0, type, its fixed CRC.
  const end = bytes.length - 12;
  if (view.getUint32(end) !== 0 || ascii(bytes, end + 4, 4) !== "IEND") {
    return null;
  }
  return { height, width };
}

/** SOF markers carry the frame size (C4, C8 and CC are not frames). */
function isFrameMarker(marker: number): boolean {
  return (
    marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
  );
}

/** The frame size a SOF segment at `at` declares (length, precision, height, width, components), or `null` when it is too short. */
function jpegFrame(view: DataView, at: number, length: number): Size {
  return length < 8
    ? null
    : { height: view.getUint16(at + 5), width: view.getUint16(at + 7) };
}

function endsWithEoi(bytes: Uint8Array): boolean {
  const last = bytes.length - 2;
  return bytes[last] === 0xff && bytes[last + 1] === 0xd9;
}

/** The marker at `at` with its segment length (0 for the end marker), or `null` for bytes that are no segment. */
function segmentAt(
  bytes: Uint8Array,
  view: DataView,
  at: number
): { length: number; marker: number } | null {
  const marker = bytes[at + 1] ?? 0;
  if (bytes[at] !== 0xff || marker === 0xd9) {
    return null;
  }
  const length = view.getUint16(at + 2);
  return length < 2 || at + 2 + length > bytes.length
    ? null
    : { length, marker };
}

function readJpeg(bytes: Uint8Array): Size {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 2;
  let frame: Size = null;
  while (at + 4 <= bytes.length) {
    const segment = segmentAt(bytes, view, at);
    if (!segment) {
      return null;
    }
    if (isFrameMarker(segment.marker)) {
      frame = jpegFrame(view, at, segment.length);
    }
    if (segment.marker === 0xda) {
      // Entropy-coded data follows: a frame was declared, and the file ends in EOI.
      return frame && endsWithEoi(bytes) ? frame : null;
    }
    at += 2 + segment.length;
  }
  return null;
}

function verdictOf(contentType: DrawingUploadType, size: Size): DrawingVerdict {
  if (!size || size.width < 1 || size.height < 1) {
    return FORMAT;
  }
  if (
    size.width > DRAWING_UPLOAD_MAX_PIXELS ||
    size.height > DRAWING_UPLOAD_MAX_PIXELS
  ) {
    return { ok: false, reason: "dimensions" };
  }
  return { contentType, height: size.height, ok: true, width: size.width };
}

/** The type and the size of a PNG or JPEG drawing; the reason when it is none of them, too large or too wide. */
export function inspectDrawing(bytes: Uint8Array): DrawingVerdict {
  if (bytes.length < 1) {
    return FORMAT;
  }
  if (bytes.length > DRAWING_UPLOAD_MAX_BYTES) {
    return { ok: false, reason: "tooLarge" };
  }
  if (bytes[0] === 0x89) {
    return verdictOf("image/png", readPng(bytes));
  }
  if (bytes[0] === 0xff) {
    return verdictOf("image/jpeg", readJpeg(bytes));
  }
  return FORMAT;
}
