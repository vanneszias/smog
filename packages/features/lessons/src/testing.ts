// biome-ignore-all lint/suspicious/noBitwiseOperators: the fixtures write the bit fields of binary image formats.
/**
 * Synthetic drawings for the tests (no Workers imports: the e2e specs use
 * them too). Each is valid in structure, which is all the verifier reads:
 * a PNG whose pixels are a real (stored) zlib stream up to `PIXEL_LIMIT`
 * pixels and a stub beyond it, a JPEG with a frame header and an empty scan,
 * a WebP with the size fields of its codec. Header sizes are exact, so a
 * file can claim 3,000 px without being large.
 */
import { crc32 } from "./server/drawing-verify";

/** Above this many pixels a PNG carries a stub IDAT instead of its pixels. */
const PIXEL_LIMIT = 40_000;

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value);
  return out;
}

function u32le(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
}

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const body = concat(text(type), data);
  return concat(u32(data.length), body, u32(crc32(body, 0, body.length)));
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65_521;
    b = (b + a) % 65_521;
  }
  return ((b << 16) | a) >>> 0;
}

/** A zlib stream of stored (uncompressed) blocks. */
function zlibStored(raw: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [Uint8Array.from([0x78, 0x01])];
  for (let at = 0; at < raw.length || at === 0; at += 65_535) {
    const block = raw.subarray(at, at + 65_535);
    const last = at + 65_535 >= raw.length;
    const header = new Uint8Array(5);
    header[0] = last ? 1 : 0;
    header[1] = block.length & 0xff;
    header[2] = block.length >>> 8;
    header[3] = ~block.length & 0xff;
    header[4] = (~block.length >>> 8) & 0xff;
    parts.push(header, block);
  }
  parts.push(u32(adler32(raw)));
  return concat(...parts);
}

/** An 8-bit grayscale PNG: a vertical gradient (real pixels up to 40,000 of them). */
export function pngBytes(width = 8, height = 8): Uint8Array<ArrayBuffer> {
  const header = concat(
    u32(width),
    u32(height),
    Uint8Array.from([8, 0, 0, 0, 0])
  );
  let data: Uint8Array;
  if (width * height <= PIXEL_LIMIT) {
    const rows = new Uint8Array((width + 1) * height);
    for (let y = 0; y < height; y += 1) {
      // Filter type 0, then the row.
      rows.fill(
        Math.floor((y / height) * 255),
        y * (width + 1) + 1,
        (y + 1) * (width + 1)
      );
    }
    data = zlibStored(rows);
  } else {
    data = zlibStored(new Uint8Array(2));
  }
  return concat(
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", data),
    pngChunk("IEND", new Uint8Array(0))
  );
}

/** A baseline JPEG frame header with the size and an empty scan. */
export function jpegBytes(width = 8, height = 8): Uint8Array<ArrayBuffer> {
  const sof = Uint8Array.from([
    0xff,
    0xc0,
    0x00,
    0x0b,
    8,
    height >>> 8,
    height & 0xff,
    width >>> 8,
    width & 0xff,
    1,
    1,
    0x11,
    0,
  ]);
  const jfif = Uint8Array.from([
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00,
    0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  ]);
  const scan = Uint8Array.from([
    0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0, 0x7f,
  ]);
  return concat(
    Uint8Array.from([0xff, 0xd8]),
    jfif,
    sof,
    scan,
    Uint8Array.from([0xff, 0xd9])
  );
}

export type WebpKind = "extended" | "lossless" | "lossy";

function riff(...chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const body = concat(text("WEBP"), ...chunks);
  return concat(text("RIFF"), u32le(body.length), body);
}

function webpChunk(type: string, data: Uint8Array): Uint8Array {
  // Chunks are padded to an even length.
  const pad = data.length % 2 === 0 ? new Uint8Array(0) : new Uint8Array(1);
  return concat(text(type), u32le(data.length), data, pad);
}

function lossyData(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0x30,
    0x01,
    0x00,
    0x9d,
    0x01,
    0x2a,
    width & 0xff,
    (width >>> 8) & 0x3f,
    height & 0xff,
    (height >>> 8) & 0x3f,
    0,
    0,
  ]);
}

function losslessData(width: number, height: number): Uint8Array {
  const bits = ((width - 1) & 0x3f_ff) | (((height - 1) & 0x3f_ff) << 14);
  return concat(
    Uint8Array.from([0x2f]),
    u32le(bits >>> 0),
    Uint8Array.from([0, 0])
  );
}

/** A WebP of the given codec: `VP8 ` (lossy), `VP8L` (lossless) or `VP8X` around a lossy frame. */
export function webpBytes(
  width = 8,
  height = 8,
  kind: WebpKind = "lossy",
  options: { animated?: boolean } = {}
): Uint8Array<ArrayBuffer> {
  if (kind === "lossless") {
    return riff(webpChunk("VP8L", losslessData(width, height)));
  }
  if (kind === "lossy") {
    return riff(webpChunk("VP8 ", lossyData(width, height)));
  }
  const canvas = new Uint8Array(10);
  canvas[0] = options.animated ? 0x02 : 0;
  const w = width - 1;
  const h = height - 1;
  canvas.set([w & 0xff, (w >>> 8) & 0xff, (w >>> 16) & 0xff], 4);
  canvas.set([h & 0xff, (h >>> 8) & 0xff, (h >>> 16) & 0xff], 7);
  return riff(
    webpChunk("VP8X", canvas),
    webpChunk("VP8 ", lossyData(width, height))
  );
}
