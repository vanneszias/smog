/**
 * @fileoverview Logger type definitions for the centralized logging service.
 *
 * These types are used by the logger utility to provide consistent, structured
 * log output across all packages and apps in the monorepo.
 */

/** Log severity levels, from least to most severe. */
export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/** A single structured log entry. */
export interface LogEntry {
  /** Timestamp when the log was created (Unix ms). */
  timestamp: number;
  /** Severity of the log message. */
  level: LogLevel;
  /** Module or service that produced the log (e.g. "databaseService"). */
  module: string;
  /** The human-readable log message. */
  message: string;
  /** Optional extra context to include with the log. */
  context?: unknown;
}

/** Configuration for a logger instance. */
export interface LoggerConfig {
  /** Minimum level to output. Defaults to INFO in production, DEBUG in development. */
  minLevel: LogLevel;
  /** Whether to prefix every message with an ISO timestamp. */
  includeTimestamp: boolean;
}
