import type { CollectionConfig } from "payload";
import { isAdmin, isAdminField, isAdminOrSelf } from "@/access";

export const Users: CollectionConfig = {
  slug: "users",
  admin: {
    useAsTitle: "email",
    // Without this, Payload lets ANY authenticated user load /admin. Public
    // registration is on, so that would be one signup away from the whole
    // admin panel.
    hidden: ({ user }) => user?.role !== "admin",
  },
  auth: true,
  access: {
    read: isAdminOrSelf,
    // Public registration is intentional; Stage 4 revisits it when social
    // login lands. The `role` field below is what keeps that from being an
    // admin signup form.
    create: () => true,
    update: isAdminOrSelf,
    delete: isAdmin,
    // Payload's defaultUnlockAccess is any authenticated user of the admin
    // collection, so without this any account could clear any victim's login
    // lockout on demand and brute-force protection would be decorative.
    unlock: isAdmin,
    // `access.admin` decides who may load /admin at all. Its signature is
    // boolean-only — unlike `Access`, it has no `Where` form — so it takes the
    // field-level predicate rather than `isAdmin`. Without it Payload lets any
    // authenticated user in, which with public registration is one signup away
    // from the whole admin panel.
    admin: isAdminField,
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
        // BOTH of these are load-bearing, and `create` is the one that is
        // easy to miss.
        //
        // `update`: isAdminOrSelf already grants a user document-level update
        // on their own record, so without this any user could PATCH their own
        // role to "admin".
        //
        // `create`: collection-level create is public by design. Without a
        // field-level create guard, an anonymous POST to /api/users carrying
        // `role: "admin"` produces an admin account — full takeover in one
        // unauthenticated request. A field guard on `update` alone does not
        // cover the create path.
        create: isAdminField,
        update: isAdminField,
      },
      index: true,
    },
  ],
  versions: false,
};
