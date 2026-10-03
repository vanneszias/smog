import { ENVIRONMENTS } from "@smog/config/env/worker";
import handler from "@tanstack/react-start/server-entry";
import { legacyRedirect } from "@/lib/legacy-redirects";
import { handleAuthRequest } from "@/server/auth-handler";
import { loadCategorySlugs } from "@/server/legacy-categories";
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
import { dispatchQueue } from "@/worker/queues";
import { dispatchScheduled } from "@/worker/scheduled";

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
  const redirect = await legacyRedirect(request, loadCategorySlugs);
  return redirect ?? (await handler.fetch(request, { context: { nonce } }));
}

/**
 * Site Worker entry. Every response it answers gets the security headers
 * (`worker/headers.ts`), the maintenance 503, the legacy 301s and a 500 for
 * an escaping exception included. `queue` dispatches by queue name
 * (`worker/queues.ts`) and `scheduled` by cron (`worker/scheduled.ts`).
 */
export default {
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
    });
  },

  queue(batch: MessageBatch, env: Env, ctx: ExecutionContext): Promise<void> {
    return dispatchQueue(batch, env, ctx);
  },

  scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    return dispatchScheduled(controller, env, ctx);
  },
} satisfies ExportedHandler<Env>;
