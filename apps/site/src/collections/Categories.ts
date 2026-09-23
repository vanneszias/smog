import type { CollectionConfig, TextFieldSingleValidation } from "payload";
import { isAdmin, publicReadActive } from "@/access";
import { defaultLocaleRequired } from "@/fields/defaultLocaleRequired";

/**
 * The Dutch (`nl`) value is the source of truth; translations are optional.
 * See `defaultLocaleRequired` for why this isn't a field-level `required: true`.
 */
export const validateName: TextFieldSingleValidation =
  defaultLocaleRequired<string>("A Dutch name is required.");

export const Categories: CollectionConfig = {
  slug: "categories",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "isActive", "updatedAt"],
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
      validate: validateName,
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
      index: true,
    },
    // The Convex `_id` this category was migrated from (Stage 9). Unique so
    // the importer's rerun cannot create a second category for one Convex
    // row, indexed because every lookup the importer makes is an equality
    // match on it. Hidden and read-only: this is bookkeeping for the
    // importer, not something an editor picks or edits, and a category
    // created in the admin after cutover simply has none. See
    // `20260923_001946_add_legacy_ids.ts` for the column and index this adds.
    {
      name: "legacyId",
      type: "text",
      unique: true,
      index: true,
      admin: {
        readOnly: true,
        hidden: true,
      },
    },
  ],
};
