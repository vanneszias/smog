import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../../_generated/dataModel";
import { toPublicSharedList } from "../listSharing";

function makeList(
  overrides: Partial<Doc<"gesture_lists">> = {}
): Doc<"gesture_lists"> {
  return {
    _id: "list_123" as Id<"gesture_lists">,
    _creationTime: 1000,
    ownerId: "user_123" as Id<"users">,
    name: "Therapy signs",
    description: "Useful at home",
    visibility: "shared",
    viewShareToken: "view_secret",
    editShareToken: "edit_secret",
    allowSharedEditing: true,
    isDefaultFavorites: false,
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

describe("toPublicSharedList", () => {
  it("does not expose owner id or share tokens", () => {
    const publicList = toPublicSharedList(makeList(), false);

    expect(publicList).not.toHaveProperty("ownerId");
    expect(publicList).not.toHaveProperty("viewShareToken");
    expect(publicList).not.toHaveProperty("editShareToken");
  });

  it("marks edit access only when the list allows shared editing", () => {
    expect(toPublicSharedList(makeList(), true).canEdit).toBe(true);
    expect(
      toPublicSharedList(makeList({ allowSharedEditing: false }), true).canEdit
    ).toBe(false);
  });
});
