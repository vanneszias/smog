/**
 * `@smog/account/schema`: the Zod schemas and limits of the account
 * procedures, shared by the contract, the server and the hooks.
 * Client-safe (no server imports).
 */
import {
  gestureIdSchema,
  LIST_DESCRIPTION_MAX,
  LIST_ITEMS_MAX,
  LISTS_MAX,
  listNameSchema,
} from "@smog/lists/schema";
import { z } from "zod";

/** Favorites per import call (the rest stays on the device for the next one). */
export const IMPORT_FAVORITES_MAX = 1000;
/** Lists per import call: what one account can hold (`LISTS_MAX`). */
export const IMPORT_LISTS_MAX = LISTS_MAX;
/** Gestures per imported list: what one list can hold (`LIST_ITEMS_MAX`). */
export const IMPORT_LIST_ITEMS_MAX = LIST_ITEMS_MAX;

/** A guest list as the import sends it (name and description trimmed). */
export const importListSchema = z.object({
  /** Empty (after trimming) means none. */
  description: z
    .string()
    .trim()
    .max(LIST_DESCRIPTION_MAX)
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  /** In list order. */
  gestureIds: z.array(gestureIdSchema).max(IMPORT_LIST_ITEMS_MAX),
  name: listNameSchema,
});

/** The guest's analytics choice (`GuestData.consent`, once decided). */
export const importConsentSchema = z.object({
  analytics: z.boolean(),
  /** Epoch milliseconds. */
  decidedAt: z.number().int().nonnegative(),
});

export const importGuestDataInputSchema = z.object({
  consent: importConsentSchema.optional(),
  /** Oldest first, as the device stores them. */
  favorites: z.array(gestureIdSchema).max(IMPORT_FAVORITES_MAX),
  lists: z.array(importListSchema).max(IMPORT_LISTS_MAX),
});

const count = z.number().int().nonnegative();

/**
 * What became of one guest list: `created`, `merged` into a same-name
 * list, or `notCreated` (the account is at `LISTS_MAX`), which the device
 * keeps. `unplaced` are its published gestures that did not fit
 * (`LIST_ITEMS_MAX`); the device keeps those too.
 */
export const IMPORT_LIST_STATUSES = [
  "created",
  "merged",
  "notCreated",
] as const;

export const importListOutcomeSchema = z.object({
  status: z.enum(IMPORT_LIST_STATUSES),
  unplaced: z.array(z.string()),
});

export const importResultSchema = z.object({
  favoritesAdded: count,
  /** Items appended to created and merged lists. */
  itemsAdded: count,
  /** Items not added because their list reached `LIST_ITEMS_MAX`. */
  itemsOverLimit: count,
  /** One outcome per guest list sent, in the order sent. */
  lists: z.array(importListOutcomeSchema),
  listsCreated: count,
  /** Guest lists appended to a same-name list (case-insensitive, trimmed). */
  listsMerged: count,
  /** Guest lists not created because the account has `LISTS_MAX` lists. */
  listsOverLimit: count,
  /**
   * Distinct gesture ids that are unknown, unpublished or malformed
   * (skipped; the client adds the malformed ones it never sent).
   */
  skippedUnknownGestures: count,
});

export type ImportList = z.input<typeof importListSchema>;
/** What a client sends. */
export type ImportGuestDataInput = z.input<typeof importGuestDataInputSchema>;
/** What the server gets after the contract parsed it (trimmed). */
export type ImportGuestData = z.output<typeof importGuestDataInputSchema>;
export type ImportResult = z.infer<typeof importResultSchema>;
export type ImportListOutcome = z.infer<typeof importListOutcomeSchema>;

/** Nothing imported: what `importGuestData` answers when there is nothing to send. */
export const EMPTY_IMPORT_RESULT: ImportResult = {
  favoritesAdded: 0,
  itemsAdded: 0,
  itemsOverLimit: 0,
  lists: [],
  listsCreated: 0,
  listsMerged: 0,
  listsOverLimit: 0,
  skippedUnknownGestures: 0,
};
