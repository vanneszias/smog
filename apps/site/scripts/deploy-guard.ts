import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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
 * What must never reach the browser bundle (`dist/client`): the Mux
 * credential names (their values live only in the Worker's env) and the
 * Mux Node SDK (`@smog/video` is a thin fetch client, Worker only).
 */
export const CLIENT_SECRET_MARKERS = [
  "MUX_TOKEN",
  "MUX_WEBHOOK_SECRET",
  "@mux/mux-node",
] as const;

const CLIENT_DIR = join("dist", "client");

/** The browser build (`dist/client`) must not name a Mux secret or carry the SDK. */
export function checkClientHasNoMuxSecrets(files: readonly BuiltFile[]): void {
  const found = files
    .filter(
      (file) =>
        file.path.includes(CLIENT_DIR) &&
        CLIENT_SECRET_MARKERS.some((marker) => file.content.includes(marker))
    )
    .map((file) => file.path);
  if (found.length > 0) {
    throw new Error(
      `[deploy-guard] the browser build names a Mux secret or bundles the Mux SDK: ${found.join(", ")}. Mux calls belong in the Worker (@smog/video).`
    );
  }
}

const DIST_DIR = fileURLToPath(new URL("../dist", import.meta.url));

function readBuiltFiles(dir: string): BuiltFile[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => {
      const path = join(entry.parentPath, entry.name);
      return { content: readFileSync(path, "utf8"), path };
    });
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
    const files = readBuiltFiles(DIST_DIR);
    checkServerHasNoVideoPlayer(files);
    checkClientHasNoMuxSecrets(files);
    console.log("deploy-guard: bundle ok");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
} else if (import.meta.main) {
  try {
    const env = checkDeployTarget(
      process.env.CLOUDFLARE_ENV,
      readBuiltConfig(BUILT_CONFIG_PATH)
    );
    const files = readBuiltFiles(DIST_DIR);
    checkDevTools(env, files);
    checkServerHasNoVideoPlayer(files);
    checkClientHasNoMuxSecrets(files);
    console.log(`deploy-guard: ok (${env})`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
