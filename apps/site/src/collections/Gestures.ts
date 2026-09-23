import type { CollectionConfig } from "payload";
import { isAdmin, publicReadActive } from "@/access";
import { defaultLocaleRequired } from "@/fields/defaultLocaleRequired";
import { blockDeleteWhenSponsored } from "@/hooks/blockDeleteWhenSponsored";
import { dropDeletedGestureFromLists } from "@/hooks/dropDeletedGestureFromLists";

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
  // Two different answers to "something points at this gesture", and the
  // order is load-bearing. A gesture someone paid to sponsor cannot be
  // deleted out from under the sponsorship, so that guard refuses first;
  // only then is the gesture stripped from the lists that merely hold it,
  // which the spec's referential-integrity table rules should survive the
  // delete rather than block it. See each hook's doc comment.
  hooks: {
    beforeDelete: [blockDeleteWhenSponsored, dropDeletedGestureFromLists],
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
    // The Convex `_id` this gesture was migrated from (Stage 9). Unique so
    // the importer's rerun cannot create a second gesture for one Convex
    // row, indexed because every lookup the importer makes is an equality
    // match on it. Hidden and read-only: this is bookkeeping for the
    // importer, not something an editor picks or edits, and a gesture
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
