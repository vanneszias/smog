import { describe, expect, it } from "bun:test";
import { newId, newToken, sha256Hex } from "./ids";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

describe("newId", () => {
  it("returns a v4 UUID", () => {
    expect(newId()).toMatch(UUID_V4);
  });

  it("returns a new value on every call", () => {
    expect(newId()).not.toBe(newId());
  });
});

describe("newToken", () => {
  it("encodes 32 random bytes as 43 base64url characters", () => {
    const token = newToken();
    expect(token).toHaveLength(43);
    expect(token).toMatch(BASE64URL);
  });

  it("takes the number of bytes", () => {
    expect(newToken(16)).toHaveLength(22);
  });

  it("returns a new value on every call", () => {
    expect(newToken()).not.toBe(newToken());
  });
});

describe("sha256Hex", () => {
  it("hashes the input as lowercase hex", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("hashes the empty string", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });
});
