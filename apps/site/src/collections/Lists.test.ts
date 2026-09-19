import { describe, expect, it } from "vitest";
import { isAuthenticated } from "@/access";
import { listReadAccess, listUpdateAccess } from "@/access/lists";
import { Lists } from "./Lists";

const field = (name: string) =>
  Lists.fields.find((f) => "name" in f && f.name === name);

describe("Lists collection", () => {
  it("uses the lists slug", () => {
    expect(Lists.slug).toBe("lists");
  });

  it("wires read through listReadAccess, not a raw boolean", () => {
    // Reference equality: swapping this for isAuthenticated or `() => true`
    // would leak private lists to anyone signed in, or to the whole
    // internet. Behavior is covered by access/lists.test.ts and
    // Lists.int.test.ts.
    expect(Lists.access?.read).toBe(listReadAccess);
  });

  it("wires create through isAuthenticated, so any signed-in user can start a list", () => {
    expect(Lists.access?.create).toBe(isAuthenticated);
  });

  it("wires update and delete through listUpdateAccess, requiring owner or a valid edit token", () => {
    expect(Lists.access?.update).toBe(listUpdateAccess);
    expect(Lists.access?.delete).toBe(listUpdateAccess);
  });

  it("uses name as the admin title", () => {
    expect(Lists.admin?.useAsTitle).toBe("name");
  });

  it("requires an owner relationship to users", () => {
    expect(field("owner")).toMatchObject({
      type: "relationship",
      relationTo: "users",
      required: true,
    });
  });

  it("defaults visibility to private", () => {
    expect(field("visibility")).toMatchObject({
      type: "select",
      required: true,
      defaultValue: "private",
    });
  });

  it("defaults allowSharedEditing and isDefaultFavorites to false", () => {
    expect(field("allowSharedEditing")).toHaveProperty("defaultValue", false);
    expect(field("isDefaultFavorites")).toHaveProperty("defaultValue", false);
  });

  it("has no position field, since array order is the order", () => {
    expect(field("position")).toBeUndefined();
  });

  it("stores items as an array of gesture relationships, ordered by the array itself", () => {
    const items = field("items") as
      | { type?: string; fields?: unknown[] }
      | undefined;
    expect(items?.type).toBe("array");

    const gesture = (
      items?.fields as { name?: string; relationTo?: string }[] | undefined
    )?.find((f) => f.name === "gesture");
    expect(gesture).toMatchObject({
      type: "relationship",
      relationTo: "gestures",
      required: true,
    });
  });

  it("records who added each item", () => {
    const items = field("items") as { fields?: unknown[] } | undefined;
    const addedBy = (
      items?.fields as { name?: string; relationTo?: string }[] | undefined
    )?.find((f) => f.name === "addedBy");
    expect(addedBy).toMatchObject({
      type: "relationship",
      relationTo: "users",
    });
  });
});
