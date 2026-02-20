/**
 * Generates Android icon assets from adaptive-icon.png:
 *
 * 1. icon.png        — 1024×1024, white logo on #00805F green bg (legacy/Play Store icon)
 * 2. adaptive-icon.png — 1024×1024, white logo on transparent bg (adaptive icon foreground)
 *
 * Run with: bun scripts/generate-icons.mjs
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = resolve(__dirname, "../assets/images");

const INPUT = resolve(assetsDir, "adaptive-icon.png");
const ICON_OUT = resolve(assetsDir, "icon.png");
const ADAPTIVE_OUT = resolve(assetsDir, "adaptive-icon.png");

const SIZE = 1024;
const BG_COLOR = "#00805F";

async function run() {
  // --- 1. Resize adaptive-icon.png to 1024x1024 (transparent bg, logo only) ---
  console.log("Resizing adaptive-icon.png to 1024×1024...");
  const resizedForeground = await sharp(INPUT)
    .resize(SIZE, SIZE, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  await sharp(resizedForeground).toFile(ADAPTIVE_OUT);
  console.log(`  ✓ Saved ${ADAPTIVE_OUT}`);

  // --- 2. Generate icon.png: green bg + white logo composited on top ---
  console.log("Generating icon.png (green background + logo)...");

  // Parse hex color to RGB
  const r = Number.parseInt(BG_COLOR.slice(1, 3), 16);
  const g = Number.parseInt(BG_COLOR.slice(3, 5), 16);
  const b = Number.parseInt(BG_COLOR.slice(5, 7), 16);

  const greenBackground = await sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 3,
      background: { r, g, b },
    },
  })
    .png()
    .toBuffer();

  await sharp(greenBackground)
    .composite([{ input: resizedForeground, blend: "over" }])
    .flatten({ background: { r, g, b } })
    .toFile(ICON_OUT);

  console.log(`  ✓ Saved ${ICON_OUT}`);
  console.log("Done.");
}

run().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
