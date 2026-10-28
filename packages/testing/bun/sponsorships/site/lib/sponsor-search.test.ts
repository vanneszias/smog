import { describe, expect, test } from "bun:test";
import {
  preselectSlugs,
  readLinkToken,
  validatePaymentSearch,
  validateSponsorSearch,
} from "../../../../../../apps/site/src/lib/sponsor-search";

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

  test("the fragment carries the token", () => {
    const token = "a".repeat(43);
    expect(
      readLinkToken({
        hash: `#token=${token}`,
        pathname: "/sponsor/edit",
        search: "",
      })
    ).toEqual({ replaceWith: null, token });
    const uuid = "123e4567-e89b-42d3-a456-426614174000";
    expect(
      readLinkToken({ hash: `#token=${uuid}`, pathname: "/x", search: "" })
        .token
    ).toBe(uuid);
  });

  test("missing or malformed: no token, nothing to move", () => {
    for (const hash of ["", "#", "#token=", "#token=short", "#other=1", "#%"]) {
      expect(
        readLinkToken({ hash, pathname: "/sponsor/edit", search: "" })
      ).toEqual({ replaceWith: null, token: null });
    }
  });

  test("an old ?token= is read and moved into the fragment", () => {
    const token = "a".repeat(43);
    expect(
      readLinkToken({
        hash: "",
        pathname: "/sponsor/renew",
        search: `?token=${token}`,
      })
    ).toEqual({
      replaceWith: `/sponsor/renew#token=${token}`,
      token,
    });
    // Other parameters stay.
    expect(
      readLinkToken({
        hash: "",
        pathname: "/sponsor/edit",
        search: `?x=1&token=${token}`,
      }).replaceWith
    ).toBe(`/sponsor/edit?x=1#token=${token}`);
  });

  test("an invalid query token is still stripped from the address", () => {
    expect(
      readLinkToken({
        hash: "",
        pathname: "/sponsor/edit",
        search: "?token=123",
      })
    ).toEqual({ replaceWith: "/sponsor/edit", token: null });
  });

  test("the fragment wins over the query", () => {
    const a = "a".repeat(43);
    const b = "b".repeat(43);
    expect(
      readLinkToken({
        hash: `#token=${a}`,
        pathname: "/sponsor/edit",
        search: `?token=${b}`,
      })
    ).toEqual({ replaceWith: `/sponsor/edit#token=${a}`, token: a });
  });
});
