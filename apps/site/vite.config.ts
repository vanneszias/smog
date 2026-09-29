import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const SRC = fileURLToPath(new URL("./src", import.meta.url));

// The Cloudflare plugin reads the wrangler environment from CLOUDFLARE_ENV at
// dev and build time (there are no top-level bindings). Local runs use
// `env.dev`; deploy builds set CLOUDFLARE_ENV=staging|production explicitly.
process.env.CLOUDFLARE_ENV ??= "dev";

export default defineConfig({
  // `/dev/*` pages are compiled out of production builds (spec §9: dev and
  // staging only); see src/routes/dev/ui.tsx and scripts/deploy-guard.ts.
  define: {
    __SMOG_DEV_TOOLS__: JSON.stringify(
      process.env.CLOUDFLARE_ENV !== "production"
    ),
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart(),
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { "@": SRC } },
});
