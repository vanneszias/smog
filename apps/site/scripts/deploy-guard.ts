import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
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
 * render stack runs in the Container (Bun) and the wizard's lazy Player,
 * never in workerd (phase 7 ruling 1). Remotion's `window` property, the
 * renderer's browser and compositor package names, the bundler's output
 * prefix, and mediabunny's load-time check.
 */
export const RENDERER_SERVER_MARKERS = [
  { marker: "remotion_delayRenderHandles", name: "remotion" },
  { marker: "chrome-headless-shell", name: "@remotion/renderer" },
  { marker: "@remotion/compositor-linux-x64-gnu", name: "@remotion/renderer" },
  { marker: "remotion-webpack-bundle-", name: "@remotion/bundler" },
  { marker: "Mediabunny was loaded twice", name: "mediabunny" },
] as const;

/** The Worker build (`dist/server`) must not contain the render stack. */
export function checkServerHasNoRenderer(files: readonly BuiltFile[]): void {
  const found = files
    .filter((file) => file.path.includes(SERVER_DIR))
    .flatMap((file) =>
      RENDERER_SERVER_MARKERS.filter(({ marker }) =>
        file.content.includes(marker)
      ).map(({ name }) => `${name}: ${file.path}`)
    );
  if (found.length > 0) {
    throw new Error(
      `[deploy-guard] the Worker build bundles the render stack (${[...new Set(found)].join("; ")}). Only @smog/render/contract may reach workerd; the composition, the metadata reader and the renderer run in the Container or the browser.`
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

/**
 * The render gate on the built `dist/server/wrangler.json` (phase 7 ruling
 * 2, render-config.ts):
 *
 * - `RENDER_MODE=fake` builds no Workflow, container, `RENDERER` binding or
 *   migration (staging until the owner turns the pipeline on);
 * - `RENDER_MODE=container` builds all of them, the migration that
 *   creates `SmogRenderer` included;
 * - `local` is dev only;
 * - every `containers[].image` and `image_build_context` is an absolute
 *   path that exists (`wrangler deploy` would resolve a relative one
 *   against `dist/server/`).
 */
export function checkRenderConfig(
  builtConfig: unknown,
  exists: (path: string) => boolean = existsSync
): void {
  const config = isRecord(builtConfig) ? builtConfig : {};
  const vars = isRecord(config.vars) ? config.vars : {};
  const mode = vars.RENDER_MODE;
  const workflows = records(config.workflows);
  const containers = records(config.containers);
  const durableObjects = isRecord(config.durable_objects)
    ? records(config.durable_objects.bindings)
    : [];
  const migrations = records(config.migrations);
  const renderWorkflow = workflows.some(
    (entry) =>
      entry.binding === "RENDER_WORKFLOW" &&
      entry.class_name === "RenderSponsorshipVideo"
  );
  const renderer = containers.some(
    (entry) => entry.class_name === "SmogRenderer"
  );
  const rendererBinding = durableObjects.some(
    (entry) => entry.name === "RENDERER" && entry.class_name === "SmogRenderer"
  );
  const rendererMigration = migrations.some(
    (entry) =>
      Array.isArray(entry.new_sqlite_classes) &&
      entry.new_sqlite_classes.includes("SmogRenderer")
  );
  const errors: string[] = [];
  if (mode === "fake") {
    const present: [boolean, string][] = [
      [workflows.length > 0, "workflows"],
      [containers.length > 0, "containers"],
      [rendererBinding, "RENDERER binding"],
      [migrations.length > 0, "migrations"],
    ];
    for (const [found, what] of present) {
      if (found) {
        errors.push(`RENDER_MODE=fake must build no ${what}`);
      }
    }
  } else if (mode === "container") {
    const needed: [boolean, string][] = [
      [renderWorkflow, "the RENDER_WORKFLOW Workflow (RenderSponsorshipVideo)"],
      [renderer, "the SmogRenderer container"],
      [rendererBinding, "the RENDERER binding (SmogRenderer)"],
      [
        rendererMigration,
        "the migration that creates SmogRenderer (new_sqlite_classes)",
      ],
    ];
    for (const [found, what] of needed) {
      if (!found) {
        errors.push(`RENDER_MODE=container needs ${what}`);
      }
    }
  } else if (mode === "local") {
    errors.push("RENDER_MODE=local is dev only");
  } else {
    errors.push(
      `RENDER_MODE must be fake or container in a deploy build (got ${JSON.stringify(mode ?? null)})`
    );
  }
  containers.forEach((entry, index) => {
    for (const key of ["image", "image_build_context"] as const) {
      const path = entry[key];
      if (typeof path !== "string" || !isAbsolute(path)) {
        errors.push(
          `containers[${index}].${key} must be an absolute path (got ${JSON.stringify(path ?? null)})`
        );
      } else if (!exists(path)) {
        errors.push(`containers[${index}].${key} does not exist: ${path}`);
      }
    }
  });
  if (errors.length > 0) {
    throw new Error(
      `[deploy-guard] the render gate (render-config.ts) does not hold for dist/server/wrangler.json:\n  ${errors.join("\n  ")}`
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
    checkServerHasNoRenderer(files);
    checkClientHasNoSecrets(files);
    console.log("deploy-guard: bundle ok");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
} else if (import.meta.main) {
  try {
    const builtConfig = readBuiltConfig(BUILT_CONFIG_PATH);
    const env = checkDeployTarget(process.env.CLOUDFLARE_ENV, builtConfig);
    checkRenderConfig(builtConfig);
    const files = readBuiltFiles(DIST_DIR);
    checkDevTools(env, files);
    checkNoE2eSeed(env, files);
    checkServerHasNoVideoPlayer(files);
    checkServerHasNoRenderer(files);
    checkClientHasNoSecrets(files);
    console.log(`deploy-guard: ok (${env})`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
