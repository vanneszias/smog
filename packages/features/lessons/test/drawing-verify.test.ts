import { describe, expect, it } from "vitest";
import { inspectDrawing } from "../src/server/drawing-verify";
import { jpegBytes, pngBytes, webpBytes } from "../src/testing";

describe("inspectDrawing", () => {
  it("reads the type and size of a PNG, a JPEG and the three WebP codecs", () => {
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
    for (const kind of ["lossy", "lossless", "extended"] as const) {
      expect(inspectDrawing(webpBytes(300, 200, kind)), kind).toEqual({
        contentType: "image/webp",
        height: 200,
        ok: true,
        width: 300,
      });
    }
  });

  it("accepts exactly 2000 px on a side and refuses 2001", () => {
    expect(inspectDrawing(pngBytes(2000, 2000)).ok).toBe(true);
    expect(inspectDrawing(pngBytes(2001, 10))).toEqual({
      ok: false,
      reason: "dimensions",
    });
    expect(inspectDrawing(jpegBytes(10, 3000))).toEqual({
      ok: false,
      reason: "dimensions",
    });
    expect(inspectDrawing(webpBytes(3000, 10, "lossless"))).toEqual({
      ok: false,
      reason: "dimensions",
    });
    expect(inspectDrawing(webpBytes(10, 4000, "extended"))).toEqual({
      ok: false,
      reason: "dimensions",
    });
  });

  it("refuses a file over 1 MiB, an empty file and files that are not images", () => {
    expect(inspectDrawing(new Uint8Array(1_048_577))).toEqual({
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

  it("refuses an animated WebP, an unknown chunk and a RIFF that is not WebP", () => {
    expect(
      inspectDrawing(webpBytes(8, 8, "extended", { animated: true })).ok
    ).toBe(false);
    const unknown = webpBytes();
    unknown.set(new TextEncoder().encode("ABCD"), 12);
    expect(inspectDrawing(unknown).ok).toBe(false);
    const wave = webpBytes();
    wave.set(new TextEncoder().encode("WAVE"), 8);
    expect(inspectDrawing(wave).ok).toBe(false);
    const short = webpBytes();
    expect(inspectDrawing(short.slice(0, short.length - 4)).ok).toBe(false);
  });

  it("does not trust a magic number alone: a PNG signature with an HTML body is refused", () => {
    const forged = new Uint8Array(100);
    forged.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    forged.set(new TextEncoder().encode("<script>"), 8);
    expect(inspectDrawing(forged).ok).toBe(false);
  });
});
