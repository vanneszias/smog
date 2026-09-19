import type { CollectionConfig, TextFieldSingleValidation } from "payload";

/**
 * The Dutch (`nl`) value is the source of truth; translations are optional.
 * A field-level `required: true` would validate per-locale and block saving
 * a document at all in `en`/`fr` until it has its own translation — which
 * would make the admin panel unusable in two of three locales, since the
 * migration plan starts `en` and `fr` empty. So `required` is enforced only
 * for the default locale, via this validator, instead of at the field level.
 */
export const validateName: TextFieldSingleValidation = (value, { req }) => {
  if (req.locale && req.locale !== "nl") {
    return true;
  }
  return typeof value === "string" && value.trim() !== ""
    ? true
    : "A Dutch name is required.";
};

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
