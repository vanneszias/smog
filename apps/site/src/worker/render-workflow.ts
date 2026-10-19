import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { createDb } from "@smog/db/client";
import {
  nonRetryableMessage,
  type RenderJobDeps,
  type RenderJobOutcome,
  type RenderStep,
  runRenderJob,
  toRenderJobFailure,
} from "@smog/sponsorships/server";
import { createMux } from "@smog/video";
import { siteEnv } from "@/server/auth";
import { rendererFor } from "@/worker/renderer";

/** The Workflow's params; its instance id is the job id (ruling 4). */
export interface RenderWorkflowParams {
  renderJobId: string;
}

const TIMED_OUT = /timed out/i;

/** What `waitForEvent` throws when its timeout passes without an event. */
function isWaitTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "WorkflowTimeoutError" || TIMED_OUT.test(error.message))
  );
}

type StepConfig = Parameters<WorkflowStep["do"]>[1];
type StepCallback = Parameters<WorkflowStep["do"]>[2];

/**
 * `runRenderJob`'s `RenderStep` over the Workflow's `step` (ruling 1):
 * - `do` passes the explicit config through, and a non-retryable
 *   `RenderJobFailure` thrown by the work becomes `NonRetryableError` with
 *   the same message (its `[render:<code>]` prefix keeps the code), so the
 *   engine does not retry it;
 * - `waitForEvent` answers the event's payload, or `null` on its timeout.
 */
function renderStepAdapter(step: WorkflowStep): RenderStep {
  return {
    do: async <T>(
      name: string,
      config: StepConfig,
      fn: () => Promise<T>
    ): Promise<T> => {
      const work = async (): Promise<T> => {
        try {
          return await fn();
        } catch (error) {
          const failure = toRenderJobFailure(error);
          if (failure && !failure.retryable) {
            // biome-ignore lint/style/useErrorCause: NonRetryableError(message, name) takes no cause; the message carries the code.
            throw new NonRetryableError(nonRetryableMessage(failure));
          }
          throw error;
        }
      };
      return (await step.do(
        name,
        config as NonNullable<StepConfig>,
        work as unknown as StepCallback
      )) as T;
    },
    sleep: async (name, durationMs) => {
      await step.sleep(name, durationMs);
    },
    waitForEvent: async <T>(
      name: string,
      { timeoutMs, type }: { timeoutMs: number; type: string }
    ): Promise<T | null> => {
      try {
        const event = await step.waitForEvent(name, {
          timeout: timeoutMs,
          type,
        });
        return event.payload as T;
      } catch (error) {
        if (isWaitTimeout(error)) {
          return null;
        }
        throw error;
      }
    },
  };
}

/**
 * The `RenderSponsorshipVideo` Workflow (spec §8.1; phase 7 ruling 4): one
 * instance per render job, its id the job id, created by the starter
 * (`worker/render.ts`). Its logic is `runRenderJob` in
 * `@smog/sponsorships/server`; this class wires the ports from the
 * Worker's env: D1, Mux, the logo from `MEDIA` (ruling 10), the renderer
 * of `RENDER_MODE` (`rendererFor`), the queues and `SITE_URL`.
 *
 * Exported from `src/worker.ts` whatever the env's render mode, because
 * the build adds the `RENDER_WORKFLOW` binding only for `local`/`container`
 * (render-config.ts), and a binding needs its class.
 */
export class RenderSponsorshipVideo extends WorkflowEntrypoint<
  Env,
  RenderWorkflowParams
> {
  /** The ports of one run (a method, so a test can replace them). */
  renderDeps(): RenderJobDeps {
    const { bindings, db, vars, worker } = siteEnv();
    return {
      clock: () => new Date(),
      db: createDb(db),
      environment: vars.ENVIRONMENT,
      mux: createMux(worker),
      queues: { email: bindings.EMAIL_QUEUE, events: bindings.EVENTS_QUEUE },
      readLogo: async (key) => {
        const object = await bindings.MEDIA.get(key);
        return object ? new Uint8Array(await object.arrayBuffer()) : null;
      },
      renderer: rendererFor(
        {
          RENDER_LOCAL_URL: worker.RENDER_LOCAL_URL,
          RENDERER: bindings.RENDERER,
        },
        vars.RENDER_MODE
      ),
      siteUrl: vars.SITE_URL,
    };
  }

  override async run(
    event: WorkflowEvent<RenderWorkflowParams>,
    step: WorkflowStep
  ): Promise<RenderJobOutcome> {
    return await runRenderJob(renderStepAdapter(step), this.renderDeps(), {
      renderJobId: event.payload.renderJobId,
    });
  }
}
