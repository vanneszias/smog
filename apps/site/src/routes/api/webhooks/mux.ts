import { checkRateLimit } from "@smog/rpc";
import { handleMuxWebhook } from "@smog/video";
import { createFileRoute } from "@tanstack/react-router";
import { siteEnv } from "../../../server/auth";

/**
 * The Mux webhook (spec §8.2, ruling 4). Mux POSTs from its own servers:
 * there is no cookie, so no origin check (`isForeignRequest`); the
 * `Mux-Signature` HMAC is the authentication. It is exempt from
 * maintenance (`/api/webhooks/*`), limited per IP on `RL_API` (Mux retries
 * a 429), and records gesture-upload events in KV for
 * `admin.mux.uploadStatus` (`@smog/video` `handleMuxWebhook`).
 */
async function handle({ request }: { request: Request }): Promise<Response> {
  const { kv, rateLimits, worker } = siteEnv();
  return await handleMuxWebhook(request, {
    kv,
    limit: (key) => checkRateLimit(rateLimits.RL_API, key),
    secret: worker.MUX_WEBHOOK_SECRET,
  });
}

export const Route = createFileRoute("/api/webhooks/mux")({
  server: { handlers: { POST: handle } },
});
