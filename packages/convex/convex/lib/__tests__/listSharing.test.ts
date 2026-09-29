import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../../_generated/dataModel";
import { toPublicSharedList } from "../listSharing";

function makeList(
  overrides: Partial<Doc<"gesture_lists">> = {}
): Doc<"gesture_lists"> {
  return {
    _creationTime: 1000,
    _id: "list_123" as Id<"gesture_lists">,
    allowSharedEditing: true,
    createdAt: 1000,
    description: "Useful at home",
    editShareToken: "edit_secret",
    isDefaultFavorites: false,
    name: "Therapy signs",
    ownerId: "user_123" as Id<"users">,
    updatedAt: 2000,
    viewShareToken: "view_secret",
    visibility: "shared",
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
