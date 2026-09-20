import { describe, expect, it } from "vitest";
import { isAdmin, isAdminOrSelf } from "@/access";
import { cascadeListsOnUserDelete } from "@/hooks/cascadeListsOnUserDelete";
import { Users } from "./Users";

const field = (name: string) =>
  Users.fields.find((f) => "name" in f && f.name === name);

describe("Users collection", () => {
  it("uses the users slug", () => {
    expect(Users.slug).toBe("users");
  });

  it("wires read and update through isAdminOrSelf, not a raw boolean", () => {
    // Reference equality: swapping this for `isAdmin` would lock users out
    // of their own record, and swapping it for `() => true` would let any
    // signed-in user read or update anyone else's. Behavior is covered
    // end-to-end in Users.int.test.ts.
    expect(Users.access?.read).toBe(isAdminOrSelf);
    expect(Users.access?.update).toBe(isAdminOrSelf);
  });

  it("wires delete through isAdmin", () => {
    expect(Users.access?.delete).toBe(isAdmin);
  });

  it("cascades the owner's lists on delete", () => {
    // The behaviour lives in `Lists.delete.int.test.ts`, which deletes a real
    // user who owns real lists. This pins that the hook is still wired up —
    // unwiring it does not fail any config-shaped assertion, it just returns
    // the raw `Failed query: delete from "users" ...` to whoever next deletes
    // an account. The whole array, so a second hook is a deliberate change.
    expect(Users.hooks?.beforeDelete).toEqual([cascadeListsOnUserDelete]);
  });

  it("allows public registration", () => {
    expect(Users.access?.create?.({} as never)).toBe(true);
  });

  it("adds a role field defaulting to user", () => {
    expect(field("role")).toMatchObject({
      type: "select",
      required: true,
      defaultValue: "user",
    });
  });

  it("guards role updates with a field-level access check, since document-level isAdminOrSelf alone would let a user PATCH their own role to admin", () => {
    const role = field("role") as { access?: { update?: unknown } };
    expect(typeof role.access?.update).toBe("function");
  });

  it("denies a non-admin field-level update on role", () => {
    const role = field("role") as {
      access?: { update?: (args: never) => boolean };
    };
    expect(
      role.access?.update?.({ req: { user: { role: "user" } } } as never)
    ).toBe(false);
  });

  it("allows an admin field-level update on role", () => {
    const role = field("role") as {
      access?: { update?: (args: never) => boolean };
    };
    expect(
      role.access?.update?.({ req: { user: { role: "admin" } } } as never)
    ).toBe(true);
  });
});
