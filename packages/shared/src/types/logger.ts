/**
 * @fileoverview Logger type definitions for the centralized logging service.
 *
 * These types are used by the logger utility to provide consistent, structured
 * log output across all packages and apps in the monorepo.
 */

/** Log severity levels, from least to most severe. */
export const LogLevel = {
  DEBUG: 0,
  ERROR: 3,
  INFO: 1,
  WARN: 2,
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/** A single structured log entry. */
export interface LogEntry {
  /** Optional extra context to include with the log. */
  context?: unknown;
  /** Severity of the log message. */
  level: LogLevel;
  /** The human-readable log message. */
  message: string;
  /** Module or service that produced the log (e.g. "databaseService"). */
  module: string;
  /** Timestamp when the log was created (Unix ms). */
  timestamp: number;
}

/** Configuration for a logger instance. */
export interface LoggerConfig {
  /** Whether to prefix every message with an ISO timestamp. */
  includeTimestamp: boolean;
  /** Minimum level to output. Defaults to INFO in production, DEBUG in development. */
  minLevel: LogLevel;
}
