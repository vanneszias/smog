// biome-ignore-all lint/suspicious/noBitwiseOperators: the verifier reads the bit fields of binary image formats.
/**
 * What an uploaded drawing is, read from its bytes (phase 10c ruling 6): the
 * declared type is never trusted. A PNG is a signature, an `IHDR` chunk with
 * a valid CRC and an `IEND`; a JPEG starts with `SOI` and has a baseline or
 * progressive `SOF` marker; a WebP is a `RIFF`/`WEBP` container whose first
 * chunk is `VP8 `, `VP8L` or `VP8X` (an animated one is refused). The width
 * and height come from the header, so a file over `DRAWING_MAX_PIXELS` on a
 * side is refused whatever its size. Pure: it takes the whole object (at
 * most 1 MiB) and never decodes pixels.
 */
import {
  DRAWING_MAX_BYTES,
  DRAWING_MAX_PIXELS,
  type DrawingContentType,
} from "@smog/db/enums";

export type DrawingVerdict =
  | {
      contentType: DrawingContentType;
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

/** 24-bit little-endian. */
function u24(bytes: Uint8Array, at: number): number {
  return (
    (bytes[at] ?? 0) |
    ((bytes[at + 1] ?? 0) << 8) |
    ((bytes[at + 2] ?? 0) << 16)
  );
}

function webpLossy(bytes: Uint8Array, data: number): Size {
  // Frame tag (3 bytes, bit 0 = 0 for a key frame), then the start code.
  if (
    (bytes[data] ?? 1) & 1 ||
    bytes[data + 3] !== 0x9d ||
    bytes[data + 4] !== 0x01 ||
    bytes[data + 5] !== 0x2a
  ) {
    return null;
  }
  return {
    height: ((bytes[data + 8] ?? 0) | ((bytes[data + 9] ?? 0) << 8)) & 0x3f_ff,
    width: ((bytes[data + 6] ?? 0) | ((bytes[data + 7] ?? 0) << 8)) & 0x3f_ff,
  };
}

function webpLossless(bytes: Uint8Array, data: number): Size {
  if (bytes[data] !== 0x2f) {
    return null;
  }
  const bits =
    (bytes[data + 1] ?? 0) |
    ((bytes[data + 2] ?? 0) << 8) |
    ((bytes[data + 3] ?? 0) << 16) |
    ((bytes[data + 4] ?? 0) << 24);
  return { height: ((bits >>> 14) & 0x3f_ff) + 1, width: (bits & 0x3f_ff) + 1 };
}

function readWebp(bytes: Uint8Array): Size {
  if (bytes.length < 25 || ascii(bytes, 0, 4) !== "RIFF") {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    ascii(bytes, 8, 4) !== "WEBP" ||
    view.getUint32(4, true) + 8 > bytes.length
  ) {
    return null;
  }
  const kind = ascii(bytes, 12, 4);
  const size = view.getUint32(16, true);
  if (20 + size > bytes.length) {
    return null;
  }
  if (kind === "VP8 ") {
    return webpLossy(bytes, 20);
  }
  if (kind === "VP8L") {
    return webpLossless(bytes, 20);
  }
  if (kind === "VP8X" && size >= 10) {
    // Flags: bit 1 is the animation flag; an animated file is not a drawing.
    if ((bytes[20] ?? 0) & 0x02) {
      return null;
    }
    return { height: u24(bytes, 27) + 1, width: u24(bytes, 24) + 1 };
  }
  return null;
}

function verdictOf(
  contentType: DrawingContentType,
  size: Size
): DrawingVerdict {
  if (!size || size.width < 1 || size.height < 1) {
    return FORMAT;
  }
  if (size.width > DRAWING_MAX_PIXELS || size.height > DRAWING_MAX_PIXELS) {
    return { ok: false, reason: "dimensions" };
  }
  return { contentType, height: size.height, ok: true, width: size.width };
}

/** The type and the size of a PNG, JPEG or WebP drawing; the reason when it is none of them, too large or too wide. */
export function inspectDrawing(bytes: Uint8Array): DrawingVerdict {
  if (bytes.length < 1) {
    return FORMAT;
  }
  if (bytes.length > DRAWING_MAX_BYTES) {
    return { ok: false, reason: "tooLarge" };
  }
  if (bytes[0] === 0x89) {
    return verdictOf("image/png", readPng(bytes));
  }
  if (bytes[0] === 0xff) {
    return verdictOf("image/jpeg", readJpeg(bytes));
  }
  if (bytes[0] === 0x52) {
    return verdictOf("image/webp", readWebp(bytes));
  }
  return FORMAT;
}
