/**
 * @fileoverview Centralised error handling utilities for the SMOG monorepo.
 *
 * Provides:
 * - Typed error classes (`AppError` and subclasses)
 * - `logError()` for consistent error logging
 * - `tryCatch()` for safe async execution
 * - `isAppError()` / `isRecoverable()` type guards
 *
 * @example
 * import { tryCatch, DatabaseError } from "@smog/shared/errors";
 *
 * const result = await tryCatch(
 *   () => db.getGesture(id),
 *   (err) => new DatabaseError(`Failed to get gesture ${id}`)
 * );
 */

import { createLogger } from "./logger";
import {
  AppError,
  ConvexError,
  DatabaseError,
  NetworkError,
  SyncError,
  ValidationError,
} from "./types/errors";

export {
  AppError,
  ConvexError,
  DatabaseError,
  NetworkError,
  SyncError,
  ValidationError,
};

const errorLogger = createLogger("errorHandler");

// ─── Type guards ─────────────────────────────────────────────────────────────

/**
 * Returns `true` if `value` is an `AppError` (or any subclass).
 *
 * @example
 * if (isAppError(err)) console.log(err.code);
 */
export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/**
 * Returns `true` if the error is recoverable (i.e. the user can retry
 * without restarting the app).
 */
export function isRecoverable(error: unknown): boolean {
  if (isAppError(error)) {
    return error.recoverable;
  }
  return true; // Unknown errors are assumed recoverable
}

// ─── Error logging ───────────────────────────────────────────────────────────

/**
 * Log an error with a consistent format.
 *
 * Always logs at `ERROR` level. Includes the module prefix for easy
 * filtering in log aggregators.
 *
 * @param module - The service/component that encountered the error.
 * @param message - Human-readable description of what failed.
 * @param error - The raw error object.
 *
 * @example
 * logError("databaseService", "Failed to insert gesture", error);
 */
export function logError(
  module: string,
  message: string,
  error?: unknown
): void {
  const logger = createLogger(module);
  logger.error(message, error);
}

// ─── Safe async execution ────────────────────────────────────────────────────

/**
 * Execute an async function safely, mapping any thrown error to a typed
 * `AppError` via the provided mapper.
 *
 * Returns `[null, result]` on success or `[error, null]` on failure.
 *
 * @example
 * const [err, gesture] = await tryCatch(
 *   () => db.getGesture(id),
 *   (rawErr) => new DatabaseError(`Could not load gesture ${id}`)
 * );
 * if (err) return;
 * console.log(gesture.name);
 */
export async function tryCatch<T>(
  fn: () => Promise<T>,
  mapError?: (error: unknown) => AppError
): Promise<[AppError, null] | [null, T]> {
  try {
    const result = await fn();
    return [null, result];
  } catch (rawError) {
    const appError = mapError
      ? mapError(rawError)
      : rawError instanceof AppError
        ? rawError
        : new AppError(
            rawError instanceof Error
              ? rawError.message
              : "An unknown error occurred",
            "UNKNOWN_ERROR"
          );

    errorLogger.error(appError.message, rawError);
    return [appError, null];
  }
}

/**
 * Execute a synchronous function safely, mapping any thrown error to a typed
 * `AppError` via the provided mapper.
 *
 * Returns `[null, result]` on success or `[error, null]` on failure.
 */
export function tryCatchSync<T>(
  fn: () => T,
  mapError?: (error: unknown) => AppError
): [AppError, null] | [null, T] {
  try {
    const result = fn();
    return [null, result];
  } catch (rawError) {
    const appError = mapError
      ? mapError(rawError)
      : rawError instanceof AppError
        ? rawError
        : new AppError(
            rawError instanceof Error
              ? rawError.message
              : "An unknown error occurred",
            "UNKNOWN_ERROR"
          );

    errorLogger.error(appError.message, rawError);
    return [appError, null];
  }
}
