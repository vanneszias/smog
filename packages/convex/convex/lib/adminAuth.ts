/**
 * Admin Authentication Helper for Convex
 *
 * Provides reusable admin authentication checks for mutations.
 * Verifies that the caller has admin role in the database.
 */

import type { MutationCtx, QueryCtx } from "../_generated/server";

export interface AdminAuthResult {
  userId: string;
  workosId: string;
}

/**
 * Validates that the current request is from an authenticated admin user.
 *
 * @param ctx - Convex mutation or query context
 * @param operation - Name of the operation for error messages
 * @returns User ID and WorkOS ID if authorized
 * @throws Error if not authenticated or not an admin
 */
export async function requireAdminAuth(
  ctx: MutationCtx | QueryCtx,
  operation: string
): Promise<AdminAuthResult> {
  // Get the authenticated identity from the JWT
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error(`[${operation}] Unauthorized: No authentication provided`);
  }

  // The subject contains the WorkOS user ID
  const workosId = identity.subject;

  if (!workosId) {
    throw new Error(`[${operation}] Unauthorized: Invalid identity`);
  }

  // Look up the user by their WorkOS ID
  const user = await ctx.db
    .query("users")
    .withIndex("by_workos_id", (q) => q.eq("workosId", workosId))
    .unique();

  if (!user) {
    throw new Error(`[${operation}] Unauthorized: User not found`);
  }

  // Verify admin role
  if (user.role !== "admin") {
    throw new Error(`[${operation}] Forbidden: Admin privileges required`);
  }

  return {
    userId: user._id,
    workosId,
  };
}
