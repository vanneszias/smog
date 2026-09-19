import type { CollectionConfig } from "payload";
import { denyAll, isAdmin } from "@/access";

/**
 * A record of what a user agreed to, and when.
 *
 * Same append-only rule as `admin-logs`, for the same reason with legal
 * weight attached: a consent record is only evidence if nothing reachable
 * over the API can create, amend or erase one. Writes go through a
 * server-side hook on the local API, where `overrideAccess` defaults to
 * `true`.
 *
 * `analyticsConsent` is `required` in Payload's sense — "must be a boolean"
 * (`fields/validations.js`'s `checkbox`, 3.89.0), not "must be true" — so an
 * explicit refusal is recordable, which is the case that matters most.
 *
 * `createdAt` is the timestamp; there is no hand-written duplicate of it.
 */
export const UserConsents: CollectionConfig = {
  slug: "user-consents",
  admin: {
    useAsTitle: "consentVersion",
    defaultColumns: ["user", "analyticsConsent", "consentVersion", "createdAt"],
  },
  access: {
    read: isAdmin,
    create: denyAll,
    update: denyAll,
    delete: denyAll,
  },
  fields: [
    // Deliberately NOT required, which is what makes the column nullable and
    // the `ON DELETE set null` Payload emits actually executable. A consent
    // record is legal evidence with its own retention period: it has to
    // outlive the account it describes, anonymised rather than destroyed,
    // and deleting the user is often precisely the event it must survive.
    // Required here would instead make the FK unsatisfiable, so deleting a
    // user who ever consented would fail with a raw SQL error.
    { name: "user", type: "relationship", relationTo: "users", index: true },
    { name: "analyticsConsent", type: "checkbox", required: true },
    { name: "marketingConsent", type: "checkbox" },
    // Which version of the policy text the user was shown. Without it, the
    // record says someone agreed but not to what.
    { name: "consentVersion", type: "text", required: true },
    { name: "ipAddress", type: "text" },
    { name: "userAgent", type: "text" },
  ],
};
