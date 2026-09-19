import type { CollectionConfig } from "payload";
import { isAdmin, publicReadActive } from "@/access";
import { defaultLocaleRequired } from "@/fields/defaultLocaleRequired";

export const Gestures: CollectionConfig = {
  slug: "gestures",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "categories", "isActive", "updatedAt"],
  },
  access: {
    read: publicReadActive,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: "name",
      type: "text",
      localized: true,
      index: true,
      validate: defaultLocaleRequired<string>("A Dutch name is required."),
    },
    {
      name: "categories",
      type: "relationship",
      relationTo: "categories",
      hasMany: true,
      required: true,
    },
    {
      name: "playbackId",
      type: "text",
      required: true,
      admin: {
        description: "Mux playback ID for the gesture video.",
      },
    },
    {
      name: "concepts",
      type: "text",
      hasMany: true,
      localized: true,
      admin: {
        description: "Alternative words and synonyms used for search.",
      },
    },
    {
      name: "info",
      type: "textarea",
      localized: true,
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
      index: true,
    },
  ],
};
