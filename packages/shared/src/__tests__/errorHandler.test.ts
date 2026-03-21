/**
 * @fileoverview Tests for the @smog/shared error handler utilities.
 *
 * Run with: bun -F @smog/shared test (or vitest in the shared package)
 */

import { describe, expect, it } from "vitest";
import {
  AppError,
  ConvexError,
  DatabaseError,
  isAppError,
  isRecoverable,
  NetworkError,
  SyncError,
  tryCatch,
  tryCatchSync,
  ValidationError,
} from "../errorHandler";

// ─── Error classes ────────────────────────────────────────────────────────────

describe("AppError", () => {
  it("stores code and message", () => {
    const err = new AppError("Something failed", "TEST_ERROR");
    expect(err.message).toBe("Something failed");
    expect(err.code).toBe("TEST_ERROR");
    expect(err.name).toBe("AppError");
  });

  it("is recoverable by default", () => {
    const err = new AppError("msg", "CODE");
    expect(err.recoverable).toBe(true);
  });

  it("can be marked non-recoverable", () => {
    const err = new AppError("msg", "CODE", false);
    expect(err.recoverable).toBe(false);
  });

  it("is an instance of Error", () => {
    expect(new AppError("msg", "CODE")).toBeInstanceOf(Error);
  });
});

describe("ValidationError", () => {
  it("has correct name and default code", () => {
    const err = new ValidationError("Invalid input");
    expect(err.name).toBe("ValidationError");
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.recoverable).toBe(true);
  });

  it("stores field errors", () => {
    const err = new ValidationError("Invalid", "VALIDATION_ERROR", {
      email: "Invalid email",
    });
    expect(err.fieldErrors?.email).toBe("Invalid email");
  });
});

describe("DatabaseError", () => {
  it("is non-recoverable", () => {
    const err = new DatabaseError("Query failed");
    expect(err.recoverable).toBe(false);
    expect(err.name).toBe("DatabaseError");
  });
});

describe("NetworkError", () => {
  it("stores status code", () => {
    const err = new NetworkError("Not found", "NETWORK_ERROR", 404);
    expect(err.statusCode).toBe(404);
    expect(err.recoverable).toBe(true);
  });
});

describe("SyncError", () => {
  it("has correct defaults", () => {
    const err = new SyncError("Sync failed");
    expect(err.code).toBe("SYNC_ERROR");
    expect(err.recoverable).toBe(true);
  });
});

describe("ConvexError", () => {
  it("has correct defaults", () => {
    const err = new ConvexError("Convex unavailable");
    expect(err.code).toBe("CONVEX_ERROR");
    expect(err.name).toBe("ConvexError");
  });
});

// ─── Type guards ──────────────────────────────────────────────────────────────

describe("isAppError", () => {
  it("returns true for AppError instances", () => {
    expect(isAppError(new AppError("msg", "CODE"))).toBe(true);
  });

  it("returns true for subclass instances", () => {
    expect(isAppError(new ValidationError("msg"))).toBe(true);
    expect(isAppError(new DatabaseError("msg"))).toBe(true);
  });

  it("returns false for plain Error", () => {
    expect(isAppError(new Error("plain"))).toBe(false);
  });

  it("returns false for non-errors", () => {
    expect(isAppError("string")).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError(42)).toBe(false);
  });
});

describe("isRecoverable", () => {
  it("returns false for non-recoverable AppError", () => {
    expect(isRecoverable(new DatabaseError("msg"))).toBe(false);
  });

  it("returns true for recoverable AppError", () => {
    expect(isRecoverable(new SyncError("msg"))).toBe(true);
  });

  it("returns true for unknown errors (assume recoverable)", () => {
    expect(isRecoverable(new Error("plain"))).toBe(true);
    expect(isRecoverable("something")).toBe(true);
  });
});

// ─── tryCatch ─────────────────────────────────────────────────────────────────

describe("tryCatch", () => {
  it("returns [null, result] on success", async () => {
    const [err, result] = await tryCatch(() => Promise.resolve(42));
    expect(err).toBeNull();
    expect(result).toBe(42);
  });

  it("returns [error, null] on failure", async () => {
    const [err, result] = await tryCatch(() =>
      Promise.reject(new Error("boom"))
    );
    expect(err).not.toBeNull();
    expect(result).toBeNull();
  });

  it("uses the mapError function when provided", async () => {
    const [err] = await tryCatch(
      () => Promise.reject(new Error("raw")),
      () => new DatabaseError("mapped error")
    );
    expect(err).toBeInstanceOf(DatabaseError);
    expect(err?.message).toBe("mapped error");
  });

  it("passes through AppError subclasses without mapError", async () => {
    const original = new SyncError("original");
    const [err] = await tryCatch(() => Promise.reject(original));
    expect(err).toBe(original);
  });

  it("wraps unknown errors in AppError when no mapper provided", async () => {
    const [err] = await tryCatch(() => Promise.reject("string error"));
    expect(isAppError(err)).toBe(true);
    expect(err?.code).toBe("UNKNOWN_ERROR");
  });
});

// ─── tryCatchSync ─────────────────────────────────────────────────────────────

describe("tryCatchSync", () => {
  it("returns [null, result] on success", () => {
    const [err, result] = tryCatchSync(() => 42);
    expect(err).toBeNull();
    expect(result).toBe(42);
  });

  it("returns [error, null] on failure", () => {
    const [err, result] = tryCatchSync(() => {
      throw new Error("boom");
    });
    expect(err).not.toBeNull();
    expect(result).toBeNull();
  });

  it("uses mapError when provided", () => {
    const [err] = tryCatchSync(
      () => {
        throw new Error("raw");
      },
      () => new ValidationError("mapped")
    );
    expect(err).toBeInstanceOf(ValidationError);
  });
});
