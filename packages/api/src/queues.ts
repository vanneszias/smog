import { env } from "cloudflare:workers";
import type { AdminQueues } from "@smog/admin/server";

/**
 * The Worker's queue producers (`EMAIL_QUEUE`, `EVENTS_QUEUE`; phase 6
 * ruling 8), read when an admin action enqueues after its commit. A
 * binding that is missing stays `undefined`: the admin logs it and the
 * committed change stands.
 */
export function workerQueues(): AdminQueues {
  const bindings = env as Partial<Pick<Env, "EMAIL_QUEUE" | "EVENTS_QUEUE">>;
  // Cloudflare types a binding as `Queue<unknown>`; the producers validate
  // each message before `send`.
  return {
    email: bindings.EMAIL_QUEUE as AdminQueues["email"],
    events: bindings.EVENTS_QUEUE as AdminQueues["events"],
  };
}
