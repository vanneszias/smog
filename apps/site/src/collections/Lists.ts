import type { CollectionConfig } from "payload";
import { isAuthenticated } from "@/access";
import {
  isListOwnerField,
  listDeleteAccess,
  listReadAccess,
  listUpdateAccess,
} from "@/access/lists";

export const Lists: CollectionConfig = {
  slug: "lists",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "owner", "visibility", "updatedAt"],
  },
  access: {
    read: listReadAccess,
    create: isAuthenticated,
    update: listUpdateAccess,
    // Deliberately not listUpdateAccess: deleting a list is a strictly
    // bigger, non-undoable authority than editing its items, and an
    // anonymous edit-link holder should never have it. See
    // access/lists.ts's listDeleteAccess doc comment.
    delete: listDeleteAccess,
  },
  fields: [
    { name: "name", type: "text", required: true },
    { name: "description", type: "textarea" },
    {
      name: "owner",
      type: "relationship",
      relationTo: "users",
      required: true,
      index: true,
    },
    {
      name: "visibility",
      type: "select",
      required: true,
      defaultValue: "private",
      options: [
        { label: "Private", value: "private" },
        { label: "Shared", value: "shared" },
      ],
    },
    {
      name: "viewShareToken",
      type: "text",
      index: true,
      unique: true,
      // Without this, an anonymous request holding a valid edit link could
      // rotate this field via the same update that's letting it edit items,
      // and lock the owner out of their own read-only link too.
      access: { update: isListOwnerField },
    },
    {
      name: "editShareToken",
      type: "text",
      index: true,
      unique: true,
      // Same reasoning as viewShareToken, but for the token that grants
      // edit access in the first place — the more dangerous of the two to
      // let an anonymous editor rotate.
      access: { update: isListOwnerField },
    },
    {
      name: "allowSharedEditing",
      type: "checkbox",
      defaultValue: false,
      // Without this, an anonymous edit-link holder whose access the owner
      // just revoked (by flipping this to false) could flip it right back.
      access: { update: isListOwnerField },
    },
    { name: "isDefaultFavorites", type: "checkbox", defaultValue: false },
    {
      name: "items",
      type: "array",
      labels: { singular: "Gesture", plural: "Gestures" },
      fields: [
        {
          name: "gesture",
          type: "relationship",
          relationTo: "gestures",
          required: true,
        },
        {
          name: "addedBy",
          type: "relationship",
          relationTo: "users",
        },
      ],
      hooks: {
        // Same latent bug Task 4 found for `users.favorites`: Payload's
        // array field does not dedupe on its own, and Convex enforced one
        // row per (list, gesture) via a `by_list_gesture` index plus an
        // early return. `Set`-based dedupe there was enough because a
        // favorite is bare gesture ids; here each row also carries
        // `addedBy`, so dedupe has to walk the rows and decide which one
        // wins — first occurrence, so a gesture keeps its original position
        // rather than jumping to wherever a duplicate got added.
        beforeChange: [
          ({ value }) => {
            if (!Array.isArray(value)) {
              return value;
            }

            const seen = new Set<number | string>();
            const deduped: typeof value = [];

            for (const item of value) {
              const gesture = (item as { gesture?: unknown } | undefined)
                ?.gesture;
              const gestureId =
                typeof gesture === "object" &&
                gesture !== null &&
                "id" in gesture
                  ? (gesture as { id: number | string }).id
                  : (gesture as number | string | undefined);

              if (gestureId === undefined || seen.has(gestureId)) {
                continue;
              }

              seen.add(gestureId);
              deduped.push(item);
            }

            return deduped;
          },
        ],
      },
    },
  ],
};
