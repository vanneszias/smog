/**
 * The Worker bindings a public sponsorship procedure needs beyond the rpc
 * context (which carries the validated vars and secrets, not the queues
 * or the bucket): `EVENTS_QUEUE` (`render.requested` after a re-edit) and
 * `MEDIA` (the logo check). The router is built once per isolate, so the
 * bindings are read per call from `cloudflare:workers`; tests inject their
 * own through `SponsorshipsDeps.bindings`.
 */
import { env } from "cloudflare:workers";
import type { EventMessage, QueueProducer } from "@smog/jobs";

export interface SponsorshipBindings {
  EVENTS_QUEUE?: QueueProducer<EventMessage> | undefined;
  MEDIA?: Pick<R2Bucket, "delete" | "get" | "head"> | undefined;
}

/** The running Worker's own bindings (either may be missing: logged by the caller). */
export function workerBindings(): SponsorshipBindings {
  const bindings = env as unknown as SponsorshipBindings;
  return { EVENTS_QUEUE: bindings.EVENTS_QUEUE, MEDIA: bindings.MEDIA };
}
