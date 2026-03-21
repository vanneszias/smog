/**
 * @fileoverview Main entry point for the @smog/shared package.
 *
 * Re-exports the logger, error handler, and associated types for easy
 * consumption across all apps and packages in the SMOG monorepo.
 *
 * @example
 * import { createLogger, tryCatch, DatabaseError } from "@smog/shared";
 */

export {
  AppError,
  ConvexError,
  DatabaseError,
  isAppError,
  isRecoverable,
  logError,
  NetworkError,
  SyncError,
  tryCatch,
  tryCatchSync,
  ValidationError,
} from "./errorHandler";
export type { Logger } from "./logger";
export { createLogger, logger } from "./logger";
export type { LogEntry, LoggerConfig } from "./types/logger";
export { LogLevel } from "./types/logger";
