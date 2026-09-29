import { describe, expect, test } from "bun:test";
import { decodeCursor, encodeCursor } from "./cursor";

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
