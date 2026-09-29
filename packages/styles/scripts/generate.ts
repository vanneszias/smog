/**
 * Writes the generated theme files from the tokens. They are committed;
 * `src/generate.test.ts` fails when they drift. Run after editing tokens:
 * `bun -F @smog/styles generate`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { renderNativeTailwindConfig } from "../src/generate-native";
import { renderWebThemeCss } from "../src/generate-web";

const OUT = new URL("../generated/", import.meta.url);

try {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(new URL("theme.css", OUT), renderWebThemeCss());
  writeFileSync(
    new URL("tailwind-preset.cjs", OUT),
    renderNativeTailwindConfig()
  );
  console.log("[styles] Wrote generated/theme.css and tailwind-preset.cjs");
} catch (error) {
  console.error("[styles] Failed to write the generated theme:", error);
  throw error;
}
