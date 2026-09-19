import type { CollectionConfig, TextFieldSingleValidation } from "payload";
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
  ],
};
