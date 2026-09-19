import type { CollectionConfig } from "payload";
import { isAuthenticated } from "@/access";
import { listReadAccess, listUpdateAccess } from "@/access/lists";

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
    delete: listUpdateAccess,
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
    { name: "viewShareToken", type: "text", index: true, unique: true },
    { name: "editShareToken", type: "text", index: true, unique: true },
    { name: "allowSharedEditing", type: "checkbox", defaultValue: false },
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
    },
  ],
};
