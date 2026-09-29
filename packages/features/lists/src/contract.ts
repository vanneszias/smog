/**
 * `@smog/lists/contract`: the owner's lists, their items and order, share
 * links, and the public shared view (spec §5.2, §7). Mounted as `lists` in
 * `@smog/api`'s `appContract`. Owner procedures need a session; `shared.get`
 * is public; `shared.addItem/removeItem` need a session and an edit link.
 */
import { gestureSummarySchema } from "@smog/gestures/schema";
import { baseContract } from "@smog/rpc/contract";
import { z } from "zod";
import {
  gestureIdSchema,
  LIST_ITEMS_MAX,
  listDescriptionSchema,
  listDetailSchema,
  listIdSchema,
  listNameSchema,
  listSummarySchema,
  sharedListSchema,
  shareLinkSchema,
  shareLinksSchema,
  shareRoleSchema,
  shareTokenSchema,
} from "./schema";

const byId = z.object({ id: listIdSchema });
const item = z.object({ gestureId: gestureIdSchema, id: listIdSchema });
const byRole = z.object({ id: listIdSchema, role: shareRoleSchema });
const sharedItem = z.object({
  gestureId: gestureIdSchema,
  token: shareTokenSchema,
});

export const listsContract = {
  /** Appends a published gesture (`NOT_FOUND` otherwise); a no-op when present. */
  addItem: baseContract.input(item).output(z.object({ added: z.boolean() })),

  /** `INVALID_STATE` at `LISTS_MAX` lists. */
  create: baseContract
    .input(
      z.object({
        description: listDescriptionSchema.optional(),
        name: listNameSchema,
      })
    )
    .output(listSummarySchema),

  /** Deletes the list with its items and share links. */
  delete: baseContract.input(byId).output(z.void()),

  /** The owner's list with its published gestures in order (`NOT_FOUND` otherwise). */
  get: baseContract.input(byId).output(listDetailSchema),

  /** The owner's lists, most recently changed first (at most `LISTS_MAX`). */
  mine: baseContract.output(z.array(listSummarySchema)),

  /** Removes the gesture and closes the gap; a no-op when absent. */
  removeItem: baseContract
    .input(item)
    .output(z.object({ removed: z.boolean() })),

  /**
   * The new order: exactly the list's current (published) gestures, each
   * once, else `INVALID_STATE` (a stale client must reload).
   */
  reorder: baseContract
    .input(
      z.object({
        gestureIds: z.array(gestureIdSchema).max(LIST_ITEMS_MAX),
        id: listIdSchema,
      })
    )
    .output(z.void()),

  share: {
    /** The active link for the role, created when there is none. */
    create: baseContract.input(byRole).output(shareLinkSchema),
    /** The active links (`null` where none). */
    get: baseContract.input(byId).output(shareLinksSchema),
    /** Revokes the role's active link; it 404s at once. A no-op when none. */
    revoke: baseContract.input(byRole).output(z.void()),
  },

  shared: {
    /** Edit link and a session: adds like the owner (`FORBIDDEN` for a view link). */
    addItem: baseContract
      .input(sharedItem)
      .output(z.object({ added: z.boolean() })),
    /** Public: the list behind an active link (`NOT_FOUND` if unknown or revoked). */
    get: baseContract
      .input(z.object({ token: shareTokenSchema }))
      .output(sharedListSchema),
    /** Edit link and a session: removes like the owner (`FORBIDDEN` for a view link). */
    removeItem: baseContract
      .input(sharedItem)
      .output(z.object({ removed: z.boolean() })),
  },

  /** Renames or redescribes (a `null` or empty description clears it). */
  update: baseContract
    .input(
      z.object({
        description: listDescriptionSchema.optional(),
        id: listIdSchema,
        name: listNameSchema.optional(),
      })
    )
    .output(listSummarySchema),
};

export type ListsContract = typeof listsContract;

/**
 * The one `gestures` procedure the guest hooks call (a guest list holds
 * ids; the summaries come from the catalogue), declared by its shape: a
 * feature imports another feature's `./schema` only. `@smog/api` checks
 * that `appContract.gestures.byIds` satisfies it.
 */
export const gesturesByIdsContract = baseContract
  .input(z.object({ ids: z.array(z.string()) }))
  .output(z.array(gestureSummarySchema));

export type GesturesByIdsContract = typeof gesturesByIdsContract;
