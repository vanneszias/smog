import { fileURLToPath } from "node:url";
import { cloudflare, type WorkerConfig } from "@cloudflare/vite-plugin";
import { ENVIRONMENTS } from "@smog/config/env/worker";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { THEME_SCRIPT_HASH_DEFINE } from "./build-defines";

const SRC = fileURLToPath(new URL("./src", import.meta.url));
const I18N_LAZY_ENTRY = fileURLToPath(
  new URL("../../packages/i18n/src/index.lazy.ts", import.meta.url)
);

/**
 * One language in the browser entry (phase 10b task 7b): the client build
 * resolves `@smog/i18n` to the entry without the shipped catalogues; the
 * active language is loaded before hydration (`src/client.tsx`) and on a
 * language change (the root loader). The Worker (SSR) keeps the full entry,
 * which holds all three.
 */
function i18nLazyCatalogues(): Plugin {
  return {
    enforce: "pre",
    name: "smog:i18n-lazy-catalogues",
    resolveId(source) {
      return source === "@smog/i18n" && this.environment.name === "client"
        ? I18N_LAZY_ENTRY
        : null;
    },
  };
}

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

/**
 * The dev vars above are the only build-time change of the Worker config
 * (`.dev.vars` still overrides them). The render gate that once added the
 * Workflow and the Container here is gone with the render pipeline (phase
 * 10b task 9), so a staging or production build is `wrangler.jsonc`'s env,
 * unchanged.
 */
function customizeWorker(
  worker: WorkerConfig
): Partial<WorkerConfig> | undefined {
  const env = ENVIRONMENTS.find((name) => name === process.env.CLOUDFLARE_ENV);
  if (!env) {
    throw new Error(
      `[build] CLOUDFLARE_ENV must be one of ${ENVIRONMENTS.join(", ")} (got ${JSON.stringify(process.env.CLOUDFLARE_ENV)})`
    );
  }
  if (Object.keys(devVars).length === 0) {
    return;
  }
  return { vars: { ...worker.vars, ...devVars } };
}

export default defineConfig({
  // No source map ships (phase 9 task 6): the deploy guard fails on a `.map`
  // file or a map comment, and perf-budget.test.ts on this line changing.
  build: { sourcemap: false },
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
  // deploy guard's performance budgets (every route chunk needs an entry of
  // `perf-budget.json`). `public/.assetsignore` keeps it out of the deployed
  // assets.
  environments: { client: { build: { manifest: true } } },
  plugins: [
    i18nLazyCatalogues(),
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
