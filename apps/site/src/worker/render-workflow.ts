import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";

/** The Workflow's params; its instance id is the job id (ruling 4). */
export interface RenderWorkflowParams {
  renderJobId: string;
}

/**
 * The `RenderSponsorshipVideo` Workflow (spec §8.1; phase 7 ruling 4). Its
 * logic is `runRenderJob` in `@smog/sponsorships/server`, wired in task 6;
 * until then nothing creates an instance (the starter is still
 * `pendingRenderStarter`) and `run` only logs. The class is exported from
 * `src/worker.ts` whatever the env's render mode, because the build adds
 * the `RENDER_WORKFLOW` binding only for `local`/`container`
 * (render-config.ts), and a binding needs its class.
 */
export class RenderSponsorshipVideo extends WorkflowEntrypoint<
  Env,
  RenderWorkflowParams
> {
  override run(
    event: WorkflowEvent<RenderWorkflowParams>,
    _step: WorkflowStep
  ): Promise<{ outcome: "noop" }> {
    console.warn(
      `[render] RenderSponsorshipVideo is wired in task 6 (job ${event.payload.renderJobId})`
    );
    return Promise.resolve({ outcome: "noop" });
  }
}
