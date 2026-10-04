import type { RenderWorkflowParams } from "@/worker/render-workflow";
import type { SmogRenderer } from "@/worker/renderer";

/**
 * The render bindings, by hand: `wrangler types` reads `wrangler.jsonc`,
 * which never declares them, because the build adds them only when the
 * env's render mode needs them (render-config.ts, phase 7 ruling 2). So
 * they are optional, as `parseWorkerBindings` answers them.
 */
interface RenderBindings {
  /** The `RenderSponsorshipVideo` Workflow (`local` and `container`). */
  RENDER_WORKFLOW?: Workflow<RenderWorkflowParams>;
  /** `SmogRenderer`'s namespace (`container` only). */
  RENDERER?: DurableObjectNamespace<SmogRenderer>;
}

declare global {
  interface Env extends RenderBindings {}
  // biome-ignore lint/style/noNamespace: merges into the `Cloudflare.Env` that `wrangler types` declares.
  namespace Cloudflare {
    // biome-ignore lint/suspicious/noShadow: `wrangler types` declares both the global `Env` and `Cloudflare.Env`; each gets the bindings.
    interface Env extends RenderBindings {}
  }
}
