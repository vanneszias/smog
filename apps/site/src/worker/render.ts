import type { WorkerVars } from "@smog/config/env/worker";
import type { Db } from "@smog/db/client";
import { enqueueOutputs, type JobQueues, type RenderStarter } from "@smog/jobs";
import {
  failRender,
  fakeRenderStarter,
  isCurrentRenderUpload,
  RenderJobFailure,
  renderEventType,
  summariseRenderError,
  type WorkflowInstanceState,
} from "@smog/sponsorships/server";
import type { MuxWebhookOptions, RenderMuxEvent } from "@smog/video";
import type { RenderWorkflowParams } from "@/worker/render-workflow";
import { isInstanceNotFound } from "@/worker/scheduled";

/** The part of `RENDER_WORKFLOW` the starter uses. */
export interface WorkflowCreateBinding {
  create: (options: {
    id: string;
    params: RenderWorkflowParams;
  }) => Promise<unknown>;
}

/**
 * What `create` throws for an id that exists: the code
 * `instance.already_exists` (Miniflare 4: `(instance.already_exists)
 * Workflow instance with id "…" already exists`; the engine uses the same
 * code). Pinned against the installed runtime by `render-starter.test.ts`.
 */
const ALREADY_EXISTS = /\binstance\.already_exists\b/;

function isAlreadyExists(error: unknown): boolean {
  return error instanceof Error && ALREADY_EXISTS.test(error.message);
}

export interface StarterDeps {
  clock?: () => Date;
  db: Db;
  queues: JobQueues;
  siteUrl: string;
}

/**
 * The starter of `RENDER_MODE` `container` and `local` (phase 7 ruling 4,
 * carry 1): `RENDER_WORKFLOW.create({ id: renderJobId, params })`, the
 * instance id being the job's `workflow_instance_id` (its id).
 * - An instance that already exists counts as started: a second
 *   `render.requested` (a redelivery, the watchdog's re-send) is a no-op.
 * - Any other error is thrown, so the message is retried.
 * - Without the binding (ruling 11) the job fails at once with
 *   `workflowUnavailable` (`failRender` and its keyed admin emails), so
 *   nothing stays `queued`.
 */
export function workflowRenderStarter(
  binding: WorkflowCreateBinding | undefined,
  { clock = () => new Date(), db, queues, siteUrl }: StarterDeps
): RenderStarter {
  return {
    start: async ({ renderJobId }) => {
      if (!binding) {
        const error = summariseRenderError(
          new RenderJobFailure(
            "workflowUnavailable",
            "this env has no RENDER_WORKFLOW binding"
          )
        );
        console.error(`[render] Render job ${renderJobId} failed: ${error}`);
        const result = await failRender(db, {
          error,
          now: clock(),
          renderJobId,
          siteUrl,
        });
        await enqueueOutputs(
          queues,
          { events: [], notify: result.notify },
          { onFailure: "throw" }
        );
        return;
      }
      try {
        await binding.create({ id: renderJobId, params: { renderJobId } });
      } catch (error) {
        if (isAlreadyExists(error)) {
          console.log(
            `[render] The Workflow of render job ${renderJobId} exists already`
          );
          return;
        }
        console.error(
          `[render] Failed to start the Workflow of render job ${renderJobId}:`,
          error
        );
        throw error;
      }
    },
  };
}

/**
 * The `RenderStarter` of this Worker, by `RENDER_MODE` (phase 6 ruling 7,
 * phase 7 ruling 4): `fake` (dev, tests, e2e, and staging until the owner
 * turns the pipeline on) completes the job at once with the gesture's own
 * video; `container` and `local` start its Workflow.
 */
export function renderStarter({
  db,
  queues,
  renderWorkflow,
  vars,
}: {
  db: Db;
  queues: JobQueues;
  renderWorkflow: WorkflowCreateBinding | undefined;
  vars: Pick<WorkerVars, "RENDER_MODE" | "SITE_URL">;
}): RenderStarter {
  return vars.RENDER_MODE === "fake"
    ? fakeRenderStarter(db)
    : workflowRenderStarter(renderWorkflow, {
        db,
        queues,
        siteUrl: vars.SITE_URL,
      });
}

/** The part of `RENDER_WORKFLOW` the Mux webhook uses. */
export interface WorkflowEventBinding {
  get: (id: string) => Promise<{
    sendEvent: (event: { payload: unknown; type: string }) => Promise<void>;
    status: () => Promise<Pick<WorkflowInstanceState, "status">>;
  }>;
}

/** An instance in one of these has no wait left to end. */
const ENDED: ReadonlySet<string> = new Set([
  "complete",
  "errored",
  "terminated",
]);

/**
 * The Mux webhook's render hooks (phase 7 ruling 9, W-02), or none
 * without the `RENDER_WORKFLOW` binding (`fake` mode creates no render
 * uploads: a render event is logged and answered 200).
 * - `onRenderEvent`: `sendEvent({ type: mux-asset-<uploadId>, payload })`
 *   to the job's instance (its id is the job id). An unknown instance, or
 *   one that is `complete`/`errored`/`terminated`, is `gone` (200). A
 *   failed `get` (other than not found), `status` or `sendEvent` throws,
 *   and the webhook answers 503 so Mux retries.
 * - `isCurrentUpload`: `isCurrentRenderUpload`, one D1 row (an unknown
 *   job of this env is not current, so its asset is deleted; phase 8
 *   ruling 12).
 */
export function renderWebhookHooks(
  binding: WorkflowEventBinding | undefined,
  db: Db
): Pick<MuxWebhookOptions, "isCurrentUpload" | "onRenderEvent"> {
  if (!binding) {
    return {};
  }
  return {
    isCurrentUpload: (renderJobId, uploadId, assetId) =>
      isCurrentRenderUpload(db, { assetId, renderJobId, uploadId }),
    onRenderEvent: async (event: RenderMuxEvent) => {
      let instance: Awaited<ReturnType<WorkflowEventBinding["get"]>>;
      try {
        instance = await binding.get(event.renderJobId);
      } catch (error) {
        if (isInstanceNotFound(error)) {
          console.log(
            `[render] No Workflow for render job ${event.renderJobId}: ${event.type} not forwarded`
          );
          return "gone";
        }
        throw error;
      }
      const { status } = await instance.status();
      if (ENDED.has(status)) {
        console.log(
          `[render] The Workflow of render job ${event.renderJobId} is ${status}: ${event.type} not forwarded`
        );
        return "gone";
      }
      await instance.sendEvent({
        payload: event,
        type: await renderEventType(event.uploadId),
      });
      return "sent";
    },
  };
}
