import type { RenderInput } from "@smog/render/contract";

/**
 * Starts the render of a `queued` render job (phase 6 ruling 7). The site
 * picks one by `RENDER_MODE` (`apps/site/src/worker/render.ts`): `fake`
 * completes at once with the gesture's own video (`fakeRenderStarter`);
 * `container` and `local` create the job's `RenderSponsorshipVideo`
 * Workflow instance (`workflowRenderStarter`, phase 7), or fail the job
 * with `workflowUnavailable` when the env has no `RENDER_WORKFLOW` binding.
 * A start that throws retries the `render.requested` message.
 */
export interface RenderStarter {
  start: (job: { input: RenderInput; renderJobId: string }) => Promise<void>;
}
