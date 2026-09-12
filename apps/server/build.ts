#!/usr/bin/env bun

import { rm } from "node:fs/promises";

// NOTE: this script must run with NODE_ENV=production (see package.json). React
// is external, so the JSX transform chosen at build time has to match the
// runtime: `react/jsx-dev-runtime` exports an undefined `jsxDEV` in React's
// production build, which would make every email template throw.

// Clean dist directory
console.log("🧹 Cleaning dist directory...");
await rm("./dist", { recursive: true, force: true });

// Build with Bun
console.log("📦 Building with Bun...");

const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  target: "bun",
  format: "esm",
  splitting: false,
  minify: false,
  sourcemap: "external",
  external: [
    // Keep native dependencies external
    "nodemailer",
    // React must stay external: @react-email/render reaches for react-dom's
    // server renderer through `import("react-dom/server").then(m => m.default)`,
    // and Bun's bundler drops the CJS default export on dynamic imports, which
    // makes every render() call throw. Keeping react/react-dom out of the
    // bundle also guarantees a single React copy at runtime.
    "react",
    "react-dom",
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
