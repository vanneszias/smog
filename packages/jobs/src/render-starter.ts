import type { RenderInput } from "@smog/render/contract";

/**
 * Starts the render of a `queued` render job (phase 6 ruling 7). The site
 * picks one by `RENDER_MODE` (`apps/site/src/worker/render.ts`): `fake`
 * completes at once with the gesture's own video; `container` and `local`
 * use `pendingRenderStarter` until phase 7 replaces that switch with
 * `RENDER_WORKFLOW.create(…)`.
 */
export interface RenderStarter {
  start: (job: { input: RenderInput; renderJobId: string }) => Promise<void>;
}

/**
 * A starter for a mode that does not exist yet: it logs and leaves the job
 * `queued`, so nothing is lost (production cannot launch before phase 7).
 */
export function pendingRenderStarter(mode: string): RenderStarter {
  return {
    start: () => {
      console.warn(
        `[render] RENDER_MODE=${mode} is not available before phase 7`
      );
      return Promise.resolve();
    },
  };
}
