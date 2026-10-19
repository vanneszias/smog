import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import createConfig from "../apps/mobile/app.config";

/**
 * Mobile release gate: `expo-doctor`, then `expo export` (iOS + Android), then
 * the bundle size, then a production export that must not contain the
 * component gallery (`apps/mobile/app/settings/developer-tools/gallery.tsx`
 * drops it behind the inlined `EXPO_PUBLIC_ENVIRONMENT`).
 *
 * Offline mode (`SMOG_OFFLINE=1`) is for machines without access to
 * api.expo.dev / exp.host and reactnative.directory. It is NOT equivalent to
 * CI; three doctor checks are degraded (see OFFLINE_DEGRADED_CHECKS):
 * - the config schema check is tolerated when it crashes fetching the schema;
 * - the SDK dependency-version check (`expo install --check`) falls back to
 *   the bundled native module list, so packages that only the api.expo.dev
 *   list pins (react, react-native, typescript, jest-expo, ...) go unchecked;
 * - the React Native Directory check is off (`EXPO_DOCTOR_ENABLE_DIRECTORY_CHECK=0`).
 * Doctor also treats fetch failures as warnings
 * (`EXPO_DOCTOR_WARN_ON_NETWORK_ERRORS=1`). Every other doctor failure still
 * fails. CI never sets it.
 */

const PREFIX = "[mobileReleaseCheck]";
const ROOT = join(import.meta.dir, "..");
const MOBILE_DIR = join(ROOT, "apps", "mobile");
const DIST_DIR = join(MOBILE_DIR, "dist");
/** Inside `dist/` so the tools that ignore `dist` ignore it too. */
const PRODUCTION_DIST_DIR = join(DIST_DIR, "production");
/** The gallery's testID (`apps/mobile/src/dev/component-gallery.tsx`). */
const GALLERY_MARKER = "smog-dev-component-gallery";

/** What SMOG_OFFLINE=1 degrades; printed on every offline run. */
export const OFFLINE_DEGRADED_CHECKS: readonly string[] = [
  "Check Expo config (app.json/ app.config.js) schema: tolerated when the schema fetch crashes",
  "Check that packages match versions required by installed Expo SDK: bundled native modules only; react, react-native, typescript, jest-expo and other api.expo.dev pins are not checked",
  "Validate packages against React Native Directory package metadata: disabled",
];

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

/**
 * The gallery must be in dev/staging bundles and absent from production
 * ones. A dev bundle without the marker means the marker moved, which would
 * make the production check pass vacuously. Returns the failure, or null.
 */
export function galleryVerdict({
  hasMarker,
  production,
}: {
  hasMarker: boolean;
  production: boolean;
}): string | null {
  if (production && hasMarker) {
    return "the production bundle contains the component gallery";
  }
  if (!(production || hasMarker)) {
    return `the dev bundle has no gallery marker "${GALLERY_MARKER}"; update GALLERY_MARKER`;
  }
  return null;
}

/** What `app.config.ts` resolves to for one EAS profile (the fields a variant changes). */
export interface ResolvedIdentity {
  androidPackage: string | undefined;
  associatedDomains: readonly string[] | undefined;
  bundleIdentifier: string | undefined;
  name: string | undefined;
  scheme: string | undefined;
  /** Whether an `autoVerify` https intent filter (a universal link) is claimed. */
  verifiedLinks: boolean;
}

/** The variant each EAS profile must set; `undefined` is "unset" (the store app). */
const PROFILE_VARIANTS: Record<string, string | undefined> = {
  development: "development",
  production: undefined,
  staging: "staging",
};
const STORE_IDENTITY = { applicationId: "be.zias.smog", scheme: "smog" };

function profileEnv(eas: unknown, profile: string): Record<string, string> {
  const build =
    typeof eas === "object" && eas !== null && "build" in eas
      ? (eas as { build: Record<string, { env?: Record<string, string> }> })
          .build
      : {};
  return build[profile]?.env ?? {};
}

const IDENTITY_FIELDS = [
  "androidPackage",
  "bundleIdentifier",
  "name",
  "scheme",
] as const;

function quoted(value: string | undefined): string {
  return value === undefined ? "unset" : `"${value}"`;
}

/** Each profile sets the `APP_VARIANT` that names it (production none). */
function profileVariantProblems(eas: unknown): string[] {
  const problems: string[] = [];
  for (const [profile, expected] of Object.entries(PROFILE_VARIANTS)) {
    const actual = (
      profileEnv(eas, profile) as Record<string, string | undefined>
    ).APP_VARIANT;
    if (actual !== expected) {
      problems.push(
        `eas.json build.${profile}.env.APP_VARIANT must be ${quoted(expected)}, got ${quoted(actual)}`
      );
    }
  }
  return problems;
}

/** The profiles resolve to distinct names, ids, packages and schemes. */
function distinctProblems(
  identities: readonly (readonly [string, ResolvedIdentity])[]
): string[] {
  const problems: string[] = [];
  for (const field of IDENTITY_FIELDS) {
    const values = identities.map(([, identity]) => identity[field]);
    if (new Set(values).size !== values.length) {
      const shown = identities
        .map(([profile, identity]) => `${profile}=${identity[field]}`)
        .join(", ");
      problems.push(`the profiles resolve to a shared ${field}: ${shown}`);
    }
  }
  return problems;
}

/** Only the store app is in the AASA and assetlinks files. */
function linkProblems(
  identities: readonly (readonly [string, ResolvedIdentity])[]
): string[] {
  const problems: string[] = [];
  for (const [profile, identity] of identities) {
    const store = profile === "production";
    const claims =
      identity.verifiedLinks || (identity.associatedDomains?.length ?? 0) > 0;
    if (store && !claims) {
      problems.push("the production profile no longer claims the site's links");
    }
    if (!store && claims) {
      problems.push(
        `the ${profile} variant claims the site's universal links (associated domains or a verified https filter); only the store app is in the AASA and assetlinks files`
      );
    }
  }
  return problems;
}

function storeIdentityProblems(
  production: ResolvedIdentity | undefined
): string[] {
  if (
    production &&
    (production.bundleIdentifier !== STORE_IDENTITY.applicationId ||
      production.androidPackage !== STORE_IDENTITY.applicationId ||
      production.scheme !== STORE_IDENTITY.scheme)
  ) {
    return [
      `the production identity must stay ${STORE_IDENTITY.applicationId} / ${STORE_IDENTITY.scheme}`,
    ];
  }
  return [];
}

/**
 * Phase 9 ruling 9, cross-checked: each EAS profile sets the `APP_VARIANT`
 * that names it (production none), the three resolved identities differ in
 * name, bundle id, package and scheme, only the store app claims the site's
 * universal links, and the store identity is `be.zias.smog` / `smog`.
 * `resolve` runs `app.config.ts` with the profile's env. Returns the problems.
 */
export function variantProblems(
  eas: unknown,
  resolve: (env: Record<string, string>) => ResolvedIdentity
): string[] {
  const identities = Object.keys(PROFILE_VARIANTS).map(
    (profile) => [profile, resolve(profileEnv(eas, profile))] as const
  );
  const production = identities.find(([profile]) => profile === "production");
  return [
    ...profileVariantProblems(eas),
    ...distinctProblems(identities),
    ...linkProblems(identities),
    ...storeIdentityProblems(production?.[1]),
  ];
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
  if (offline) {
    console.warn(
      `${PREFIX} SMOG_OFFLINE=1: not equivalent to CI. Degraded expo-doctor checks:\n${OFFLINE_DEGRADED_CHECKS.map((check) => `  - ${check}`).join("\n")}`
    );
    if (verdict.skipped?.length) {
      console.warn(
        `${PREFIX} SMOG_OFFLINE=1: tolerated failures this run: ${verdict.skipped.join("; ")}`
      );
    }
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

/** `app.config.ts` resolved with a profile's env, the way an EAS build does. */
function resolveIdentity(env: Record<string, string>): ResolvedIdentity {
  const saved = { ...process.env };
  try {
    delete process.env.APP_VARIANT;
    Object.assign(process.env, env);
    const config = createConfig({
      config: {},
      packageJsonPath: null,
      projectRoot: MOBILE_DIR,
      staticConfigPath: null,
    });
    return {
      androidPackage: config.android?.package,
      associatedDomains: config.ios?.associatedDomains,
      bundleIdentifier: config.ios?.bundleIdentifier,
      name: config.name,
      scheme: Array.isArray(config.scheme) ? config.scheme[0] : config.scheme,
      verifiedLinks:
        config.android?.intentFilters?.some(
          (filter) => filter.autoVerify === true
        ) ?? false,
    };
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in saved)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, saved);
  }
}

function checkVariants(): void {
  const eas: unknown = JSON.parse(
    readFileSync(join(MOBILE_DIR, "eas.json"), "utf8")
  );
  const problems = variantProblems(eas, resolveIdentity);
  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
  console.log(
    `${PREFIX} app variants: development, staging and production resolve to distinct identities`
  );
}

function bundlesContain(dir: string, marker: string): boolean {
  for (const platform of ["ios", "android"]) {
    const bundles = join(dir, "_expo", "static", "js", platform);
    for (const file of readdirSync(bundles)) {
      if (readFileSync(join(bundles, file)).includes(marker)) {
        return true;
      }
    }
  }
  return false;
}

async function exportProduction(): Promise<void> {
  const proc = Bun.spawn(
    [
      "bunx",
      "expo",
      "export",
      "--platform",
      "ios",
      "--platform",
      "android",
      "--output-dir",
      PRODUCTION_DIST_DIR,
      // Metro's transform cache does not key on EXPO_PUBLIC_* values, so a
      // cached dev transform would keep the gallery (the app's `export`
      // script clears it too, for the same reason in the other direction).
      "--clear",
    ],
    {
      cwd: MOBILE_DIR,
      env: { ...process.env, EXPO_PUBLIC_ENVIRONMENT: "production" },
      stderr: "inherit",
      stdout: "ignore",
    }
  );
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`the production expo export exited with ${exitCode}`);
  }
}

function checkGallery(dir: string, production: boolean): void {
  const failure = galleryVerdict({
    hasMarker: bundlesContain(dir, GALLERY_MARKER),
    production,
  });
  if (failure) {
    throw new Error(failure);
  }
  const state = production ? "absent from production" : "present in dev";
  console.log(`${PREFIX} component gallery ${state} bundles`);
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
    checkVariants();
  } catch (error) {
    console.error(`${PREFIX} Failed the app variant check:`, error);
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
  try {
    checkGallery(DIST_DIR, false);
    await exportProduction();
    checkGallery(PRODUCTION_DIST_DIR, true);
  } catch (error) {
    console.error(`${PREFIX} Failed the gallery bundle check:`, error);
    throw error;
  }
}

if (import.meta.main) {
  await main();
}
