/**
 * Programmatic rendering utility for sponsored videos
 *
 * Usage:
 *   bun run src/render.ts --videoSrc="https://..." --sponsorName="Company" --logoUrl="https://..." --output="out/video.mp4"
 */

import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { SponsoredVideoProps } from "./types/schema";

interface RenderOptions {
  videoSrc: string;
  sponsorName: string;
  logoUrl?: string;
  outputPath?: string;
  onProgress?: (progress: number) => void;
}

export const renderSponsoredVideo = async ({
  videoSrc,
  sponsorName,
  logoUrl,
  outputPath = "out/sponsored-video.mp4",
  onProgress,
}: RenderOptions): Promise<string> => {
  console.log("[remotion] Starting render...");
  console.log("[remotion] Video source:", videoSrc);
  console.log("[remotion] Sponsor:", sponsorName);

  // Bundle the Remotion project
  const bundleLocation = await bundle({
    entryPoint: path.resolve(__dirname, "./index.ts"),
    onProgress: (percent) => {
      if (percent % 10 === 0) {
        console.log(`[remotion] Bundling: ${percent}%`);
      }
    },
  });

  // Input props for the composition
  const inputProps: SponsoredVideoProps = {
    videoSrc,
    sponsorName,
    logoUrl,
  };

  // Select the composition (this runs calculateMetadata to get duration)
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: "SponsoredVideo",
    inputProps,
  });

  console.log(
    `[remotion] Composition duration: ${composition.durationInFrames} frames`
  );
  console.log(
    `[remotion] Composition size: ${composition.width}x${composition.height}`
  );

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  const { mkdir } = await import("node:fs/promises");
  await mkdir(outputDir, { recursive: true });

  // Render the video
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: outputPath,
    inputProps,
    onProgress: ({ progress }) => {
      const percent = Math.round(progress * 100);
      if (percent % 10 === 0) {
        console.log(`[remotion] Rendering: ${percent}%`);
      }
      onProgress?.(percent);
    },
  });

  console.log(`[remotion] Render complete: ${outputPath}`);
  return outputPath;
};

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);

  const getArg = (name: string): string | undefined => {
    const arg = args.find((a) => a.startsWith(`--${name}=`));
    return arg?.split("=")[1];
  };

  const videoSrc = getArg("videoSrc");
  const sponsorName = getArg("sponsorName");
  const logoUrl = getArg("logoUrl");
  const output = getArg("output") || "out/sponsored-video.mp4";

  if (!(videoSrc && sponsorName)) {
    console.error(
      "Usage: bun run src/render.ts --videoSrc=<url> --sponsorName=<name> [--logoUrl=<url>] [--output=<path>]"
    );
    process.exit(1);
  }

  renderSponsoredVideo({
    videoSrc,
    sponsorName,
    logoUrl,
    outputPath: output,
  })
    .then(() => {
      console.log("[remotion] Done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("[remotion] Error:", error);
      process.exit(1);
    });
}
