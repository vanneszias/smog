import { describe, expect, it } from "vitest";
import { extractGzipKiB } from "./check-bundle-size-ci";

describe("extractGzipKiB", () => {
  it("extracts the gzip figure from wrangler's Total Upload line", () => {
    const output = [
      "Total Upload: 30623.75 KiB / gzip: 6601.12 KiB",
      "",
      "Uploaded smog-site-staging (staging) (1.23 sec)",
    ].join("\n");

    expect(extractGzipKiB(output)).toBeCloseTo(6601.12, 2);
  });

  it("extracts the figure regardless of surrounding wrangler noise", () => {
    const output = `
Your Worker has access to the following bindings:
- D1 Databases:
  - D1: smog-staging
Total Upload: 100.00 KiB / gzip: 42.50 KiB
--dry-run: exiting now.
`;

    expect(extractGzipKiB(output)).toBeCloseTo(42.5, 2);
  });

  it("throws a clear error when the line is missing", () => {
    expect(() =>
      extractGzipKiB("wrangler crashed before printing anything")
    ).toThrow(/Total Upload/);
  });
});
