import { describe, expect, it } from "vitest";
import {
  denyAll,
  isAdmin,
  isAdminOrSelf,
  isAuthenticated,
  publicReadActive,
} from ".";

const req = (user: unknown) => ({ req: { user } }) as never;

describe("isAdmin", () => {
  it("allows admins", () => {
    expect(isAdmin(req({ id: 1, role: "admin" }))).toBe(true);
  });

  it("denies regular users", () => {
    expect(isAdmin(req({ id: 1, role: "user" }))).toBe(false);
  });

  it("denies anonymous requests", () => {
    expect(isAdmin(req(null))).toBe(false);
  });
});

describe("publicReadActive", () => {
  it("gives admins unrestricted access", () => {
    expect(publicReadActive(req({ id: 1, role: "admin" }))).toBe(true);
  });

  it("restricts anonymous reads to active documents with a filter, not a boolean", () => {
    const result = publicReadActive(req(null));
    expect(result).not.toBe(true);
    expect(result).toEqual({ isActive: { equals: true } });
  });

  it("restricts signed-in non-admins the same way", () => {
    expect(publicReadActive(req({ id: 1, role: "user" }))).toEqual({
      isActive: { equals: true },
    });
  });
});

describe("isAdminOrSelf", () => {
  it("allows admins to reach every document", () => {
    expect(isAdminOrSelf(req({ id: 1, role: "admin" }))).toBe(true);
  });

  it("restricts a user to their own document", () => {
    expect(isAdminOrSelf(req({ id: 7, role: "user" }))).toEqual({
      id: { equals: 7 },
    });
  });

  it("denies anonymous requests outright", () => {
    expect(isAdminOrSelf(req(null))).toBe(false);
  });
});

describe("isAuthenticated", () => {
  it("allows any signed-in user", () => {
    expect(isAuthenticated(req({ id: 1, role: "user" }))).toBe(true);
  });

  it("denies anonymous requests", () => {
    expect(isAuthenticated(req(null))).toBe(false);
  });
});

describe("denyAll", () => {
  it("denies anonymous requests", () => {
    expect(denyAll(req(null))).toBe(false);
  });

  it("denies signed-in users", () => {
    expect(denyAll(req({ id: 1, role: "user" }))).toBe(false);
  });

  it("denies admins too, which is the whole point of an audit trail", () => {
    // If an admin could POST to /api/admin-logs, the log would record
    // whatever an admin wanted it to record. The only writer is a server-side
    // hook using the local API, where `overrideAccess` defaults to true.
    expect(denyAll(req({ id: 1, role: "admin" }))).toBe(false);
  });
});
