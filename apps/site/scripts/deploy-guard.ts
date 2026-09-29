import { readFileSync } from "node:fs";
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

function readBuiltConfig(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    console.error(`[deploy-guard] Failed to read ${path}:`, error);
    throw error;
  }
}

if (import.meta.main) {
  try {
    const env = checkDeployTarget(
      process.env.CLOUDFLARE_ENV,
      readBuiltConfig(BUILT_CONFIG_PATH)
    );
    console.log(`deploy-guard: ok (${env})`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
