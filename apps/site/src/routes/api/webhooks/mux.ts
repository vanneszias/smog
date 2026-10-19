import { createDb } from "@smog/db/client";
import { checkRateLimit } from "@smog/rpc";
import { createMux, handleMuxWebhook } from "@smog/video";
import { createFileRoute } from "@tanstack/react-router";
import { siteEnv } from "../../../server/auth";
import { renderWebhookHooks } from "../../../worker/render";

/**
 * The Mux webhook (spec §8.2, ruling 4). Mux POSTs from its own servers:
 * there is no cookie, so no origin check (`isForeignRequest`); the
 * `Mux-Signature` HMAC is the authentication. It is exempt from
 * maintenance (`/api/webhooks/*`), limited per IP on `RL_API` (Mux retries
 * a 429), and records gesture-upload events in KV for
 * `admin.mux.uploadStatus` (`@smog/video` `handleMuxWebhook`).
 *
 * This env's render job event (`render-job:<ENVIRONMENT>:<id>`
 * passthrough, phase 7 ruling 9, phase 8 ruling 4) goes to its
 * `RenderSponsorshipVideo` instance as `mux-asset-<uploadId>` when the env
 * has the `RENDER_WORKFLOW` binding (`renderWebhookHooks`); a superseded
 * attempt's asset, or an unknown job's, is deleted with this env's Mux
 * client. Another env's render events, and untagged ones, are ignored.
 */
async function handle({ request }: { request: Request }): Promise<Response> {
  const { bindings, db, kv, rateLimits, vars, worker } = siteEnv();
  return await handleMuxWebhook(request, {
    ...renderWebhookHooks(bindings.RENDER_WORKFLOW, createDb(db)),
    environment: vars.ENVIRONMENT,
    kv,
    limit: (key) => checkRateLimit(rateLimits.RL_API, key),
    mux: createMux(worker),
    secret: worker.MUX_WEBHOOK_SECRET,
  });
}

export const Route = createFileRoute("/api/webhooks/mux")({
  server: { handlers: { POST: handle } },
});
