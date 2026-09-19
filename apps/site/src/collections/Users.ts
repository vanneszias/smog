import type { CollectionConfig } from "payload";
import { isAdmin, isAdminOrSelf } from "@/access";

export const Users: CollectionConfig = {
  slug: "users",
  admin: {
    useAsTitle: "email",
  },
  auth: true,
  access: {
    read: isAdminOrSelf,
    // Public registration is intentional; Stage 4 revisits it when social
    // login lands.
    create: () => true,
    update: isAdminOrSelf,
    delete: isAdmin,
  },
  fields: [
    // Email added by default
    // Add more fields as needed
    {
      name: "role",
      type: "select",
      required: true,
      defaultValue: "user",
      options: [
        { label: "User", value: "user" },
        { label: "Admin", value: "admin" },
      ],
      access: {
        // Without this, isAdminOrSelf already grants a user document-level
        // update on their own record, so any user could PATCH their own
        // role to "admin". This field-level check is the only thing
        // stopping that self-escalation.
        update: ({ req: { user } }) => user?.role === "admin",
      },
      index: true,
    },
  ],
  versions: false,
};
