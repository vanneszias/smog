import { createDb, type Db } from "@smog/db/client";
import {
  enqueueOutputs,
  eventMessageSchema,
  type JobQueues,
  type RenderStarter,
} from "@smog/jobs";
import {
  handlePaymentSettled,
  queuedRenderJob,
} from "@smog/sponsorships/server";
import { siteEnv } from "@/server/auth";
import { renderStarter } from "@/worker/render";

/**
 * The `EVENTS_QUEUE` (`smog-<env>-sponsorship-events`) consumer (spec
 * §8.1, phase 6 rulings 7 and 8). One message at a time:
 * - `payment.settled`: `handlePaymentSettled` (`@smog/sponsorships`)
 *   creates the render jobs (one per item, however often it runs) and
 *   returns `render.requested` and the keyed emails, which are enqueued
 *   here (a failed enqueue retries the message: every output is derived
 *   from D1 again);
 * - `render.requested`: a `queued` job is started with this Worker's
 *   `RenderStarter` (`worker/render.ts`); any other job is acked.
 * An invalid message is logged and acked. A failure retries the message
 * after `min(30 × 2^(attempts − 1), 3600)` s; after `max_retries` (10) the
 * platform moves it to `smog-<env>-sponsorship-events-dlq`.
 */

export interface EventsDeps {
  db: Db;
  now?: () => Date;
  queues: JobQueues;
  renderStarter: RenderStarter;
  siteUrl: string;
}

export type EventDecision =
  | { action: "ack" }
  | { action: "retry"; delaySeconds: number };

const MAX_DELAY_S = 3600;

export function eventRetryDelaySeconds(attempts: number): number {
  return Math.min(30 * 2 ** Math.max(attempts - 1, 0), MAX_DELAY_S);
}

/** Handles one message (see the module comment). */
export async function processEventMessage(
  message: { attempts: number; body: unknown; id: string },
  deps: EventsDeps
): Promise<EventDecision> {
  const parsed = eventMessageSchema.safeParse(message.body);
  if (!parsed.success) {
    console.error(`[events-queue] Acked an invalid message ${message.id}`);
    return { action: "ack" };
  }
  const event = parsed.data;
  const now = deps.now?.() ?? new Date();
  try {
    if (event.type === "payment.settled") {
      const outputs = await handlePaymentSettled(deps.db, {
        now,
        paymentId: event.paymentId,
        siteUrl: deps.siteUrl,
      });
      await enqueueOutputs(deps.queues, outputs, { onFailure: "throw" });
      return { action: "ack" };
    }
    const job = await queuedRenderJob(deps.db, event.renderJobId);
    if (job) {
      await deps.renderStarter.start(job);
    } else {
      console.log(
        `[events-queue] Render job ${event.renderJobId} is not queued; acked`
      );
    }
    return { action: "ack" };
  } catch (error) {
    const delaySeconds = eventRetryDelaySeconds(message.attempts);
    console.error(
      `[events-queue] Failed to handle ${event.type} (attempt ${message.attempts}); retrying in ${delaySeconds} s:`,
      error
    );
    return { action: "retry", delaySeconds };
  }
}

export async function handleEventsBatch(
  batch: MessageBatch,
  _env: Env,
  _ctx: ExecutionContext
): Promise<void> {
  const { bindings, db: d1, vars } = siteEnv();
  const db = createDb(d1);
  const queues = { email: bindings.EMAIL_QUEUE, events: bindings.EVENTS_QUEUE };
  const deps: EventsDeps = {
    db,
    queues,
    renderStarter: renderStarter({
      db,
      queues,
      renderWorkflow: bindings.RENDER_WORKFLOW,
      vars,
    }),
    siteUrl: vars.SITE_URL,
  };
  for (const message of batch.messages) {
    // biome-ignore lint/performance/noAwaitInLoops: one message at a time, so a render and its fan-out never race each other.
    const decision = await processEventMessage(message, deps);
    if (decision.action === "retry") {
      message.retry({ delaySeconds: decision.delaySeconds });
    } else {
      message.ack();
    }
  }
}
