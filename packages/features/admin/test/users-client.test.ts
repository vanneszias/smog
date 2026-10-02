import { ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";
import { userRefusalOf } from "../src/client/use-admin-users";

/* How the user actions surface a guard's refusal (ruling 7). */

describe("userRefusalOf", () => {
  it("reads the reason of an INVALID_STATE refusal", () => {
    expect(
      userRefusalOf(
        new ORPCError("INVALID_STATE", { data: { reason: "self" } })
      )
    ).toBe("self");
    expect(
      userRefusalOf(
        new ORPCError("INVALID_STATE", { data: { reason: "lastAdmin" } })
      )
    ).toBe("lastAdmin");
  });

  it("is null for unknown reasons, other codes and non-errors", () => {
    expect(
      userRefusalOf(new ORPCError("INVALID_STATE", { data: { reason: "x" } }))
    ).toBeNull();
    expect(userRefusalOf(new ORPCError("NOT_FOUND"))).toBeNull();
    expect(userRefusalOf(new Error("network"))).toBeNull();
    expect(userRefusalOf(undefined)).toBeNull();
  });
});
