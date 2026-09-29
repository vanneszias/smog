/**
 * @fileoverview API layer types
 *
 * Request/response shapes, error types, and shared API utilities
 * used across the oRPC/Hono API layer.
 */

// ===== ERROR TYPES =====

/**
 * Standard API error codes used across all routers.
 * Consumers should use these instead of raw HTTP status codes
 * to identify specific failure modes.
 */
export type ApiErrorCode =
  // Generic
  | "INTERNAL_ERROR"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  // Gesture-specific
  | "GESTURE_NOT_FOUND"
  | "GESTURE_ALREADY_SPONSORED"
  // Sponsorship-specific
  | "SPONSORSHIP_NOT_FOUND"
  | "SPONSORSHIP_INVALID_STATUS"
  | "SPONSORSHIP_PAYMENT_FAILED"
  | "SPONSORSHIP_ALREADY_ACTIVE"
  // User-specific
  | "USER_NOT_FOUND"
  | "USER_ALREADY_EXISTS"
  // Network/sync
  | "NETWORK_ERROR"
  | "SYNC_FAILED";

/**
 * Standard API error response shape.
 */
export interface ApiError {
  code: ApiErrorCode;
  /** Extra diagnostic context (dev only, never sent to production clients) */
  details?: Record<string, unknown>;
  message: string;
  /** Whether the client can recover without user intervention */
  recoverable: boolean;
}

// ===== PAGINATION TYPES =====

/**
 * Standard paginated response wrapper.
 */
export interface PaginatedResponse<T> {
  data: T[];
  hasMore: boolean;
  page: number;
  pageSize: number;
  total: number;
}

/**
 * Pagination request parameters.
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

// ===== SYNC TYPES =====

/**
 * Result of a Convex ↔ local sync operation.
 */
export interface SyncResult {
  errors: string[];
  success: boolean;
  /** Number of records synced */
  synced: number;
  timestamp: Date;
}

/**
 * Current sync status, returned by `getSyncStatus()`.
 */
export interface SyncStatus {
  isSyncing: boolean;
  lastAttempt: Date | null;
  lastSync: Date | null;
  nextSync: Date | null;
}
