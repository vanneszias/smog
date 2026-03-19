/**
 * @fileoverview Tests for the @smog/shared logger.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../logger";
import { LogLevel } from "../types/logger";

describe("createLogger", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    vi.spyOn(console, "warn").mockReturnValue(undefined);
    vi.spyOn(console, "error").mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prefixes messages with the module name", () => {
    const logger = createLogger("myModule");
    logger.info("hello");
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("[myModule]")
    );
  });

  it("includes the message text", () => {
    const logger = createLogger("test");
    logger.info("info message");
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("info message")
    );
  });

  it("logs warn via console.warn", () => {
    const logger = createLogger("test");
    logger.warn("warn message");
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("warn message")
    );
  });

  it("logs error via console.error", () => {
    const logger = createLogger("test");
    logger.error("error message");
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("error message")
    );
  });

  it("passes context as second argument when provided", () => {
    const logger = createLogger("test");
    const ctx = { key: "value" };
    logger.info("message", ctx);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("message"),
      ctx
    );
  });

  it("suppresses debug messages when minLevel is INFO", () => {
    const logger = createLogger("test", { minLevel: LogLevel.INFO });
    logger.debug("debug message");
    expect(console.log).not.toHaveBeenCalled();
  });

  it("shows debug messages when minLevel is DEBUG", () => {
    const logger = createLogger("test", { minLevel: LogLevel.DEBUG });
    logger.debug("debug message");
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("debug message")
    );
  });

  it("suppresses info and warn when minLevel is ERROR", () => {
    const logger = createLogger("test", { minLevel: LogLevel.ERROR });
    logger.info("info");
    logger.warn("warn");
    expect(console.log).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("logs error when minLevel is ERROR", () => {
    const logger = createLogger("test", { minLevel: LogLevel.ERROR });
    logger.error("error");
    expect(console.error).toHaveBeenCalled();
  });
});
