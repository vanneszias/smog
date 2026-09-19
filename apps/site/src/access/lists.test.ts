import { describe, expect, it } from "vitest";
import {
  isListOwnerField,
  listDeleteAccess,
  listReadAccess,
  listUpdateAccess,
} from "./lists";

const req = (user: unknown, token?: string) =>
  ({
    req: {
      user,
      searchParams: new URLSearchParams(token ? { shareToken: token } : {}),
    },
  }) as never;

const fieldReq = (user: unknown, doc?: { owner: unknown }) =>
  ({ req: { user }, doc }) as never;

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

describe("listUpdateAccess", () => {
  it("gives admins everything", () => {
    expect(listUpdateAccess(req({ id: 1, role: "admin" }))).toBe(true);
  });

  it("gives an owner their own lists", () => {
    expect(listUpdateAccess(req({ id: 5, role: "user" }))).toEqual({
      owner: { equals: 5 },
    });
  });

  it("denies an anonymous request with no token instead of matching tokenless lists", () => {
    expect(listUpdateAccess(req(null))).toBe(false);
  });

  it("denies an empty-string token", () => {
    expect(listUpdateAccess(req(null, ""))).toBe(false);
  });

  it("requires both the edit token and allowSharedEditing, not just one", () => {
    // Exact shape, not toMatchObject: swapping `editShareToken` for
    // `viewShareToken` (an edit link that's secretly a read-only link) or
    // dropping the `allowSharedEditing` clause (an edit link that works
    // even after the owner turns sharing off) would both still pass a
    // looser assertion. This one fails either mutation — see
    // task-5-report.md for the mutation runs that prove it.
    expect(listUpdateAccess(req(null, "edit-token-123"))).toEqual({
      and: [
        { editShareToken: { equals: "edit-token-123" } },
        { allowSharedEditing: { equals: true } },
      ],
    });
  });
});

describe("listDeleteAccess", () => {
  it("gives admins everything", () => {
    expect(listDeleteAccess(req({ id: 1, role: "admin" }))).toBe(true);
  });

  it("gives an owner their own lists", () => {
    expect(listDeleteAccess(req({ id: 5, role: "user" }))).toEqual({
      owner: { equals: 5 },
    });
  });

  it("denies an anonymous request with no token", () => {
    expect(listDeleteAccess(req(null))).toBe(false);
  });

  it("denies an anonymous request even with a valid-shaped edit token, unlike listUpdateAccess", () => {
    // Deletion has no share-token path at all: holding an edit link lets you
    // change a list's items, not destroy the list itself.
    expect(listDeleteAccess(req(null, "edit-token-123"))).toBe(false);
  });
});

describe("isListOwnerField", () => {
  it("allows admins regardless of ownership", () => {
    expect(
      isListOwnerField(fieldReq({ id: 1, role: "admin" }, { owner: 5 }))
    ).toBe(true);
  });

  it("allows the list's owner", () => {
    expect(
      isListOwnerField(fieldReq({ id: 5, role: "user" }, { owner: 5 }))
    ).toBe(true);
  });

  it("denies a signed-in user who is not the owner", () => {
    expect(
      isListOwnerField(fieldReq({ id: 6, role: "user" }, { owner: 5 }))
    ).toBe(false);
  });

  it("denies anonymous requests, even against a list with no owner set", () => {
    expect(isListOwnerField(fieldReq(null, { owner: 5 }))).toBe(false);
  });

  it("denies when there is no prior document (create), rather than throwing", () => {
    expect(isListOwnerField(fieldReq({ id: 5, role: "user" }, undefined))).toBe(
      false
    );
  });

  it("compares against a populated owner object, not just a raw id", () => {
    expect(
      isListOwnerField(fieldReq({ id: 5, role: "user" }, { owner: { id: 5 } }))
    ).toBe(true);
  });
});
