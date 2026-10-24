import type { PdfAssets } from "@smog/pdf";

let cached: Promise<PdfAssets> | null = null;

/**
 * The PDF fonts (Figtree regular and bold) and the logo, loaded once per
 * isolate and only when the first PDF is made: the `?bytes` imports are
 * dynamic, so their chunk stays out of the Worker's startup (and out of
 * every client entry; `scripts/deploy-guard.ts` fails a build where it is
 * not). `build-bytes.ts` turns each file into a module.
 */
export function loadPdfAssets(): Promise<PdfAssets> {
  cached ??= Promise.all([
    import("@smog/pdf/assets/Figtree-Regular.ttf?bytes"),
    import("@smog/pdf/assets/Figtree-Bold.ttf?bytes"),
    import("@smog/pdf/assets/logo.png?bytes"),
  ])
    .then(([regular, bold, logo]) => ({
      boldFont: bold.default,
      logo: logo.default,
      regularFont: regular.default,
    }))
    .catch((error: unknown) => {
      // Do not keep a rejected promise: the next request tries again.
      cached = null;
      console.error("[lesson-pdf] Failed to load the PDF assets:", error);
      throw error;
    });
  return cached;
}
