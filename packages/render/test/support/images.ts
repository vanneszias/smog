/**
 * Image helpers for the render tests: a PNG encoder for the test logo, the
 * last frame of an MP4 through Remotion's own ffmpeg (the compositor
 * package `@remotion/renderer` installs), and the ΔE probe of ruling 16.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { crc32, deflateSync } from "node:zlib";

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.byteLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.byteLength);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(
    8 + data.byteLength,
    crc32(out.subarray(4, 8 + data.byteLength))
  );
  return out;
}

/**
 * An RGBA PNG of `width` × `height` from `pixel(x, y)`. By default it is
 * stored without compression (deflate level 0), so its size is about
 * `4 × w × h` bytes: the render lane's logo of about 2 MiB.
 */
export function encodePng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number, number],
  level = 0
): Uint8Array {
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 4);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      raw.set(pixel(x, y), row + 1 + x * 4);
    }
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level })),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(
    parts.reduce((sum, part) => sum + part.byteLength, 0)
  );
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

/** The directory of Remotion's ffmpeg for this platform. */
function compositorDir(): string {
  const libc = process.platform === "linux" ? "-gnu" : "";
  const name = `@remotion/compositor-${process.platform}-${process.arch}${libc}`;
  // Resolved from `@remotion/renderer`, whose optional dependency it is.
  const renderer = createRequire(import.meta.url).resolve("@remotion/renderer");
  return dirname(createRequire(renderer).resolve(`${name}/package.json`));
}

function ffmpeg(args: string[]): Buffer {
  const dir = compositorDir();
  const result = spawnSync(join(dir, "ffmpeg"), ["-v", "error", ...args], {
    env: { ...process.env, LD_LIBRARY_PATH: dir },
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${result.stderr.toString()}`);
  }
  return result.stdout;
}

export interface RgbFrame {
  data: Uint8Array;
  height: number;
  width: number;
}

/**
 * Every frame of an MP4 decoded to raw RGB by Remotion's ffmpeg (whose
 * build has neither the `select` filter nor the `rawvideo` muxer); answers the last one and the count, and
 * writes the last one as a PNG to `pngPath` (the lane's artifact for the
 * parity review).
 */
export function lastFrame(
  mp4Path: string,
  size: { height: number; width: number },
  pngPath: string
): { count: number; frame: RgbFrame } {
  const all = ffmpeg([
    "-i",
    mp4Path,
    // The build has no `rawvideo` muxer: raw frames through `image2pipe`.
    "-f",
    "image2pipe",
    "-c:v",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "pipe:1",
  ]);
  const frameBytes = size.width * size.height * 3;
  const count = Math.floor(all.byteLength / frameBytes);
  const data = new Uint8Array(
    all.subarray((count - 1) * frameBytes, count * frameBytes)
  );
  const frame = { data, ...size };
  writeFileSync(
    pngPath,
    encodePng(
      size.width,
      size.height,
      (x, y) => {
        const at = (y * size.width + x) * 3;
        return [data[at] ?? 0, data[at + 1] ?? 0, data[at + 2] ?? 0, 255];
      },
      6
    )
  );
  return { count, frame };
}

function srgbToLinear(value: number): number {
  const v = value / 255;
  return v <= 0.040_45 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function labF(t: number): number {
  return t > 216 / 24_389 ? Math.cbrt(t) : ((24_389 / 27) * t + 16) / 116;
}

/** CIE L*a*b* (D65) of an sRGB colour. */
function toLab([r, g, b]: readonly [number, number, number]): [
  number,
  number,
  number,
] {
  const [lr, lg, lb] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  const x = (0.412_456_4 * lr + 0.357_576_1 * lg + 0.180_437_5 * lb) / 0.950_47;
  const y = 0.212_672_9 * lr + 0.715_152_2 * lg + 0.072_175 * lb;
  const z = (0.019_333_9 * lr + 0.119_192 * lg + 0.950_304_1 * lb) / 1.088_83;
  const [fx, fy, fz] = [labF(x), labF(y), labF(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 ΔE between two sRGB colours. */
function deltaE(
  a: readonly [number, number, number],
  b: readonly [number, number, number]
): number {
  const [la, aa, ba] = toLab(a);
  const [lb, ab, bb] = toLab(b);
  return Math.hypot(la - lb, aa - ab, ba - bb);
}

export function hexToRgb(hex: string): [number, number, number] {
  const channel = (at: number): number =>
    Number.parseInt(hex.slice(at, at + 2), 16);
  return [channel(1), channel(3), channel(5)];
}

/** How many pixels of rows `[top, bottom)` are within `maxDeltaE` of `color`. */
export function countNear(
  frame: RgbFrame,
  color: readonly [number, number, number],
  { bottom, maxDeltaE, top }: { bottom: number; maxDeltaE: number; top: number }
): number {
  let count = 0;
  for (let y = Math.max(0, top); y < Math.min(frame.height, bottom); y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const at = (y * frame.width + x) * 3;
      const pixel: [number, number, number] = [
        frame.data[at] ?? 0,
        frame.data[at + 1] ?? 0,
        frame.data[at + 2] ?? 0,
      ];
      if (deltaE(pixel, color) < maxDeltaE) {
        count += 1;
      }
    }
  }
  return count;
}
