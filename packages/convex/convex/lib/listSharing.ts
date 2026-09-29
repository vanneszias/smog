import type { Doc } from "../_generated/dataModel";

export function toPublicSharedList(
  list: Doc<"gesture_lists">,
  canEdit: boolean
) {
  return {
    _creationTime: list._creationTime,
    _id: list._id,
    allowSharedEditing: list.allowSharedEditing,
    canEdit: canEdit && list.allowSharedEditing,
    createdAt: list.createdAt,
    description: list.description,
    isDefaultFavorites: list.isDefaultFavorites,
    name: list.name,
    updatedAt: list.updatedAt,
    visibility: "shared" as const,
  };
}
