import { describe, expect, it } from "vitest";
import { inspectDrawing } from "../src/server/drawing-verify";
import { jpegBytes, pngBytes, webpBytes } from "../src/testing";

describe("inspectDrawing", () => {
  it("reads the type and size of a PNG and a JPEG", () => {
    expect(inspectDrawing(pngBytes(120, 80))).toEqual({
      contentType: "image/png",
      height: 80,
      ok: true,
      width: 120,
    });
    expect(inspectDrawing(jpegBytes(640, 480))).toEqual({
      contentType: "image/jpeg",
      height: 480,
      ok: true,
      width: 640,
    });
  });

  it("refuses every WebP codec: pdf-lib cannot embed it", () => {
    for (const kind of ["lossy", "lossless", "extended"] as const) {
      expect(inspectDrawing(webpBytes(300, 200, kind)), kind).toEqual({
        ok: false,
        reason: "format",
      });
    }
  });

  it("accepts exactly 1200 px on a side and refuses 1201", () => {
    expect(inspectDrawing(pngBytes(1200, 1200)).ok).toBe(true);
    expect(inspectDrawing(pngBytes(1201, 10))).toEqual({
      ok: false,
      reason: "dimensions",
    });
    expect(inspectDrawing(jpegBytes(10, 3000))).toEqual({
      ok: false,
      reason: "dimensions",
    });
  });

  it("refuses a file over 512 KiB, an empty file and files that are not images", () => {
    expect(inspectDrawing(new Uint8Array(524_289))).toEqual({
      ok: false,
      reason: "tooLarge",
    });
    expect(inspectDrawing(new Uint8Array(0))).toEqual({
      ok: false,
      reason: "format",
    });
    for (const text of [
      "<svg xmlns='http://www.w3.org/2000/svg'/>",
      "GIF89a\u0001\u0000\u0001\u0000",
      "%PDF-1.7",
      "<html><script>alert(1)</script>",
    ]) {
      expect(inspectDrawing(new TextEncoder().encode(text)).ok).toBe(false);
    }
  });

  it("refuses a PNG with a wrong CRC, no IEND, a bad colour type or a cut-off file", () => {
    const wrongCrc = pngBytes();
    wrongCrc[16] = ((wrongCrc[16] ?? 0) + 1) % 256;
    expect(inspectDrawing(wrongCrc).ok).toBe(false);
    const full = pngBytes();
    expect(inspectDrawing(full.slice(0, full.length - 12)).ok).toBe(false);
    expect(inspectDrawing(full.slice(0, 20)).ok).toBe(false);
    // A forged IHDR whose CRC was not recomputed (colour type 5 is invalid).
    const colour = pngBytes();
    colour[25] = 5;
    expect(inspectDrawing(colour).ok).toBe(false);
  });

  it("refuses a JPEG without a frame, without an end marker or a truncated segment", () => {
    const jpeg = jpegBytes();
    expect(inspectDrawing(jpeg.slice(0, jpeg.length - 2)).ok).toBe(false);
    expect(inspectDrawing(jpeg.slice(0, 12)).ok).toBe(false);
    expect(inspectDrawing(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])).ok).toBe(
      false
    );
  });

  it("does not trust a magic number alone: a PNG signature with an HTML body is refused", () => {
    const forged = new Uint8Array(100);
    forged.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    forged.set(new TextEncoder().encode("<script>"), 8);
    expect(inspectDrawing(forged).ok).toBe(false);
  });
});
