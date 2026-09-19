import { describe, expect, it } from "vitest";
import { checkBundleSize } from "./check-bundle-size";

const LIMIT = 10 * 1024 * 1024;
const WARN = 8 * 1024 * 1024;

describe("checkBundleSize", () => {
  it("passes when under the limit", () => {
    expect(checkBundleSize(5 * 1024 * 1024, LIMIT, WARN).ok).toBe(true);
  });

  it("fails when over the limit", () => {
    const result = checkBundleSize(11 * 1024 * 1024, LIMIT, WARN);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("exceeds");
  });

  it("fails exactly at the limit, because the limit is the hard ceiling", () => {
    expect(checkBundleSize(LIMIT, LIMIT, WARN).ok).toBe(false);
  });

  it("reports remaining headroom as a percentage", () => {
    expect(checkBundleSize(5 * 1024 * 1024, LIMIT, WARN).message).toContain(
      "50%"
    );
  });

  it("is ok with level ok below the warn threshold", () => {
    const result = checkBundleSize(5 * 1024 * 1024, LIMIT, WARN);
    expect(result.ok).toBe(true);
    expect(result.level).toBe("ok");
  });

  it("is ok with level warn at the warn threshold", () => {
    const result = checkBundleSize(WARN, LIMIT, WARN);
    expect(result.ok).toBe(true);
    expect(result.level).toBe("warn");
    expect(result.message).toContain("headroom");
  });

  it("is ok with level warn between the warn threshold and the limit", () => {
    const result = checkBundleSize(9 * 1024 * 1024, LIMIT, WARN);
    expect(result.ok).toBe(true);
    expect(result.level).toBe("warn");
  });

  it("is not ok with level exceeded when at or above the limit", () => {
    const result = checkBundleSize(LIMIT, LIMIT, WARN);
    expect(result.ok).toBe(false);
    expect(result.level).toBe("exceeded");
  });

  it("stays level ok just under the warn threshold", () => {
    const result = checkBundleSize(WARN - 1, LIMIT, WARN);
    expect(result.ok).toBe(true);
    expect(result.level).toBe("ok");
  });
});
