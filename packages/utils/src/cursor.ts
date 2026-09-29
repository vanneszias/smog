import { toBase64Url } from "./ids";

/** A keyset position: the sort-key values of the last row of a page. */
export type CursorKey = readonly (string | number)[];

/** An opaque page cursor: the key values as base64url JSON. */
export function encodeCursor(key: CursorKey): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(key)));
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/**
 * The key values of a cursor from `encodeCursor`, or `null` for anything
 * else (a tampered or foreign string), so callers answer with a
 * validation error instead of a crash.
 */
export function decodeCursor(cursor: string): (string | number)[] | null {
  try {
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(fromBase64Url(cursor))
    );
    if (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every(
        (item) => typeof item === "string" || typeof item === "number"
      )
    ) {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

/** A `cursor` the list did not issue: callers answer with `VALIDATION`. */
export class InvalidCursorError extends Error {
  constructor() {
    super("[utils] Invalid page cursor");
    this.name = "InvalidCursorError";
  }
}

/**
 * Decodes a cursor and checks its shape with `parse` (`null` for a wrong
 * one); throws `InvalidCursorError` for anything `encodeCursor` did not
 * produce from that shape.
 */
export function decodeCursorAs<T>(
  cursor: string,
  parse: (key: (string | number)[]) => T | null
): T {
  const key = decodeCursor(cursor);
  const position = key ? parse(key) : null;
  if (position === null) {
    throw new InvalidCursorError();
  }
  return position;
}
