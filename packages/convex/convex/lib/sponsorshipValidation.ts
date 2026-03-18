/**
 * @fileoverview Sponsorship validation helpers for Convex mutation handlers.
 *
 * Pure validation functions that check whether a gesture can be sponsored.
 * Extracted from `sponsorships.ts` to reduce file size and enable reuse
 * across `create`, `createBulk`, and `createBulkSimplified` mutations.
 *
 * @example
 * const error = await checkExistingSponsorship(ctx, gestureId, gestureName);
 * if (error) throw new Error(error);
 */

import type { Id } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";

/**
 * Check whether a gesture already has a conflicting sponsorship.
 *
 * Returns an error message string if a conflict exists, or `null` if the
 * gesture is available to be sponsored.
 *
 * Conflicts:
 * - An `active` sponsorship already exists.
 * - A `pending_payment` or `pending_approval` sponsorship already exists.
 *
 * @param db - Convex database reader.
 * @param gestureId - The gesture to check.
 * @param gestureName - Human-readable name used in error messages.
 * @returns Error message string, or `null` if no conflict.
 */
export async function checkExistingSponsorship(
  db: DatabaseReader,
  gestureId: Id<"gestures">,
  gestureName: string
): Promise<string | null> {
  // Check for active sponsorship
  const existingActive = await db
    .query("sponsorships")
    .withIndex("by_gesture_and_status", (q) =>
      q.eq("gestureId", gestureId).eq("status", "active")
    )
    .first();

  if (existingActive) {
    return `Gesture "${gestureName}" is already sponsored until ${new Date(existingActive.endDate).toLocaleDateString()}`;
  }

  // Check for in-progress sponsorship
  const existingPending = await db
    .query("sponsorships")
    .withIndex("by_gesture", (q) => q.eq("gestureId", gestureId))
    .filter((q) =>
      q.or(
        q.eq(q.field("status"), "pending_payment"),
        q.eq(q.field("status"), "pending_approval")
      )
    )
    .first();

  if (existingPending) {
    return `Gesture "${gestureName}" already has a pending sponsorship`;
  }

  return null;
}

/**
 * Check whether a gesture already has any pending sponsorship (stricter check
 * used by the legacy `create` mutation).
 *
 * @param db - Convex database reader.
 * @param gestureId - The gesture to check.
 * @returns Error message string, or `null` if no conflict.
 */
export async function checkExistingSponsorshipStrict(
  db: DatabaseReader,
  gestureId: Id<"gestures">
): Promise<string | null> {
  // Active check
  const existingActive = await db
    .query("sponsorships")
    .withIndex("by_gesture_and_status", (q) =>
      q.eq("gestureId", gestureId).eq("status", "active")
    )
    .first();

  if (existingActive) {
    return `This gesture is already sponsored until ${new Date(existingActive.endDate).toLocaleDateString()}`;
  }

  // Pending checks (including plain "pending")
  const existingPending = await db
    .query("sponsorships")
    .withIndex("by_gesture", (q) => q.eq("gestureId", gestureId))
    .filter((q) =>
      q.or(
        q.eq(q.field("status"), "pending"),
        q.eq(q.field("status"), "pending_payment"),
        q.eq(q.field("status"), "pending_approval")
      )
    )
    .first();

  if (existingPending) {
    return "This gesture already has a pending sponsorship. Please wait for it to be processed or contact support.";
  }

  return null;
}
