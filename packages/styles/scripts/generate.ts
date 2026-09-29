/**
 * Writes the generated theme files from the tokens. They are committed;
 * `src/generate.test.ts` fails when they drift. Run after editing tokens:
 * `bun -F @smog/styles generate`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderNativeTailwindConfig } from "../src/generate-native";
import { renderWebThemeCss } from "../src/generate-web";

const OUT = join(import.meta.dir, "../generated");

try {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "theme.css"), renderWebThemeCss());
  writeFileSync(join(OUT, "tailwind-preset.cjs"), renderNativeTailwindConfig());
  console.log("[styles] Wrote generated/theme.css and tailwind-preset.cjs");
} catch (error) {
  console.error("[styles] Failed to write the generated theme:", error);
  throw error;
}
