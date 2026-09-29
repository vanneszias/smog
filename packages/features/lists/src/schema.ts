/**
 * `@smog/lists/schema`: the Zod schemas, limits and types shared by the
 * contract, the server, the hooks and the UI. Client-safe (no server
 * imports).
 */
import { gestureSummarySchema } from "@smog/gestures/schema";
import { z } from "zod";

/** `list.name`, trimmed (the `list_name_length_check` CHECK). */
export const LIST_NAME_MAX = 80;
/** `list.description`, trimmed (the `list_description_length_check` CHECK). */
export const LIST_DESCRIPTION_MAX = 280;
/** Lists per account: `mine` returns them all in one bounded read. */
export const LISTS_MAX = 100;
/** Gestures per list: `get`, `shared.get` and `reorder` stay bounded. */
export const LIST_ITEMS_MAX = 500;

/**
 * `list_share.role`: the values of `@smog/db` `LIST_SHARE_ROLES` (the share
 * service writes and reads that column, so a mismatch fails its type-check).
 */
export const SHARE_ROLES = ["view", "edit"] as const;
export const shareRoleSchema = z.enum(SHARE_ROLES);

/** A server list id (UUID) or a guest list id (`loc_<uuid>`). */
export const listIdSchema = z.string().min(1).max(64);
export const gestureIdSchema = z.string().min(1).max(64);
/** A share token (`newToken()`: 43 base64url characters). */
export const shareTokenSchema = z.string().min(1).max(128);

/** A list name: trimmed, 1..80 characters. */
export const listNameSchema = z.string().trim().min(1).max(LIST_NAME_MAX);

/** A description: trimmed, at most 280 characters; empty (or null) clears it. */
export const listDescriptionSchema = z
  .string()
  .trim()
  .max(LIST_DESCRIPTION_MAX)
  .nullable()
  .transform((value) => (value === "" ? null : value));

/** Guest lists live on the device, with `loc_` ids (`@smog/local-store`). */
export const LOCAL_LIST_PREFIX = "loc_";

export function isLocalListId(id: string): boolean {
  return id.startsWith(LOCAL_LIST_PREFIX);
}

export const listSummarySchema = z.object({
  description: z.string().nullable(),
  id: z.string(),
  /** Published gestures in the list. */
  itemCount: z.number().int().nonnegative(),
  name: z.string(),
  /** Whether an active share link exists, per role. */
  shares: z.object({ edit: z.boolean(), view: z.boolean() }),
  /** Epoch milliseconds. */
  updatedAt: z.number().int(),
});

/** A published gesture in a list, with its place (0-based, ascending). */
export const listItemSchema = gestureSummarySchema.extend({
  position: z.number().int().nonnegative(),
});

export const listDetailSchema = listSummarySchema.extend({
  /** Published gestures only, in list order. */
  items: z.array(listItemSchema),
});

export const shareLinkSchema = z.object({
  /** Epoch milliseconds. */
  createdAt: z.number().int(),
  token: z.string(),
  /** `SITE_URL/lists/<token>`. */
  url: z.string(),
});

export const shareLinksSchema = z.object({
  edit: shareLinkSchema.nullable(),
  view: shareLinkSchema.nullable(),
});

/** What a share link shows: never the owner's email, id or other tokens. */
export const sharedListSchema = z.object({
  items: z.array(listItemSchema),
  list: z.object({
    description: z.string().nullable(),
    name: z.string(),
    /** The owner's name, or a localised fallback when it is empty. */
    ownerName: z.string(),
  }),
  role: shareRoleSchema,
});

export type ShareRole = z.infer<typeof shareRoleSchema>;
export type ListSummary = z.infer<typeof listSummarySchema>;
export type ListItem = z.infer<typeof listItemSchema>;
export type ListDetail = z.infer<typeof listDetailSchema>;
export type ShareLink = z.infer<typeof shareLinkSchema>;
export type ShareLinks = z.infer<typeof shareLinksSchema>;
export type SharedList = z.infer<typeof sharedListSchema>;
