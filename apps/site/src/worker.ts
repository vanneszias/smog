import { env as workerEnv } from "cloudflare:workers";
import { captureException, withSentry } from "@sentry/cloudflare";
import { ENVIRONMENTS } from "@smog/config/env/worker";
import handler from "@tanstack/react-start/server-entry";
import { legacyRedirect } from "@/lib/legacy-redirects";
import { handleAuthRequest } from "@/server/auth-handler";
import { loadCategorySlugs, loadGestureSlug } from "@/server/legacy-categories";
import {
  devConnectSources,
  r2ConnectSources,
  respondSecurely,
} from "@/worker/headers";
import {
  BYPASS_PATH,
  handleBypass,
  maintenanceGate,
  SIGN_IN_ONLY,
} from "@/worker/maintenance";
import { monitoringDsn, monitoringOptions } from "@/worker/monitoring";
import { dispatchQueue } from "@/worker/queues";
import { dispatchScheduled } from "@/worker/scheduled";
import { guardedQueue, guardedScheduled } from "@/worker/top-level";

/**
 * The request pipeline, in order: the maintenance gate (503 unless exempt
 * or bypassed; an admin sign-in route goes to the sign-in-only auth), the
 * admin bypass endpoint, the old site's URLs (301, `legacy-redirects.ts`),
 * then TanStack Start with the request's CSP nonce.
 */
async function route(request: Request, nonce: string): Promise<Response> {
  const gate = await maintenanceGate(request);
  if (gate === SIGN_IN_ONLY) {
    return await handleAuthRequest(request, { signInOnly: true });
  }
  if (gate) {
    return gate;
  }
  if (new URL(request.url).pathname === BYPASS_PATH) {
    return await handleBypass(request);
  }
  const redirect = await legacyRedirect(
    request,
    loadCategorySlugs,
    loadGestureSlug
  );
  return redirect ?? (await handler.fetch(request, { context: { nonce } }));
}

/**
 * Site Worker entry. Every response it answers gets the security headers
 * (`worker/headers.ts`), the maintenance 503, the legacy 301s and a 500 for
 * an escaping exception included. `queue` dispatches by queue name
 * (`worker/queues.ts`) and `scheduled` by cron (`worker/scheduled.ts`).
 */
const siteHandler = {
  fetch(request: Request, env: Env): Promise<Response> {
    // Read raw so a broken env still gets a headed 500 (dev: no HSTS).
    const environment =
      ENVIRONMENTS.find((name) => name === env.ENVIRONMENT) ?? "production";
    // The e2e's Mux fake (dev only); `MUX_API_URL` is not in wrangler.jsonc.
    const muxApiUrl = (env as { MUX_API_URL?: unknown }).MUX_API_URL;
    return respondSecurely(environment, (nonce) => route(request, nonce), {
      connectSrc: [
        ...devConnectSources(environment, muxApiUrl),
        ...r2ConnectSources(env.R2_ACCOUNT_ID),
      ],
      onError: (error) => {
        captureException(error, {
          mechanism: { handled: false, type: "auto.function.respond" },
        });
      },
      requestId: request.headers.get("cf-ray") ?? crypto.randomUUID(),
      requestUrl: request.url,
    });
  },

  queue(batch: MessageBatch, env: Env, ctx: ExecutionContext): Promise<void> {
    return guardedQueue(() => dispatchQueue(batch, env, ctx), batch.queue);
  },

  scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    return guardedScheduled(
      () => dispatchScheduled(controller, env, ctx),
      controller.cron
    );
  },
} satisfies ExportedHandler<Env>;

/**
 * Error monitoring (`worker/monitoring.ts`): `withSentry` wraps the handler
 * only when the env has a `SENTRY_DSN`, decided once per isolate. Without
 * one (dev, the tests, an env before Rustrak) the handler runs unwrapped,
 * exactly as before.
 */
export default monitoringDsn(workerEnv)
  ? withSentry(monitoringOptions, siteHandler)
  : siteHandler;
