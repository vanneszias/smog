/**
 * @fileoverview Tests for sponsorship wizard helper utilities.
 */

import { describe, expect, it } from "vitest";
import {
  createProgressTicker,
  readFileAsBase64,
} from "../routes/sponsors/utils/-sponsorshipHelpers";

describe("createProgressTicker", () => {
  it("advances progress toward maxProgress", () => {
    const tick = createProgressTicker(0.9);
    const next = tick(0);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(0.9);
  });

  it("never exceeds maxProgress", () => {
    const tick = createProgressTicker(0.9);
    let progress = 0;
    for (let i = 0; i < 100; i++) {
      progress = tick(progress);
      expect(progress).toBeLessThanOrEqual(0.9);
    }
  });

  it("returns maxProgress when already at max", () => {
    const tick = createProgressTicker(0.9);
    expect(tick(0.9)).toBe(0.9);
  });

  it("increases monotonically", () => {
    const tick = createProgressTicker(0.9);
    let prev = 0;
    for (let i = 0; i < 20; i++) {
      const next = tick(prev);
      expect(next).toBeGreaterThanOrEqual(prev);
      prev = next;
    }
  });
});

describe("readFileAsBase64", () => {
  it("resolves to a data URL string", async () => {
    const file = new File(["hello"], "test.txt", { type: "text/plain" });
    const result = await readFileAsBase64(file);
    expect(result).toMatch(/^data:text\/plain;base64,/);
  });

  it("correctly encodes file content", async () => {
    const content = "test content";
    const file = new File([content], "test.txt", { type: "text/plain" });
    const result = await readFileAsBase64(file);
    // Decode the base64 part
    const base64 = result.split(",")[1];
    expect(atob(base64 ?? "")).toBe(content);
  });
});
