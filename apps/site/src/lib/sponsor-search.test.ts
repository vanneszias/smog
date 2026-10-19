import { describe, expect, test } from "bun:test";
import {
  preselectSlugs,
  validatePaymentSearch,
  validateSponsorSearch,
  validateTokenSearch,
} from "./sponsor-search";

describe("the sponsor pages' query params", () => {
  test("?gesture= keeps up to 10 distinct slugs, comma separated (ruling 13)", () => {
    expect(validateSponsorSearch({ gesture: "hond" })).toEqual({
      gesture: "hond",
    });
    expect(validateSponsorSearch({ gesture: " hond, kat ,hond,," })).toEqual({
      gesture: "hond,kat",
    });
    // TanStack parses repeated or JSON values; both are taken.
    expect(validateSponsorSearch({ gesture: ["hond", "kat"] })).toEqual({
      gesture: "hond,kat",
    });
    expect(validateSponsorSearch({ gesture: 2024 })).toEqual({
      gesture: "2024",
    });
    expect(validateSponsorSearch({ gesture: "" })).toEqual({});
    expect(validateSponsorSearch({ gestureId: "x", other: 1 })).toEqual({});
    const many = Array.from({ length: 14 }, (_, i) => `g${i}`).join(",");
    expect(
      preselectSlugs(validateSponsorSearch({ gesture: many }).gesture)
    ).toHaveLength(10);
    expect(preselectSlugs("a/b,<x>,ok")).toEqual(["ok"]);
    expect(preselectSlugs(undefined)).toEqual([]);
  });

  test("?payment= is our id or Mollie's", () => {
    expect(
      validatePaymentSearch({ payment: "8c3c5a52-7a0c-4d9b-9d65-1f1d7f0c2a11" })
    ).toEqual({ payment: "8c3c5a52-7a0c-4d9b-9d65-1f1d7f0c2a11" });
    expect(validatePaymentSearch({ payment: "tr_WDqYK6vllg" })).toEqual({
      payment: "tr_WDqYK6vllg",
    });
    expect(validatePaymentSearch({ payment: "<script>" })).toEqual({});
    expect(validatePaymentSearch({})).toEqual({});
  });

  test("?token= is a link token", () => {
    const token = "a".repeat(43);
    expect(validateTokenSearch({ token })).toEqual({ token });
    expect(validateTokenSearch({ token: "short" })).toEqual({});
  });
});
