import { describe, expect, it } from "vitest";
import { listReadAccess } from "./lists";

const req = (user: unknown, token?: string) =>
  ({
    req: {
      user,
      searchParams: new URLSearchParams(token ? { shareToken: token } : {}),
    },
  }) as never;

describe("listReadAccess", () => {
  it("gives admins everything", () => {
    expect(listReadAccess(req({ id: 1, role: "admin" }))).toBe(true);
  });

  it("gives an owner their own lists", () => {
    expect(listReadAccess(req({ id: 5, role: "user" }))).toEqual({
      owner: { equals: 5 },
    });
  });

  it("matches a supplied share token", () => {
    expect(listReadAccess(req(null, "abc123"))).toEqual({
      viewShareToken: { equals: "abc123" },
    });
  });

  it("denies an anonymous request with no token instead of matching tokenless lists", () => {
    expect(listReadAccess(req(null))).toBe(false);
  });

  it("denies an empty-string token", () => {
    expect(listReadAccess(req(null, ""))).toBe(false);
  });
});
