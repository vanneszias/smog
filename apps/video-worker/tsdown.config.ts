import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/server.ts",
  format: "esm",
  outDir: "./dist",
  clean: true,
  noExternal: [
    /@smog\/.*/,
    /^hono/,
    /^zod/,
    /^dotenv/,
    /^convex/,
    /^bullmq/,
    /^ioredis/,
    /^uuid/,
    /^prom-client/,
    /^@mux\/mux-node/,
    /^fluent-ffmpeg/,
  ],
  // Keep sharp external as it has native dependencies
});
