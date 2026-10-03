import type { WorkerVars } from "@smog/config/env/worker";
import type { Db } from "@smog/db/client";
import type { RenderStarter } from "@smog/jobs";
import { renderStarterFor } from "@smog/sponsorships/server";

/**
 * The `RenderStarter` of this Worker (phase 6 ruling 7), by `RENDER_MODE`:
 * `fake` (dev, tests, e2e and staging until phase 7) completes the job at
 * once with the gesture's own video; `container` and `local` leave it
 * `queued` and log until phase 7, which replaces only this switch with
 * `RENDER_WORKFLOW.create({ id: job.workflowInstanceId, params: { renderJobId } })`.
 */
export function renderStarter(
  vars: Pick<WorkerVars, "RENDER_MODE">,
  db: Db
): RenderStarter {
  return renderStarterFor(vars.RENDER_MODE, { db });
}
