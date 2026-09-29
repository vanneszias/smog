import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The Cloudflare plugin reads the wrangler environment from CLOUDFLARE_ENV at
// dev and build time (there are no top-level bindings). Local runs use
// `env.dev`; deploy builds set CLOUDFLARE_ENV=staging|production explicitly.
process.env.CLOUDFLARE_ENV ??= "dev";

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart(),
    react(),
    tailwindcss(),
  ],
});
