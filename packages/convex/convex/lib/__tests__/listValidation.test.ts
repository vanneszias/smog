import { describe, expect, it } from "vitest";
import {
  normalizeListDescription,
  normalizeListName,
  validateReorderPayload,
} from "../listValidation";

describe("list validation", () => {
  it("normalizes list metadata", () => {
    expect(normalizeListName("  Therapy signs  ")).toBe("Therapy signs");
    expect(normalizeListDescription("  Useful at home  ")).toBe(
      "Useful at home"
    );
    expect(normalizeListDescription("   ")).toBeUndefined();
  });

  it("rejects invalid list metadata", () => {
    expect(() => normalizeListName("   ")).toThrow();
    expect(() => normalizeListName("a".repeat(81))).toThrow();
    expect(() => normalizeListDescription("a".repeat(281))).toThrow();
  });

  it("requires each current gesture exactly once when reordering", () => {
    expect(() =>
      validateReorderPayload(
        ["gesture-1", "gesture-2"],
        ["gesture-2", "gesture-1"]
      )
    ).not.toThrow();
    expect(() =>
      validateReorderPayload(
        ["gesture-1", "gesture-2"],
        ["gesture-1", "gesture-1"]
      )
    ).toThrow();
    expect(() =>
      validateReorderPayload(
        ["gesture-1", "gesture-2"],
        ["gesture-1", "gesture-3"]
      )
    ).toThrow();
  });
});
