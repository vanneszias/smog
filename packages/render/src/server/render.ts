/**
 * The render port (phase 7 ruling 7) and its Remotion implementation:
 * `selectComposition` + `renderMedia` over the bundle built into the image,
 * H.264 with JPEG frames (the old `remotion.config.ts`), one frame at a
 * time (`concurrency: 1`, the `standard-2` instance's single vCPU) and
 * Remotion's Docker guidance (`enableMultiProcessOnLinux`). An abort of
 * the caller's signal cancels the render through `makeCancelSignal`.
 */
import {
  makeCancelSignal,
  renderMedia,
  selectComposition,
} from "@remotion/renderer";
import type { SponsoredVideoProps } from "../compositions/props";
import { SPONSORED_VIDEO_ID } from "../contract";
import type { RenderLog } from "./server";

interface RenderArgs {
  /** Aborted when a newer request for the same job replaces this one. */
  cancelSignal: AbortSignal;
  outputPath: string;
  /** Validated with `sponsoredVideoPropsSchema`. */
  props: SponsoredVideoProps;
}

export interface RenderPort {
  render: (args: RenderArgs) => Promise<{ frames: number }>;
}

export interface RemotionRendererOptions {
  /** A Chrome Headless Shell; `null` uses Remotion's own download. */
  browserExecutable: string | null;
  licenseKey: string | null;
  log: RenderLog;
  /** The bundle directory (`bun src/server/bundle.ts`). */
  serveUrl: string;
}

const CHROMIUM_OPTIONS = { enableMultiProcessOnLinux: true } as const;
const PROGRESS_STEP = 0.25;

/** The real port: Remotion in this process (Bun), Chrome as a child. */
export function createRemotionRenderer({
  browserExecutable,
  licenseKey,
  log,
  serveUrl,
}: RemotionRendererOptions): RenderPort {
  return {
    async render({ cancelSignal, outputPath, props }) {
      const cancel = makeCancelSignal();
      const onAbort = (): void => cancel.cancel();
      if (cancelSignal.aborted) {
        throw cancelSignal.reason;
      }
      cancelSignal.addEventListener("abort", onAbort, { once: true });
      try {
        const composition = await selectComposition({
          browserExecutable,
          chromiumOptions: CHROMIUM_OPTIONS,
          id: SPONSORED_VIDEO_ID,
          inputProps: props,
          logLevel: "warn",
          serveUrl,
        });
        let nextProgress = PROGRESS_STEP;
        await renderMedia({
          browserExecutable,
          cancelSignal: cancel.cancelSignal,
          chromiumOptions: CHROMIUM_OPTIONS,
          codec: "h264",
          composition,
          concurrency: 1,
          imageFormat: "jpeg",
          inputProps: props,
          licenseKey,
          logLevel: "warn",
          // The source's size and download time (task 3 review, M-6):
          // `OffthreadVideo` fetches the whole file. Never its URL.
          onDownload: () => {
            const started = Date.now();
            log.info("source download started");
            let done = false;
            return ({ downloaded, percent, totalSize }) => {
              if (!done && percent === 1) {
                done = true;
                log.info("source downloaded", {
                  bytes: totalSize ?? downloaded,
                  ms: Date.now() - started,
                });
              }
            };
          },
          onProgress: ({ progress, renderedFrames }) => {
            if (progress >= nextProgress) {
              nextProgress += PROGRESS_STEP;
              log.info("render progress", {
                percent: Math.round(progress * 100),
                renderedFrames,
              });
            }
          },
          outputLocation: outputPath,
          overwrite: true,
          serveUrl,
        });
        if (cancelSignal.aborted) {
          throw cancelSignal.reason;
        }
        return { frames: composition.durationInFrames };
      } catch (error) {
        // Remotion's cancel error says nothing useful; report the reason.
        if (cancelSignal.aborted) {
          throw cancelSignal.reason;
        }
        throw error;
      } finally {
        cancelSignal.removeEventListener("abort", onAbort);
      }
    },
  };
}
