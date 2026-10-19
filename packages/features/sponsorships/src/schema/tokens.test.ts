import { describe, expect, test } from "bun:test";
import {
  hashSponsorshipToken,
  newSponsorshipToken,
  sponsorshipTokenSchema,
} from "./tokens";

const BASE64URL_43 = /^[A-Za-z0-9_-]{43}$/;
const HEX_64 = /^[0-9a-f]{64}$/;

describe("sponsorship tokens (ruling 11)", () => {
  test("hashes with SHA-256 as lowercase hex (a known vector)", async () => {
    expect(await hashSponsorshipToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  test("a new token is 32 random bytes in base64url, stored only as its hash", async () => {
    const first = await newSponsorshipToken();
    const second = await newSponsorshipToken();
    expect(first.token).toMatch(BASE64URL_43);
    expect(first.hash).toMatch(HEX_64);
    expect(first.hash).toBe(await hashSponsorshipToken(first.token));
    expect(first.token).not.toBe(second.token);
  });

  test("the schema accepts a new token and an old UUID token", async () => {
    const { token } = await newSponsorshipToken();
    expect(sponsorshipTokenSchema.parse(token)).toBe(token);
    const legacy = "3f1d2c4b-5a69-4e7f-8a1b-2c3d4e5f6a7b";
    expect(sponsorshipTokenSchema.parse(legacy)).toBe(legacy);
    // An old token is looked up by the hash of its raw UUID (spec §15).
    expect(await hashSponsorshipToken(legacy)).toMatch(HEX_64);
  });

  test.each([
    "",
    "short",
    "a".repeat(42),
    "a".repeat(44),
    `${"a".repeat(42)}+`,
    "3f1d2c4b-5a69-4e7f-8a1b-2c3d4e5f6a7",
  ])("the schema refuses %p", (value) => {
    expect(sponsorshipTokenSchema.safeParse(value).success).toBe(false);
  });
});
