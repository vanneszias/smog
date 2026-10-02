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

export default defineConfig({
  // `/dev/*` pages are compiled out of production builds (spec §9: dev and
  // staging only); see src/routes/dev/ui.tsx and scripts/deploy-guard.ts.
  define: {
    __SMOG_DEV_TOOLS__: JSON.stringify(
      process.env.CLOUDFLARE_ENV !== "production"
    ),
    __SMOG_THEME_SCRIPT_HASH__: THEME_SCRIPT_HASH_DEFINE,
  },
  plugins: [
    cloudflare({
      viteEnvironment: { name: "ssr" },
      ...(devSiteUrl
        ? {
            config: (worker) => ({
              vars: { ...worker.vars, SITE_URL: devSiteUrl },
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
