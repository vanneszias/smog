import { describe, expect, it } from "vitest";
import { encodeIco } from "./ico";
import { readIco } from "./test-helpers";

function payload(length: number, fill: number): Uint8Array {
  return new Uint8Array(length).fill(fill);
}

describe("encodeIco", () => {
  it("writes a directory that points at each image in order", () => {
    const images = [
      { size: 16, png: payload(5, 1) },
      { size: 48, png: payload(9, 2) },
      { size: 256, png: payload(3, 3) },
    ];
    const bytes = encodeIco(images);

    expect(bytes.byteLength).toBe(6 + 16 * 3 + 5 + 9 + 3);
    const entries = readIco(bytes);
    expect(entries.map((entry) => entry.width)).toEqual([16, 48, 256]);
    expect(entries.map((entry) => entry.height)).toEqual([16, 48, 256]);
    expect(entries.map((entry) => entry.bitsPerPixel)).toEqual([32, 32, 32]);
    expect(entries.map((entry) => Array.from(entry.data))).toEqual(
      images.map((image) => Array.from(image.png))
    );
  });

  it("stores 256 as 0 in the one-byte dimension fields", () => {
    const bytes = encodeIco([{ size: 256, png: payload(1, 0) }]);
    expect([bytes[6], bytes[7]]).toEqual([0, 0]);
  });

  it.each([0, 257, 1.5])("rejects an image size of %s", (size) => {
    expect(() => encodeIco([{ size, png: payload(1, 0) }])).toThrow(RangeError);
  });
});
