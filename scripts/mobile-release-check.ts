import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Mobile release gate: `expo-doctor`, then `expo export` (iOS + Android), then
 * the bundle size.
 *
 * Offline mode (`SMOG_OFFLINE=1`) is for machines without access to
 * api.expo.dev / exp.host and reactnative.directory. It turns off the React
 * Native Directory check (`EXPO_DOCTOR_ENABLE_DIRECTORY_CHECK=0`), makes
 * doctor treat fetch failures as warnings (`EXPO_DOCTOR_WARN_ON_NETWORK_ERRORS=1`),
 * and tolerates the config schema check only when it crashed while fetching
 * the schema (a proxy that answers with a non-JSON body). Every other doctor
 * failure still fails. CI never sets it.
 */

const PREFIX = "[mobileReleaseCheck]";
const ROOT = join(import.meta.dir, "..");
const MOBILE_DIR = join(ROOT, "apps", "mobile");
const DIST_DIR = join(MOBILE_DIR, "dist");

/** Doctor checks that only fail offline because they fetch from the network. */
const NETWORK_CHECKS = new Set([
  "Check Expo config (app.json/ app.config.js) schema",
]);

export type DoctorVerdict =
  | { ok: true; skipped?: string[] }
  | { ok: false; reason: string };

export function doctorVerdict(
  exitCode: number,
  output: string,
  offline: boolean
): DoctorVerdict {
  if (exitCode === 0) {
    return { ok: true };
  }
  if (!offline) {
    return { ok: false, reason: `expo-doctor exited with ${exitCode}` };
  }
  const counts = [...output.matchAll(/(\d+) checks? failed, indicating/g)];
  const failedCount = Number(counts.at(-1)?.[1] ?? Number.NaN);
  if (Number.isNaN(failedCount)) {
    return {
      ok: false,
      reason: `expo-doctor exited with ${exitCode} without a failure summary`,
    };
  }
  const crashed = new Set(
    [...output.matchAll(/Unexpected error while running '(.+?)' check:/g)].map(
      (match) => match[1] ?? ""
    )
  );
  const flagged = [...output.matchAll(/^✖ (.+)$/gm)].map(
    (match) => match[1]?.trim() ?? ""
  );
  const failing = new Set([...crashed, ...flagged]);
  if (failing.size !== failedCount) {
    return {
      ok: false,
      reason: `expo-doctor reported ${failedCount} failed checks, found ${failing.size}`,
    };
  }
  const real = [...failing].filter(
    (name) => !(NETWORK_CHECKS.has(name) && crashed.has(name))
  );
  if (real.length > 0) {
    return { ok: false, reason: `expo-doctor failed: ${real.join("; ")}` };
  }
  return { ok: true, skipped: [...failing] };
}

export function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function directorySize(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    total += entry.isDirectory() ? directorySize(path) : statSync(path).size;
  }
  return total;
}

async function runDoctor(offline: boolean): Promise<void> {
  const env: Record<string, string | undefined> = { ...process.env };
  if (offline) {
    env.EXPO_DOCTOR_ENABLE_DIRECTORY_CHECK = "0";
    env.EXPO_DOCTOR_WARN_ON_NETWORK_ERRORS = "1";
  }
  const proc = Bun.spawn(["bunx", "expo-doctor"], {
    cwd: MOBILE_DIR,
    env,
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  const verdict = doctorVerdict(exitCode, `${stdout}\n${stderr}`, offline);
  if (!verdict.ok) {
    throw new Error(verdict.reason);
  }
  if (verdict.skipped?.length) {
    console.warn(
      `${PREFIX} SMOG_OFFLINE=1: skipped network-only checks: ${verdict.skipped.join("; ")}`
    );
  }
}

async function runExport(): Promise<void> {
  const proc = Bun.spawn(["bun", "-F", "@smog/mobile", "export"], {
    cwd: ROOT,
    stderr: "inherit",
    stdout: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`expo export exited with ${exitCode}`);
  }
}

function reportBundleSize(): void {
  for (const platform of ["ios", "android"]) {
    const dir = join(DIST_DIR, "_expo", "static", "js", platform);
    console.log(
      `${PREFIX} ${platform} bundle: ${formatBytes(directorySize(dir))}`
    );
  }
  console.log(`${PREFIX} dist total: ${formatBytes(directorySize(DIST_DIR))}`);
}

async function main(): Promise<void> {
  const offline = process.env.SMOG_OFFLINE === "1";
  try {
    await runDoctor(offline);
  } catch (error) {
    console.error(`${PREFIX} Failed to pass expo-doctor:`, error);
    throw error;
  }
  try {
    await runExport();
  } catch (error) {
    console.error(`${PREFIX} Failed to export the app:`, error);
    throw error;
  }
  try {
    reportBundleSize();
  } catch (error) {
    console.error(`${PREFIX} Failed to measure the bundle:`, error);
    throw error;
  }
}

if (import.meta.main) {
  await main();
}
