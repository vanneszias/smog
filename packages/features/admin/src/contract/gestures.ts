import { baseContract } from "@smog/rpc/contract";
import {
  adminGestureDetailSchema,
  adminGestureListInputSchema,
  adminGesturePageSchema,
  bulkUpdateInputSchema,
  bulkUpdateResultSchema,
  catalogConflictDataSchema,
  checkNameInputSchema,
  checkNameResultSchema,
  createGestureInputSchema,
  deletedResultSchema,
  deleteGestureInputSchema,
  gestureIdInputSchema,
  saveManyInputSchema,
  saveManyResultSchema,
  setGesturePublishedInputSchema,
  updateGestureInputSchema,
} from "../schema";
import type { AdminProcedures } from "./audit-map";

/**
 * The catalogue's `CONFLICT`, with its reason (`catalogConflictDataSchema`:
 * `stale` carries the ids that changed since they were read).
 */
export const CATALOG_ERRORS = {
  CONFLICT: { data: catalogConflictDataSchema, status: 409 },
} as const;

const catalogContract = baseContract.errors(CATALOG_ERRORS);

/**
 * `admin.gestures.*`: the gesture list, editor, table editor, publish and
 * bulk update (A-16–A-21). Reads come from D1 (never the catalog snapshot).
 * Every write sets `sort_name`, rebuilds the gestures' `gesture_fts` rows
 * and writes its audit entry in one D1 batch, then bumps the catalog
 * version (a KV failure is logged, not returned; ruling 8).
 */
export const gesturesSlice = {
  gestures: {
    /**
     * Bulk publish, unpublish, add or remove categories on up to 100
     * gestures, all or nothing, with one `gesture.bulk_update` entry.
     * `VALIDATION` for an empty patch or a category both added and removed;
     * `INVALID_STATE` when a gesture would be left without a category.
     */
    bulkUpdate: catalogContract
      .input(bulkUpdateInputSchema)
      .output(bulkUpdateResultSchema),
    /** Gestures with a `normalizeText`-equal name: a warning, not an error. */
    checkName: baseContract
      .input(checkNameInputSchema)
      .output(checkNameResultSchema),
    /**
     * Creates a gesture (published by default). The slug comes from the
     * name (`-2`, `-3`, … on a collision) and never changes afterwards.
     */
    create: catalogContract
      .input(createGestureInputSchema)
      .output(adminGestureDetailSchema),
    /**
     * Deletes an unpublished gesture without sponsorships (`CONFLICT`
     * `published` / `sponsored`); `confirmName` must equal its name
     * (`VALIDATION`).
     */
    delete: catalogContract
      .input(deleteGestureInputSchema)
      .output(deletedResultSchema),
    /** One gesture, published or not (`NOT_FOUND`). */
    get: baseContract
      .input(gestureIdInputSchema)
      .output(adminGestureDetailSchema),
    /**
     * Every gesture, published or not, in catalogue order (`sort_name, id`
     * keyset), filtered by status, categories and `q`, with the counts.
     */
    list: baseContract
      .input(adminGestureListInputSchema)
      .output(adminGesturePageSchema),
    /**
     * The table editor's one save: every row's patch in one batch, all or
     * nothing. Any stale row is `CONFLICT` `stale` with its ids.
     */
    saveMany: catalogContract
      .input(saveManyInputSchema)
      .output(saveManyResultSchema),
    /**
     * Publishes or unpublishes one gesture (`gesture.publish` /
     * `gesture.unpublish`); `INVALID_STATE` when it already is.
     */
    setPublished: catalogContract
      .input(setGesturePublishedInputSchema)
      .output(adminGestureDetailSchema),
    /**
     * Changes some fields (an empty patch is `VALIDATION`). `CONFLICT`
     * `stale` when the gesture changed since `expectedUpdatedAt`.
     */
    update: catalogContract
      .input(updateGestureInputSchema)
      .output(adminGestureDetailSchema),
  },
};

/** Each procedure's kind: `"read"`, `{ audit: <action> }` or `{ exempt: <reason> }`. */
export const ADMIN_PROCEDURES = {
  "gestures.bulkUpdate": { audit: "gesture.bulk_update" },
  "gestures.checkName": "read",
  "gestures.create": { audit: "gesture.create" },
  "gestures.delete": { audit: "gesture.delete" },
  "gestures.get": "read",
  "gestures.list": "read",
  "gestures.saveMany": { audit: "gesture.update" },
  "gestures.setPublished": { audit: ["gesture.publish", "gesture.unpublish"] },
  "gestures.update": { audit: "gesture.update" },
} as const satisfies AdminProcedures<typeof gesturesSlice>;
