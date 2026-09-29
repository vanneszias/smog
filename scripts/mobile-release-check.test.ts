import { describe, expect, test } from "bun:test";
import { doctorVerdict, formatBytes } from "./mobile-release-check";

const SCHEMA = "Check Expo config (app.json/ app.config.js) schema";

const SCHEMA_CRASH = `Running 20 checks on your project...
Unexpected error while running '${SCHEMA}' check:
SyntaxError: Unexpected token 'H', "Host not i"... is not valid JSON
1 check failed, indicating possible issues with the project.`;

const REAL_FAILURE = `Running 20 checks on your project...
19/20 checks passed. 1 checks failed. Possible issues detected:

✖ Check that packages match versions required by installed Expo SDK
The following packages should be updated for best compatibility with the installed expo version:
  expo-router@57.0.1 - expected version: ~57.0.24

1 check failed, indicating possible issues with the project.`;

const SCHEMA_ISSUE = `Running 20 checks on your project...
19/20 checks passed. 1 checks failed. Possible issues detected:

✖ ${SCHEMA}
Error: Problem validating fields in app config.

1 check failed, indicating possible issues with the project.`;

describe("doctorVerdict", () => {
  test("passes when doctor exits 0", () => {
    expect(doctorVerdict(0, "No issues detected!", false)).toEqual({
      ok: true,
    });
    expect(doctorVerdict(0, "No issues detected!", true)).toEqual({ ok: true });
  });

  test("fails on a schema crash when online", () => {
    expect(doctorVerdict(1, SCHEMA_CRASH, false).ok).toBe(false);
  });

  test("tolerates only the schema fetch crash when offline", () => {
    expect(doctorVerdict(1, SCHEMA_CRASH, true)).toEqual({
      ok: true,
      skipped: [SCHEMA],
    });
  });

  test("fails on a real doctor failure when offline", () => {
    const verdict = doctorVerdict(1, REAL_FAILURE, true);
    expect(verdict.ok).toBe(false);
  });

  test("fails on real schema issues when offline", () => {
    expect(doctorVerdict(1, SCHEMA_ISSUE, true).ok).toBe(false);
  });

  test("fails when a crash hides a second failure", () => {
    const output = SCHEMA_CRASH.replace("1 check failed", "2 checks failed");
    expect(doctorVerdict(1, output, true).ok).toBe(false);
  });

  test("fails on output it cannot read", () => {
    expect(doctorVerdict(1, "Segmentation fault", true).ok).toBe(false);
  });
});

describe("formatBytes", () => {
  test("formats megabytes", () => {
    expect(formatBytes(3_670_016)).toBe("3.50 MB");
  });
});
