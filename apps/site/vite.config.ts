import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { THEME_SCRIPT_HASH_DEFINE } from "./build-defines";

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
  plugins: [
    cloudflare({
      viteEnvironment: { name: "ssr" },
      ...(Object.keys(devVars).length > 0
        ? {
            config: (worker) => ({
              vars: { ...worker.vars, ...devVars },
            }),
          }
        : {}),
    }),
    tanstackStart(),
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { "@": SRC } },
});
