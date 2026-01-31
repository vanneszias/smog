#!/usr/bin/env bun

import { rm } from "node:fs/promises";

// Clean dist directory
console.log("🧹 Cleaning dist directory...");
await rm("./dist", { recursive: true, force: true });

// Build with Bun
console.log("📦 Building with Bun...");

const result = await Bun.build({
  entrypoints: ["./src/server.ts"],
  outdir: "./dist",
  target: "bun",
  format: "esm",
  splitting: false,
  minify: false,
  sourcemap: "external",
  external: [
    // Only keep sharp external because it has native bindings
    // All other dependencies can be safely bundled
    "sharp",
  ],
});

if (!result.success) {
  console.error("❌ Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log("✅ Build completed successfully!");
console.log(`📊 Generated ${result.outputs.length} output file(s)`);

for (const output of result.outputs) {
  const size = (output.size / 1024).toFixed(2);
  console.log(`   - ${output.path} (${size} KB)`);
}
