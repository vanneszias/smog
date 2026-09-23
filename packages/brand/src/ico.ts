/**
 * Writes an ICO container whose images are PNG streams, the form every
 * browser since IE9 reads. sharp encodes PNG but has no ICO writer, and the
 * container is small enough to write by hand.
 *
 * Layout (all integers little-endian):
 * - ICONDIR, 6 bytes: reserved (0), type (1 = icon), image count.
 * - One ICONDIRENTRY per image, 16 bytes: width and height as one byte each
 *   (0 means 256), palette size (0), reserved (0), colour planes (1),
 *   bits per pixel (32), byte length of the image data, and its offset from
 *   the start of the file.
 * - The image data, here each a complete PNG file, in directory order.
 */

const ICONDIR_SIZE = 6;
const ICONDIRENTRY_SIZE = 16;
const MAX_ICO_DIMENSION = 256;

interface IcoImage {
  /** Square edge length in pixels, 1 to 256. */
  size: number;
  /** A complete PNG file of `size` by `size` pixels. */
  png: Uint8Array;
}

export function encodeIco(images: readonly IcoImage[]): Uint8Array {
  const headerSize = ICONDIR_SIZE + ICONDIRENTRY_SIZE * images.length;
  const totalSize = images.reduce(
    (sum, image) => sum + image.png.byteLength,
    headerSize
  );
  const bytes = new Uint8Array(totalSize);
  const view = new DataView(bytes.buffer);

  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, images.length, true);

  let offset = headerSize;
  images.forEach((image, index) => {
    if (
      !Number.isInteger(image.size) ||
      image.size < 1 ||
      image.size > MAX_ICO_DIMENSION
    ) {
      throw new RangeError(
        `[ico] Image size must be an integer from 1 to ${MAX_ICO_DIMENSION}, got ${image.size}`
      );
    }
    const entry = ICONDIR_SIZE + ICONDIRENTRY_SIZE * index;
    const dimension = image.size === MAX_ICO_DIMENSION ? 0 : image.size;
    view.setUint8(entry, dimension);
    view.setUint8(entry + 1, dimension);
    view.setUint8(entry + 2, 0);
    view.setUint8(entry + 3, 0);
    view.setUint16(entry + 4, 1, true);
    view.setUint16(entry + 6, 32, true);
    view.setUint32(entry + 8, image.png.byteLength, true);
    view.setUint32(entry + 12, offset, true);
    bytes.set(image.png, offset);
    offset += image.png.byteLength;
  });

  return bytes;
}
