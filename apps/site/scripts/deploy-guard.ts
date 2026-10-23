import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkNoSourceMaps,
  checkPerfBudget,
  gzipSize,
  measureEntries,
  parsePerfBudget,
  unbudgetedRoutes,
} from "./perf-budget";

/** Cloudflare environments that may be deployed. `dev` is local-only. */
export const DEPLOYABLE_ENVIRONMENTS = ["staging", "production"] as const;

export type DeployableEnvironment = (typeof DEPLOYABLE_ENVIRONMENTS)[number];

const BUILT_CONFIG_PATH = fileURLToPath(
  new URL("../dist/server/wrangler.json", import.meta.url)
);

function isDeployable(value: string): value is DeployableEnvironment {
  return (DEPLOYABLE_ENVIRONMENTS as readonly string[]).includes(value);
}

/**
 * Checks that a deploy targets staging or production and that the Vite build
 * in `dist/` was made for that same environment. Returns the environment, or
 * throws with the reason.
 */
export function checkDeployTarget(
  cloudflareEnv: string | undefined,
  builtConfig: unknown
): DeployableEnvironment {
  if (!(cloudflareEnv && isDeployable(cloudflareEnv))) {
    throw new Error(
      `[deploy-guard] CLOUDFLARE_ENV must be one of ${DEPLOYABLE_ENVIRONMENTS.join(", ")} (got ${JSON.stringify(cloudflareEnv ?? null)})`
    );
  }
  const target =
    typeof builtConfig === "object" &&
    builtConfig !== null &&
    "targetEnvironment" in builtConfig
      ? builtConfig.targetEnvironment
      : undefined;
  if (target !== cloudflareEnv) {
    throw new Error(
      `[deploy-guard] dist/ was built for ${JSON.stringify(target ?? null)}, not "${cloudflareEnv}". Rebuild with CLOUDFLARE_ENV=${cloudflareEnv} vite build.`
    );
  }
  return cloudflareEnv;
}

/**
 * A string only the `/dev/ui` gallery emits (its theme columns,
 * `src/dev/ui-gallery.tsx`). Production builds compile the gallery out
 * (`__SMOG_DEV_TOOLS__`, vite.config.ts); staging keeps it.
 */
export const DEV_TOOLS_MARKER = "data-theme-column";

/**
 * Every dev-only page and the string that proves it is in a build. (The
 * `/admin/dev/video-field` preview of phase 5 task 3 is gone: the gesture
 * editor mounts `VideoField` itself.)
 */
const DEV_ONLY_PAGES = [
  { marker: DEV_TOOLS_MARKER, name: "/dev/ui gallery" },
] as const;

export interface BuiltFile {
  content: string;
  path: string;
}

/** Production must ship no dev-only page; staging must still have each. */
export function checkDevTools(
  env: DeployableEnvironment,
  files: readonly BuiltFile[]
): void {
  for (const page of DEV_ONLY_PAGES) {
    const found = files
      .filter((file) => file.content.includes(page.marker))
      .map((file) => file.path);
    if (env === "production" && found.length > 0) {
      throw new Error(
        `[deploy-guard] the production build contains the ${page.name}: ${found.join(", ")}. Build with CLOUDFLARE_ENV=production so __SMOG_DEV_TOOLS__ is false.`
      );
    }
    if (env === "staging" && found.length === 0) {
      throw new Error(
        `[deploy-guard] the staging build has no ${page.name} (dev and staging keep the dev-only pages).`
      );
    }
  }
}

/**
 * The string only the e2e seed endpoint has (`src/server/e2e-seed.ts`,
 * `E2E_SEED_MARKER`). Only a dev build carries it (`__SMOG_E2E_SEED__`):
 * staging keeps the other dev pages but never this one.
 */
export const E2E_SEED_MARKER = "smog-e2e-seed";

/** A staging or production build must not contain the e2e seed endpoint. */
export function checkNoE2eSeed(
  env: DeployableEnvironment,
  files: readonly BuiltFile[]
): void {
  const found = files
    .filter((file) => file.content.includes(E2E_SEED_MARKER))
    .map((file) => file.path);
  if (found.length > 0) {
    throw new Error(
      `[deploy-guard] the ${env} build contains the /dev/e2e-seed endpoint: ${found.join(", ")}. Build with CLOUDFLARE_ENV=${env} so __SMOG_E2E_SEED__ is false.`
    );
  }
}

/**
 * Strings only Mux Player's bundle contains (its software name and element
 * class). `@smog/ui-web`'s VideoPlayer imports it on the client only, so the
 * Worker bundle must not carry the ~2 MB player.
 */
export const MUX_PLAYER_MARKERS = [
  '"mux-player-react"',
  "MuxPlayerElement",
] as const;

const SERVER_DIR = join("dist", "server");

/** The Worker build (`dist/server`) must not contain Mux Player. */
export function checkServerHasNoVideoPlayer(files: readonly BuiltFile[]): void {
  const found = files
    .filter(
      (file) =>
        file.path.includes(SERVER_DIR) &&
        MUX_PLAYER_MARKERS.some((marker) => file.content.includes(marker))
    )
    .map((file) => file.path);
  if (found.length > 0) {
    throw new Error(
      `[deploy-guard] the Worker build bundles Mux Player: ${found.join(", ")}. VideoPlayer must load it on the client only.`
    );
  }
}

/**
 * What must never reach the browser bundle (`dist/client`): the secret
 * names (their values live only in the Worker's env: Mux, Mollie, the R2
 * S3 token, the Remotion licence), the Mux Node SDK (`@smog/video` is a thin fetch client,
 * Worker only), and `aws4fetch`, the R2 presigner (by its name and its
 * signing algorithm string, which survives minification).
 */
export const CLIENT_SECRET_MARKERS = [
  "MUX_TOKEN",
  "MUX_WEBHOOK_SECRET",
  "@mux/mux-node",
  "MOLLIE_API_KEY",
  "R2_SECRET_ACCESS_KEY",
  "aws4fetch",
  "AWS4-HMAC-SHA256",
  "REMOTION_LICENSE_KEY",
] as const;

const CLIENT_DIR = join("dist", "client");

/** The browser build (`dist/client`) must not name a secret or carry a server-only SDK. */
export function checkClientHasNoSecrets(files: readonly BuiltFile[]): void {
  const found = files
    .filter(
      (file) =>
        file.path.includes(CLIENT_DIR) &&
        CLIENT_SECRET_MARKERS.some((marker) => file.content.includes(marker))
    )
    .map((file) => file.path);
  if (found.length > 0) {
    throw new Error(
      `[deploy-guard] the browser build names a secret or bundles a server-only SDK (${CLIENT_SECRET_MARKERS.join(", ")}): ${found.join(", ")}. Mux, Mollie and R2 calls belong in the Worker (@smog/video, @smog/payments, the logo upload).`
    );
  }
}

/**
 * Strings that survive bundling and minification, one package each: the
 * render stack (Remotion, its renderer and bundler, mediabunny) is retired
 * (phase 10b task 9) and must not come back into a build, the Worker's or
 * the browser's. Remotion's `window` property, the renderer's browser and
 * compositor package names, the bundler's output prefix, and mediabunny's
 * load-time check.
 */
export const RENDER_STACK_MARKERS = [
  { marker: "remotion_delayRenderHandles", name: "remotion" },
  { marker: "chrome-headless-shell", name: "@remotion/renderer" },
  { marker: "@remotion/compositor-linux-x64-gnu", name: "@remotion/renderer" },
  { marker: "remotion-webpack-bundle-", name: "@remotion/bundler" },
  { marker: "Mediabunny was loaded twice", name: "mediabunny" },
  { marker: "Input has been disposed", name: "mediabunny" },
] as const;

/** No built file (`dist/server`, `dist/client`) may contain the retired render stack. */
export function checkNoRenderStack(files: readonly BuiltFile[]): void {
  const found = files.flatMap((file) =>
    RENDER_STACK_MARKERS.filter(({ marker }) =>
      file.content.includes(marker)
    ).map(({ name }) => `${name}: ${file.path}`)
  );
  if (found.length > 0) {
    throw new Error(
      `[deploy-guard] the build bundles the retired render stack (${[...new Set(found)].join("; ")}). The Remotion render pipeline was removed in phase 10b task 9; sponsor names are an end card over the gesture's own video.`
    );
  }
}

const CLIENT_MANIFEST = join(".vite", "manifest.json");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The built `dist/server/wrangler.json` holds no render binding (phase 10b
 * task 9): no Workflow, container, Durable Object binding or migration
 * (the SmogRenderer and RenderSponsorshipVideo classes are gone), and no
 * `RENDER_MODE` var. A build that brings one back fails here.
 */
export function checkNoRenderConfig(builtConfig: unknown): void {
  const config = isRecord(builtConfig) ? builtConfig : {};
  const vars = isRecord(config.vars) ? config.vars : {};
  const present = (value: unknown): boolean =>
    Array.isArray(value) ? value.length > 0 : value !== undefined;
  const durableObjects = isRecord(config.durable_objects)
    ? config.durable_objects.bindings
    : undefined;
  const errors: string[] = [];
  for (const [found, what] of [
    [present(config.workflows), "workflows"],
    [present(config.containers), "containers"],
    [present(durableObjects), "Durable Object bindings"],
    [present(config.migrations), "migrations"],
    [Object.hasOwn(vars, "RENDER_MODE"), "a RENDER_MODE var"],
  ] as const) {
    if (found) {
      errors.push(`the build must have no ${what}`);
    }
  }
  if (errors.length > 0) {
    throw new Error(
      `[deploy-guard] the render pipeline is retired, but dist/server/wrangler.json has render config:\n  ${errors.join("\n  ")}`
    );
  }
}

/** `dist/`, or `--dist <dir>` (the guard's fixture tests). */
function distDir(): string {
  const index = process.argv.indexOf("--dist");
  const dir = index === -1 ? undefined : process.argv[index + 1];
  return dir ?? fileURLToPath(new URL("../dist", import.meta.url));
}

function readBuiltFiles(dir: string): BuiltFile[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => {
      const path = join(entry.parentPath, entry.name);
      return { content: readFileSync(path, "utf8"), path };
    });
}

/** The client build's Vite manifest (`null` when it is missing). */
function readClientManifest(dist: string): unknown {
  const path = join(dist, "client", CLIENT_MANIFEST);
  return existsSync(path) ? readBuiltConfig(path) : null;
}

/** `perf-budget.json`, or `--perf-budget <file>` (the guard's fixture tests). */
function perfBudgetPath(): string {
  const index = process.argv.indexOf("--perf-budget");
  const file = index === -1 ? undefined : process.argv[index + 1];
  return file ?? fileURLToPath(new URL("../perf-budget.json", import.meta.url));
}

/** Every file under `dir`, for the source-map check. */
function builtPaths(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

/**
 * The bundle budgets (`perf-budget.json`, scripts/perf-budget.ts): the
 * initial JavaScript of each entry from the client manifest, and the
 * Worker's gzip size (its modules, as `wrangler deploy` uploads them);
 * and no source map. Hints (a budget to lower) are printed, not fatal.
 * `--perf-report` prints the measurements as JSON too.
 */
function checkPerformance(dist: string, files: readonly BuiltFile[]): void {
  const budget = parsePerfBudget(
    JSON.parse(readFileSync(perfBudgetPath(), "utf8"))
  );
  checkNoSourceMaps(builtPaths(dist), files);
  const clientDir = join(dist, "client");
  const entries = measureEntries(readClientManifest(dist), budget, (file) =>
    readFileSync(join(clientDir, file), "utf8")
  );
  const serverDir = join(dist, "server");
  const worker = {
    gzip: files
      .filter((file) => file.path.startsWith(serverDir))
      .reduce((sum, file) => sum + gzipSize(file.content), 0),
  };
  if (process.argv.includes("--perf-report")) {
    console.log(
      JSON.stringify({ entries: Object.fromEntries(entries), worker }, null, 2)
    );
  }
  const { errors, hints } = checkPerfBudget(budget, entries, worker);
  for (const route of unbudgetedRoutes(readClientManifest(dist), budget)) {
    errors.push(
      `src/routes/${route} has a component chunk but no entry of perf-budget.json lists it: add it to an entry (or a new one) and set that budget`
    );
  }
  for (const hint of hints) {
    console.warn(`[deploy-guard] ${hint}`);
  }
  if (errors.length > 0) {
    throw new Error(
      `[deploy-guard] the bundle is over its budget (apps/site/perf-budget.json):\n  ${errors.join("\n  ")}`
    );
  }
}

function readBuiltConfig(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    console.error(`[deploy-guard] Failed to read ${path}:`, error);
    throw error;
  }
}

if (import.meta.main && process.argv.includes("--bundle")) {
  // After every `vite build` (the site's `build` script, so CI runs it):
  // the checks that hold for any environment.
  try {
    const dist = distDir();
    const files = readBuiltFiles(dist);
    checkServerHasNoVideoPlayer(files);
    checkNoRenderStack(files);
    checkClientHasNoSecrets(files);
    checkPerformance(dist, files);
    console.log("deploy-guard: bundle ok");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
} else if (import.meta.main) {
  try {
    const builtConfig = readBuiltConfig(BUILT_CONFIG_PATH);
    const env = checkDeployTarget(process.env.CLOUDFLARE_ENV, builtConfig);
    checkNoRenderConfig(builtConfig);
    const dist = distDir();
    const files = readBuiltFiles(dist);
    checkDevTools(env, files);
    checkNoE2eSeed(env, files);
    checkServerHasNoVideoPlayer(files);
    checkNoRenderStack(files);
    checkClientHasNoSecrets(files);
    checkPerformance(dist, files);
    console.log(`deploy-guard: ok (${env})`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
