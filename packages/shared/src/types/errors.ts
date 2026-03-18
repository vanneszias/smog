/**
 * @fileoverview Error type hierarchy for standardised error handling across SMOG.
 *
 * All custom errors extend `AppError`, which carries a structured error code,
 * a human-readable message, and a flag indicating whether the error can be
 * recovered from without restarting the app.
 *
 * @example
 * throw new NetworkError("Request timed out", "NETWORK_TIMEOUT");
 */

/**
 * Base class for all application-level errors.
 * Extends the native `Error` with structured metadata.
 */
export class AppError extends Error {
  /** Machine-readable error code for programmatic handling. */
  readonly code: string;
  /** Whether the calling code can recover without a full app restart. */
  readonly recoverable: boolean;

  constructor(message: string, code: string, recoverable = true) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.recoverable = recoverable;
  }
}

/** Thrown when user-supplied input fails validation rules. */
export class ValidationError extends AppError {
  /** Field-level validation errors keyed by field name. */
  readonly fieldErrors?: Record<string, string>;

  constructor(
    message: string,
    code = "VALIDATION_ERROR",
    fieldErrors?: Record<string, string>
  ) {
    super(message, code, true);
    this.name = "ValidationError";
    this.fieldErrors = fieldErrors;
  }
}

/** Thrown when background sync with Convex fails. */
export class SyncError extends AppError {
  constructor(message: string, code = "SYNC_ERROR") {
    super(message, code, true);
    this.name = "SyncError";
  }
}

/** Thrown when a network request fails or times out. */
export class NetworkError extends AppError {
  /** HTTP status code, if available. */
  readonly statusCode?: number;

  constructor(message: string, code = "NETWORK_ERROR", statusCode?: number) {
    super(message, code, true);
    this.name = "NetworkError";
    this.statusCode = statusCode;
  }
}

/** Thrown when a local SQLite database operation fails. */
export class DatabaseError extends AppError {
  constructor(message: string, code = "DATABASE_ERROR") {
    super(message, code, false);
    this.name = "DatabaseError";
  }
}

/** Thrown when a Convex backend call fails. */
export class ConvexError extends AppError {
  constructor(message: string, code = "CONVEX_ERROR") {
    super(message, code, true);
    this.name = "ConvexError";
  }
}
