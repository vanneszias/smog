import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/index.ts",
  format: "esm",
  outDir: "./dist",
  clean: true,
  noExternal: [
    /@smog\/.*/,
    /@orpc\/.*/,
    /@mux\/.*/,
    /^hono/,
    /^zod/,
    /^dotenv/,
    /^convex/,
    /^node-cron/,
    /^prom-client/,
  ],
});
