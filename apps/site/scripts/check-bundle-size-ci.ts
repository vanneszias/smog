#!/usr/bin/env bun
/**
 * CI entry point for the bundle-size budget check.
 *
 * Runs `wrangler deploy --dry-run`, extracts the gzipped "Total Upload"
 * figure from its output, and calls checkBundleSize against the Workers
 * Paid 10 MiB gzipped limit with an 8 MiB early-warning threshold.
 *
 * Deliberately does NOT stat `.open-next/worker.js` and gzip it directly:
 * that file is a ~2 KB entry stub that imports the real module graph, and
 * gzipping it reports a fraction of a percent of the true size. The only
 * accurate figure is wrangler's own "Total Upload: X KiB / gzip: Y KiB"
 * line, which reflects everything that would actually be uploaded.
 *
 * Requires the app to already be built (`bun run build:app`) and
 * CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_ENV to be set —
 * `--dry-run` does not upload anything, but wrangler still authenticates.
 */

import { spawnSync } from "node:child_process";
import { checkBundleSize } from "./check-bundle-size";

const KIB = 1024;
const MIB = 1024 * 1024;
const LIMIT_BYTES = 10 * MIB;
const WARN_BYTES = 8 * MIB;

const TOTAL_UPLOAD_PATTERN =
  /Total Upload:\s*[\d.]+\s*KiB\s*\/\s*gzip:\s*([\d.]+)\s*KiB/i;

export function extractGzipKiB(wranglerOutput: string): number {
  const match = wranglerOutput.match(TOTAL_UPLOAD_PATTERN);

  if (!match) {
    throw new Error(
      'Could not find a "Total Upload: X KiB / gzip: Y KiB" line in wrangler\'s output. ' +
        "Did `wrangler deploy --dry-run` run successfully? Output was:\n" +
        wranglerOutput
    );
  }

  return Number.parseFloat(match[1]);
}

function runWranglerDryRun(env: string): { ok: boolean; output: string } {
  const result = spawnSync(
    "bunx",
    ["wrangler", "deploy", "--dry-run", `--env=${env}`, "--outdir=/tmp/dryrun"],
    { encoding: "utf8" }
  );

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

  // Printed unconditionally so the reviewer sees wrangler's own bindings
  // summary and upload line in the CI log, not just our derived verdict.
  console.log(output.trim());

  return { ok: result.status === 0, output };
}

function main(): void {
  const env = process.env.CLOUDFLARE_ENV;

  if (!env) {
    console.error(
      "CLOUDFLARE_ENV is not set. It must be 'staging' or 'production' for wrangler deploy --dry-run to select the right bindings."
    );
    process.exitCode = 1;
    return;
  }

  const { ok: wranglerOk, output } = runWranglerDryRun(env);

  if (!wranglerOk) {
    console.error(
      "wrangler deploy --dry-run exited with a non-zero status; see output above."
    );
    process.exitCode = 1;
    return;
  }

  const gzipKiB = extractGzipKiB(output);
  const gzipBytes = gzipKiB * KIB;

  const result = checkBundleSize(gzipBytes, LIMIT_BYTES, WARN_BYTES);

  // Printed unconditionally: a reviewer needs to see the trend even on a
  // passing run, not just when the budget is blown.
  console.log(result.message);

  if (!result.ok) {
    process.exitCode = 1;
  }
}

// Only run when invoked directly (`bun run scripts/check-bundle-size-ci.ts`),
// not when this module is imported by tests.
if (import.meta.main) {
  main();
}
