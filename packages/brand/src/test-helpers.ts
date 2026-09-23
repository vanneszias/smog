/**
 * Readers for the formats the generator writes, small enough that the tests
 * need neither sharp nor an XML library to check the committed outputs.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** PNG colour types from the IHDR chunk. */
export const PNG_COLOUR_TYPE = { rgb: 2, rgba: 6 } as const;

interface PngHeader {
  width: number;
  height: number;
  colourType: number;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

/**
 * Reads a PNG's dimensions and colour type, and throws unless the bytes
 * start with the PNG signature and an IHDR chunk and end with IEND.
 */
export function readPngHeader(bytes: Uint8Array): PngHeader {
  if (PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) {
    throw new Error("[test-helpers] Not a PNG: bad signature");
  }
  if (ascii(bytes, 12, 4) !== "IHDR") {
    throw new Error("[test-helpers] Not a PNG: first chunk is not IHDR");
  }
  if (ascii(bytes, bytes.byteLength - 8, 4) !== "IEND") {
    throw new Error("[test-helpers] Not a PNG: does not end with IEND");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
    colourType: view.getUint8(25),
  };
}

interface IcoEntry {
  width: number;
  height: number;
  bitsPerPixel: number;
  data: Uint8Array;
}

/** Parses an ICO container into its directory entries and image data. */
export function readIco(bytes: Uint8Array): IcoEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(0, true) !== 0 || view.getUint16(2, true) !== 1) {
    throw new Error("[test-helpers] Not an ICO: bad header");
  }
  const count = view.getUint16(4, true);
  return Array.from({ length: count }, (_, index) => {
    const entry = 6 + 16 * index;
    const size = view.getUint32(entry + 8, true);
    const offset = view.getUint32(entry + 12, true);
    if (offset + size > bytes.byteLength) {
      throw new Error(`[test-helpers] ICO entry ${index} runs past the file`);
    }
    return {
      width: view.getUint8(entry) || 256,
      height: view.getUint8(entry + 1) || 256,
      bitsPerPixel: view.getUint16(entry + 6, true),
      data: bytes.subarray(offset, offset + size),
    };
  });
}

const TAG =
  /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[A-Za-z_:][\w:.-]*="[^"<]*")*)\s*(\/?)>/y;
const WHITESPACE = /\s+/y;

/**
 * Checks that `source` is a well-formed XML document made of elements only
 * (no text, comments or declarations, which none of the generated SVGs
 * have), and returns the root element's attributes.
 */
export function readXmlRoot(source: string): Map<string, string> {
  const open: string[] = [];
  let root: Map<string, string> | undefined;
  let closedRoot = false;
  let position = 0;
  while (position < source.length) {
    WHITESPACE.lastIndex = position;
    if (WHITESPACE.test(source)) {
      position = WHITESPACE.lastIndex;
      continue;
    }
    TAG.lastIndex = position;
    const match = TAG.exec(source);
    if (!match || closedRoot) {
      throw new Error(`[test-helpers] Not well-formed at offset ${position}`);
    }
    position = TAG.lastIndex;
    const attributes = applyTag(match, open);
    root ??= attributes;
    closedRoot = open.length === 0;
  }
  if (!(root && closedRoot)) {
    throw new Error("[test-helpers] Document has no closed root element");
  }
  return root;
}

/**
 * Pushes or pops one tag on the stack of open elements; returns an opening
 * tag's attributes.
 */
function applyTag(
  match: RegExpExecArray,
  open: string[]
): Map<string, string> | undefined {
  const [, closing, name = "", attributes = "", selfClosing] = match;
  if (closing) {
    if (open.pop() !== name) {
      throw new Error(`[test-helpers] Mismatched </${name}>`);
    }
    return;
  }
  if (!selfClosing) {
    open.push(name);
  }
  return parseAttributes(attributes);
}

function parseAttributes(source: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const [, name = "", value = ""] of source.matchAll(
    /([A-Za-z_:][\w:.-]*)="([^"]*)"/g
  )) {
    if (attributes.has(name)) {
      throw new Error(`[test-helpers] Duplicate attribute ${name}`);
    }
    attributes.set(name, value);
  }
  return attributes;
}
