/**
 * `@smog/account/contract`: the signed-in user's account (spec §5.3, §11).
 * Mounted as `account` in `@smog/api`'s `appContract`.
 */
import { baseContract } from "@smog/rpc/contract";
import { importGuestDataInputSchema, importResultSchema } from "./schema";

export const accountContract = {
  /**
   * Merges a guest's on-device favorites, lists and consent choice into the
   * account (`UNAUTHORIZED` without a session). Favorites become a union;
   * a list is created, or its missing items are appended to the user's
   * same-name list (case-insensitive, trimmed); unknown and unpublished
   * gestures are skipped and counted; the consent choice is appended to
   * the consent log with source `import`. All or nothing, and idempotent:
   * a second identical call adds nothing.
   */
  importGuestData: baseContract
    .input(importGuestDataInputSchema)
    .output(importResultSchema),
};

export type AccountContract = typeof accountContract;
