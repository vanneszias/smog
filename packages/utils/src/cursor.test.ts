import { describe, expect, test } from "bun:test";
import {
  decodeCursor,
  decodeCursorAs,
  encodeCursor,
  InvalidCursorError,
} from "./cursor";

const BASE64URL = /^[A-Za-z0-9_-]+$/;

describe("keyset cursors", () => {
  test("round-trip the key values, including non-ASCII text", () => {
    const cursor = encodeCursor(["Één café", "id-1", 3]);
    expect(cursor).toMatch(BASE64URL);
    expect(decodeCursor(cursor)).toEqual(["Één café", "id-1", 3]);
  });

  test("decode anything else to null", () => {
    for (const cursor of [
      "",
      "not a cursor",
      "%%%",
      "e30",
      "bnVsbA",
      "WyJhIix7fV0",
    ]) {
      expect(decodeCursor(cursor)).toBeNull();
    }
  });
});

describe("decodeCursorAs", () => {
  const asPair = ([name, id, ...rest]: (string | number)[]) =>
    typeof name === "string" && typeof id === "string" && rest.length === 0
      ? { id, name }
      : null;

  test("returns the parsed position of a valid cursor", () => {
    expect(decodeCursorAs(encodeCursor(["b", "id-2"]), asPair)).toEqual({
      id: "id-2",
      name: "b",
    });
  });

  test("throws InvalidCursorError for a foreign string or a wrong shape", () => {
    expect(() => decodeCursorAs("not a cursor", asPair)).toThrow(
      InvalidCursorError
    );
    expect(() => decodeCursorAs(encodeCursor([1, "id"]), asPair)).toThrow(
      InvalidCursorError
    );
    expect(() => decodeCursorAs(encodeCursor(["a", "b", "c"]), asPair)).toThrow(
      InvalidCursorError
    );
  });
});
