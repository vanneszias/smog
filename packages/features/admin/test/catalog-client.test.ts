import { ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";
import { staleIdsOf } from "../src/client/use-admin-gestures";

/* How the catalogue hooks surface a stale save (`staleIds`). */

describe("staleIdsOf", () => {
  it("reads the ids of a CONFLICT stale error", () => {
    const error = new ORPCError("CONFLICT", {
      data: { ids: ["a", "b"], reason: "stale" },
    });
    expect(staleIdsOf(error)).toEqual(["a", "b"]);
  });

  it("is null for other conflicts, other codes and non-errors", () => {
    expect(
      staleIdsOf(new ORPCError("CONFLICT", { data: { reason: "inUse" } }))
    ).toBeNull();
    expect(staleIdsOf(new ORPCError("NOT_FOUND"))).toBeNull();
    expect(staleIdsOf(new Error("network"))).toBeNull();
    expect(staleIdsOf(null)).toBeNull();
  });
});
