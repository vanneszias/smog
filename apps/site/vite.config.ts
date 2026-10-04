import { fileURLToPath } from "node:url";
import { cloudflare, type WorkerConfig } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { THEME_SCRIPT_HASH_DEFINE } from "./build-defines";
import { applyRenderGate, type RenderEnv } from "./render-config";

const SRC = fileURLToPath(new URL("./src", import.meta.url));

// The Cloudflare plugin reads the wrangler environment from CLOUDFLARE_ENV at
// dev and build time (there are no top-level bindings). Local runs use
// `env.dev`; deploy builds set CLOUDFLARE_ENV=staging|production explicitly.
process.env.CLOUDFLARE_ENV ??= "dev";

/**
 * The dev server's own origin when it runs on another port: Playwright sets
 * it with `E2E_PORT` (playwright.config.ts), so no `.dev.vars` edit is
 * needed. Dev only; a `SITE_URL` in `.dev.vars` still wins over it.
 */
const devSiteUrl =
  process.env.CLOUDFLARE_ENV === "dev"
    ? process.env.SMOG_DEV_SITE_URL
    : undefined;

/**
 * The Mux fake for the e2e (`@smog/video/testing/server`, started by
 * playwright.config.ts): its URL, token and webhook secret, as dev vars.
 * Dev only; a value in `.dev.vars` still wins over them.
 */
const devMuxVars: Record<string, string> =
  process.env.CLOUDFLARE_ENV === "dev" && process.env.SMOG_DEV_MUX_API_URL
    ? {
        MUX_API_URL: process.env.SMOG_DEV_MUX_API_URL,
        MUX_TOKEN_ID: process.env.SMOG_DEV_MUX_TOKEN_ID ?? "",
        MUX_TOKEN_SECRET: process.env.SMOG_DEV_MUX_TOKEN_SECRET ?? "",
        MUX_WEBHOOK_SECRET: process.env.SMOG_DEV_MUX_WEBHOOK_SECRET ?? "",
      }
    : {};

/**
 * The Mollie fake for the e2e (`@smog/payments/testing/server`, started by
 * playwright.config.ts): its URL and its test key, as dev vars, so the
 * wizard's checkout runs end to end. Dev only; `.dev.vars` still wins.
 */
const devMollieVars: Record<string, string> =
  process.env.CLOUDFLARE_ENV === "dev" && process.env.SMOG_DEV_MOLLIE_API_URL
    ? {
        MOLLIE_API_KEY: process.env.SMOG_DEV_MOLLIE_API_KEY ?? "",
        MOLLIE_API_URL: process.env.SMOG_DEV_MOLLIE_API_URL,
      }
    : {};

const devVars: Record<string, string> = {
  ...(devSiteUrl ? { SITE_URL: devSiteUrl } : {}),
  ...devMuxVars,
  ...devMollieVars,
};

const RENDER_ENVS: readonly RenderEnv[] = ["dev", "staging", "production"];

/**
 * The render gate (render-config.ts, phase 7 ruling 2): the Workflow and
 * the Container reach the build only for `RENDER_MODE` `local` (dev) or
 * `container` with `SMOG_RENDER_PIPELINE=1`; `container` without the flag
 * fails the build here. `SMOG_DEV_RENDER_MODE=local bun dev` picks dev's
 * local mode and sets the var too (`.dev.vars` is read too late for the
 * binding). Then the dev vars above, which `.dev.vars` still overrides.
 */
function customizeWorker(
  worker: WorkerConfig
): Partial<WorkerConfig> | undefined {
  const env = RENDER_ENVS.find((name) => name === process.env.CLOUDFLARE_ENV);
  if (!env) {
    throw new Error(
      `[render] CLOUDFLARE_ENV must be one of ${RENDER_ENVS.join(", ")} (got ${JSON.stringify(process.env.CLOUDFLARE_ENV)})`
    );
  }
  const gate = applyRenderGate({
    devMode: process.env.SMOG_DEV_RENDER_MODE,
    env,
    flag: process.env.SMOG_RENDER_PIPELINE,
    renderMode: worker.vars.RENDER_MODE,
  });
  if ("error" in gate) {
    throw new Error(gate.error);
  }
  const vars = { ...gate.vars, ...devVars };
  const hasVars = Object.keys(vars).length > 0;
  if (Object.keys(gate.add).length === 0 && !hasVars) {
    return;
  }
  return {
    ...gate.add,
    ...(hasVars ? { vars: { ...worker.vars, ...vars } } : {}),
  };
}

export default defineConfig({
  // `/dev/*` pages are compiled out of production builds (spec §9: dev and
  // staging only); see src/routes/dev/ui.tsx and scripts/deploy-guard.ts.
  define: {
    __SMOG_DEV_TOOLS__: JSON.stringify(
      process.env.CLOUDFLARE_ENV !== "production"
    ),
    // The e2e seed endpoint exists in dev builds only (src/server/e2e-seed.ts).
    __SMOG_E2E_SEED__: JSON.stringify(
      (process.env.CLOUDFLARE_ENV ?? "dev") === "dev"
    ),
    __SMOG_THEME_SCRIPT_HASH__: THEME_SCRIPT_HASH_DEFINE,
  },
  // The client build's manifest (`dist/client/.vite/manifest.json`), for the
  // deploy guard's entry-chunk check: `remotion` and `mediabunny` load only
  // in a lazy chunk (phase 7 ruling 1). `public/.assetsignore` keeps it
  // out of the deployed assets.
  environments: { client: { build: { manifest: true } } },
  plugins: [
    cloudflare({
      config: customizeWorker,
      viteEnvironment: { name: "ssr" },
    }),
    tanstackStart(),
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { "@": SRC } },
});
