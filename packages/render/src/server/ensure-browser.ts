/**
 * Makes sure Chrome Headless Shell is there (phase 7 ruling 17): the
 * image's `deps` stage runs it, so Remotion's own download lands in this
 * package's `node_modules/.remotion`, which the runtime stage copies. With
 * `RENDER_BROWSER_EXECUTABLE` (local runs) that browser is used instead.
 * Remotion resolves its download directory from the working directory, so
 * the image runs this and the server from `packages/render`.
 */
import { ensureBrowser } from "@remotion/renderer";
import { parseRenderServerEnv } from "@smog/config/env/render";

/** Remotion does not export the type from its entry. */
type BrowserStatus = Awaited<ReturnType<typeof ensureBrowser>>;

/** A short label of the browser for `GET /health` and the start log. */
export function describeBrowser(status: BrowserStatus): string {
  switch (status.type) {
    case "user-defined-path":
      return "user-defined";
    case "local-puppeteer-browser":
      return "remotion-headless-shell";
    case "version-mismatch":
      return `version-mismatch (${status.actualVersion ?? "unknown"})`;
    default:
      return "none";
  }
}

/** Ensures the browser (downloading Remotion's when none is configured). */
export async function ensureRenderBrowser(
  browserExecutable: string | null
): Promise<BrowserStatus> {
  return await ensureBrowser({ browserExecutable, logLevel: "warn" });
}

if (import.meta.main) {
  const env = parseRenderServerEnv(process.env);
  try {
    const status = await ensureRenderBrowser(
      env.RENDER_BROWSER_EXECUTABLE ?? null
    );
    console.log(`[render] browser: ${describeBrowser(status)}`);
    if (status.type === "no-browser") {
      process.exit(1);
    }
  } catch (error) {
    console.error("[render] Failed to ensure the browser:", error);
    process.exit(1);
  }
}
