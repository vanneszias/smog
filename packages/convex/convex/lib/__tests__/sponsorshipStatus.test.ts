/**
 * @fileoverview Tests for sponsorship status state machine helpers.
 */

import { describe, expect, it } from "vitest";
import {
  BLOCKING_STATUSES,
  isBlocking,
  isPending,
  isTerminal,
  PENDING_STATUSES,
  TERMINAL_STATUSES,
} from "../sponsorshipStatus";

describe("isPending", () => {
  it("returns true for all pending statuses", () => {
    for (const s of PENDING_STATUSES) {
      expect(isPending(s)).toBe(true);
    }
  });

  it("returns false for active", () => {
    expect(isPending("active")).toBe(false);
  });

  it("returns false for terminal statuses", () => {
    for (const s of TERMINAL_STATUSES) {
      expect(isPending(s)).toBe(false);
    }
  });
});

describe("isTerminal", () => {
  it("returns true for all terminal statuses", () => {
    for (const s of TERMINAL_STATUSES) {
      expect(isTerminal(s)).toBe(true);
    }
  });

  it("returns false for active", () => {
    expect(isTerminal("active")).toBe(false);
  });

  it("returns false for pending statuses", () => {
    for (const s of PENDING_STATUSES) {
      expect(isTerminal(s)).toBe(false);
    }
  });
});

describe("isBlocking", () => {
  it("returns true for all blocking statuses", () => {
    for (const s of BLOCKING_STATUSES) {
      expect(isBlocking(s)).toBe(true);
    }
  });

  it("returns false for rejected", () => {
    expect(isBlocking("rejected")).toBe(false);
  });

  it("returns false for expired", () => {
    expect(isBlocking("expired")).toBe(false);
  });

  it("returns false for cancelled", () => {
    expect(isBlocking("cancelled")).toBe(false);
  });
});
