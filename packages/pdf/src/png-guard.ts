/**
 * A decompression-bomb check for PNG drawings (phase 10c review fix wave,
 * A-M1). A PNG header says how big the picture is, not how much its `IDAT`
 * stream inflates to: a 400 KB file of a 1 x 1 picture can inflate to 400 MB,
 * and `pdf-lib` inflates it synchronously. `pngInflatesWithin` walks the
 * chunks, inflates the concatenated `IDAT` data through a `DecompressionStream`
 * and gives up as soon as more bytes come out than the header implies (filter
 * byte plus the packed row, per row, per Adam7 pass when interlaced).
 *
 * Pure and dependency free on purpose: the upload checks in `@smog/lessons`
 * and the export engine both import it (`@smog/pdf/png`), and it never
 * reaches `pdf-lib`.
 */

/** The hard ceiling of decoded PNG bytes the engine accepts, whatever the header says (1,200 px RGBA, 16 bit: 11.5 MB). */
export const PNG_MAX_DECODED_BYTES = 16 * 1024 * 1024;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Samples per pixel by colour type. */
const SAMPLES: Readonly<Record<number, number>> = {
  0: 1,
  2: 3,
  3: 1,
  4: 2,
  6: 4,
};

/** Adam7 passes: x start, y start, x step, y step. */
const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
] as const;

function rowBytes(pixels: number, bitsPerPixel: number): number {
  return Math.ceil((pixels * bitsPerPixel) / 8);
}

/** The inflated size the header of `bytes` implies, or `null` when it is no PNG header this check understands. */
export function pngExpectedSize(bytes: Uint8Array): number | null {
  if (
    bytes.length < 33 ||
    PNG_SIGNATURE.some((value, index) => bytes[index] !== value)
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const samples = SAMPLES[bytes[25] ?? -1];
  const interlace = bytes.at(28);
  if (
    !samples ||
    width < 1 ||
    height < 1 ||
    (interlace !== 0 && interlace !== 1)
  ) {
    return null;
  }
  const bitsPerPixel = samples * (bytes[24] ?? 0);
  if (interlace === 0) {
    return height * (1 + rowBytes(width, bitsPerPixel));
  }
  let total = 0;
  for (const [x0, y0, dx, dy] of ADAM7) {
    const passWidth = Math.ceil((width - x0) / dx);
    const passHeight = Math.ceil((height - y0) / dy);
    if (passWidth > 0 && passHeight > 0) {
      total += passHeight * (1 + rowBytes(passWidth, bitsPerPixel));
    }
  }
  return total;
}

/** The concatenated `IDAT` data of a PNG, or `null` for a chunk list that runs past the end. */
function idatOf(bytes: Uint8Array): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [];
  let at = 8;
  while (at + 12 <= bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (at + 12 + length > bytes.length) {
      return null;
    }
    if (type === "IDAT") {
      parts.push(bytes.subarray(at + 8, at + 8 + length));
    }
    if (type === "IEND") {
      break;
    }
    at += 12 + length;
  }
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** True when the `IDAT` stream of the PNG inflates to no more than its header implies (and `PNG_MAX_DECODED_BYTES`). A stream that is not valid zlib is refused. */
export async function pngInflatesWithin(bytes: Uint8Array): Promise<boolean> {
  const expected = pngExpectedSize(bytes);
  if (expected === null || expected > PNG_MAX_DECODED_BYTES) {
    return false;
  }
  const data = idatOf(bytes);
  if (!data || data.length === 0) {
    return false;
  }
  const reader = new Blob([data])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"))
    .getReader();
  let total = 0;
  try {
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: a stream is read in order.
      const { done, value } = await reader.read();
      if (done) {
        return true;
      }
      total += value.length;
      if (total > expected) {
        await reader.cancel();
        return false;
      }
    }
  } catch {
    return false;
  }
}
