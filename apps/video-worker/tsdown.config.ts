import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/index.ts",
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
  ],
  // Keep fluent-ffmpeg and sharp external as they have native dependencies
});
