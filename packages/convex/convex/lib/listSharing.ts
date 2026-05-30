import type { Doc } from "../_generated/dataModel";

export function toPublicSharedList(
  list: Doc<"gesture_lists">,
  canEdit: boolean
) {
  return {
    _id: list._id,
    _creationTime: list._creationTime,
    name: list.name,
    description: list.description,
    visibility: "shared" as const,
    allowSharedEditing: list.allowSharedEditing,
    canEdit: canEdit && list.allowSharedEditing,
    isDefaultFavorites: list.isDefaultFavorites,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
  };
}
