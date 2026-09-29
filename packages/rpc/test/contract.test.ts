import type { Role } from "@smog/auth";
import { ROLES } from "@smog/db";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import { baseContract, ERRORS, roleSchema } from "../src/contract";

describe("@smog/rpc/contract", () => {
  it("keeps roleSchema equal to the auth roles and the db enum", () => {
    expectTypeOf<z.infer<typeof roleSchema>>().toEqualTypeOf<Role>();
    expect(roleSchema.options).toEqual([...ROLES]);
  });

  it("declares the shared error map on every contract procedure", () => {
    const procedure = baseContract.output(roleSchema);
    expect(Object.keys(procedure["~orpc"].errorMap).sort()).toEqual(
      Object.keys(ERRORS).sort()
    );
  });
});
