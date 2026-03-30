/**
 * @fileoverview Centralised logging service for the SMOG monorepo.
 *
 * Provides a consistent logging API across all packages and apps.
 *
 * Features:
 * - Four log levels: DEBUG, INFO, WARN, ERROR
 * - Environment-aware filtering (DEBUG suppressed in production)
 * - Consistent `[module]` prefix format
 * - OpenTelemetry emission (no-op when no provider is registered)
 *
 * @example
 * import { createLogger } from "@smog/shared/logger";
 * const logger = createLogger("databaseService");
 * logger.info("Database initialised");
 * logger.error("Query failed", error);
 */

import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import type { LogEntry, LoggerConfig } from "./types/logger";
import { LogLevel } from "./types/logger";

// ─── Internal helpers ────────────────────────────────────────────────────────

const isDevelopment =
  typeof process !== "undefined" &&
  (process as { env?: { NODE_ENV?: string } }).env?.NODE_ENV !== "production";

const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: isDevelopment ? LogLevel.DEBUG : LogLevel.INFO,
  includeTimestamp: false,
};

const SEVERITY_NUMBER: Record<LogLevel, SeverityNumber> = {
  [LogLevel.DEBUG]: SeverityNumber.DEBUG,
  [LogLevel.INFO]: SeverityNumber.INFO,
  [LogLevel.WARN]: SeverityNumber.WARN,
  [LogLevel.ERROR]: SeverityNumber.ERROR,
};

const SEVERITY_TEXT: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
};

function formatMessage(entry: LogEntry): string {
  const prefix = entry.module ? `[${entry.module}]` : "";
  const timestamp = entry.timestamp
    ? `${new Date(entry.timestamp).toISOString()} `
    : "";
  return `${timestamp}${prefix} ${entry.message}`;
}

// ─── Logger factory ──────────────────────────────────────────────────────────

/** A scoped logger bound to a specific module name. */
export interface Logger {
  /**
   * Low-level debugging information.
   * Suppressed in production builds.
   */
  debug(message: string, context?: unknown): void;
  /** Informational messages about normal operation. */
  info(message: string, context?: unknown): void;
  /** Warnings about potentially problematic situations. */
  warn(message: string, context?: unknown): void;
  /** Errors that caused an operation to fail. */
  error(message: string, context?: unknown): void;
}

/**
 * Create a logger scoped to a specific module.
 *
 * @param module - Module name used as prefix in all messages (e.g. "databaseService").
 * @param config - Optional config overrides.
 * @returns A scoped `Logger` instance.
 *
 * @example
 * const logger = createLogger("analyticsService");
 * logger.info("PostHog initialised");
 */
export function createLogger(
  module: string,
  config?: Partial<LoggerConfig>
): Logger {
  const resolvedConfig = { ...DEFAULT_CONFIG, ...config };

  function log(level: LogLevel, message: string, context?: unknown): void {
    if (level < resolvedConfig.minLevel) {
      return;
    }

    const now = Date.now();

    const entry: LogEntry = {
      timestamp: resolvedConfig.includeTimestamp ? now : 0,
      level,
      module,
      message,
      context,
    };

    const formatted = formatMessage(entry);

    // ── Console output ──────────────────────────────────────────────────────
    switch (level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        if (context !== undefined) {
          console.log(formatted, context);
        } else {
          console.log(formatted);
        }
        break;
      case LogLevel.WARN:
        if (context !== undefined) {
          console.warn(formatted, context);
        } else {
          console.warn(formatted);
        }
        break;
      case LogLevel.ERROR:
        if (context !== undefined) {
          console.error(formatted, context);
        } else {
          console.error(formatted);
        }
        break;
    }

    // ── OpenTelemetry emission ──────────────────────────────────────────────
    // getLogger() is called on every log so it picks up the provider even if
    // initOtel() was called after this logger was created. No-op when no
    // provider is registered (i.e. in development without OTLP configured).
    const attributes: Record<string, string> = { module };
    if (context !== undefined) {
      attributes["log.context"] =
        typeof context === "string" ? context : JSON.stringify(context);
    }

    logs.getLogger(module).emit({
      severityNumber: SEVERITY_NUMBER[level],
      severityText: SEVERITY_TEXT[level],
      body: message,
      attributes,
      timestamp: now,
    });
  }

  return {
    debug: (message, context) => log(LogLevel.DEBUG, message, context),
    info: (message, context) => log(LogLevel.INFO, message, context),
    warn: (message, context) => log(LogLevel.WARN, message, context),
    error: (message, context) => log(LogLevel.ERROR, message, context),
  };
}

/** Default application-wide logger (module: "app"). */
export const logger = createLogger("app");
